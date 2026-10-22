-- IBRAHI8M EDU STUDIO 1.5.0 — accounts and roles on Supabase.
-- Run once: Supabase dashboard → SQL Editor → paste this file → Run.
-- Safe to run again (idempotent).

-- 1) One profile per account. The role lives here, on the server.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'student' check (role in ('admin', 'teacher', 'student')),
  learner_name text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2) Helper: is the caller an (active) admin? security definer so the check itself is not blocked by RLS.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not disabled);
$$;

-- 3) Policies: read your own profile; admins read and manage everyone. Nobody else can change roles.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());

drop policy if exists "admin reads all" on public.profiles;
create policy "admin reads all" on public.profiles for select using (public.is_admin());

drop policy if exists "admin updates all" on public.profiles;
create policy "admin updates all" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- A user may change only their own display name: role, disabled and learner_name are protected by the trigger below.
drop policy if exists "update own name" on public.profiles;
create policy "update own name" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the dashboard SQL editor (the project owner): allowed
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.disabled is distinct from old.disabled
       or new.learner_name is distinct from old.learner_name or new.email is distinct from old.email then
      raise exception 'only an admin can change roles or account status';
    end if;
  end if;
  -- never leave the project without an active admin
  if old.role = 'admin' and (new.role <> 'admin' or new.disabled)
     and (select count(*) from public.profiles where role = 'admin' and not disabled and id <> old.id) = 0 then
    raise exception 'the last admin cannot be removed';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles for each row execute function public.protect_profile();

-- 4) Every new account starts as a student (never admin by default).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'student')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 5) Make the owner the admin — ONCE, after creating the owner's account in the app (or in Authentication → Users).
--    Only someone with access to this dashboard can run it; owning an e-mail address is not enough.
-- update public.profiles set role = 'admin' where email = 'ibrahimyasf@gmail.com';
