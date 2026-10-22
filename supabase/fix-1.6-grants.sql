-- IBRAHI8M EDU STUDIO 1.6.0 — fix: signed-in users could not read their own profile (HTTP 403, 42501).
-- Newer Supabase projects do not grant table privileges to the API roles automatically, and schema.sql 1.5.x
-- did not grant them, so sign-in succeeded but loading the role failed on the web and on Windows.
-- Grants only what the app needs; RLS policies and the protect_profile trigger still decide WHICH rows and columns.
-- Roles: admin (أدمن), teacher (معلم), student (طالب). Safe to run again.
-- Undo: revoke select, update on public.profiles from authenticated;
begin;
revoke all on table public.profiles from anon, authenticated;            -- incl. TRUNCATE, which bypasses RLS
grant select on table public.profiles to authenticated;                   -- RLS: own row, or all rows for an admin
grant update (display_name, role, disabled, learner_name) on table public.profiles to authenticated;
                                                                          -- RLS + trigger: only an admin changes role/status
revoke all on function public.is_admin() from public, anon;  -- functions are executable by PUBLIC by default
grant execute on function public.is_admin() to authenticated;             -- used inside the RLS policies
commit;
