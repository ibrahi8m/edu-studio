// Local PostgreSQL (PGlite) check of supabase/schema.sql: reproduces the 403 and tests the roles. NOT the live server.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const full = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
const before = full.slice(0, full.indexOf('-- 5) Table privileges'));         // = schema.sql 1.5.x
const grants = full.slice(full.indexOf('-- 5) Table privileges'), full.indexOf('-- 6) Make the owner'));
const results = []; let failed = 0;
const ok = (name, pass, detail = '') => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!pass) failed++; };

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    revoke execute on all functions in schema public from public;`);
  return db;
}
const A = '00000000-0000-0000-0000-00000000000a', T = '00000000-0000-0000-0000-00000000000b', S = '00000000-0000-0000-0000-00000000000c';
async function seed(db) {
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}','owner@x.test','{"display_name":"المالك"}'), ('${T}','teacher@x.test','{}'), ('${S}','student@x.test','{}');
    update public.profiles set role='admin' where id='${A}'; update public.profiles set role='teacher' where id='${T}';`);
}
async function as(db, role, uid, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { const r = await db.query(sql); return { rows: r.rows, affected: r.affectedRows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role'); }
}

// 1) schema.sql 1.5.x on a new project: reproduce the live failure
{
  const db = await fresh(); await db.exec(before); await seed(db);
  const r = await as(db, 'authenticated', A, `select role from public.profiles where id='${A}'`);
  ok('1.5.x schema: signed-in owner cannot read own profile (the live 403 / 42501)', !!r.error && /permission denied/.test(r.error), r.error);
}
// 2) schema.sql 1.6.0
const db = await fresh(); await db.exec(before + grants); await seed(db);
let r;
r = await as(db, 'authenticated', A, `select role from public.profiles where id='${A}'`);
ok('owner (admin) reads own profile → role admin', r.rows?.[0]?.role === 'admin', JSON.stringify(r.rows ?? r.error));
r = await as(db, 'authenticated', A, `select count(*)::int n from public.profiles`);
ok('admin lists all profiles', r.rows?.[0]?.n === 3);
r = await as(db, 'authenticated', S, `select id, role from public.profiles`);
ok('student sees only own profile', r.rows?.length === 1 && r.rows[0].role === 'student');
r = await as(db, 'authenticated', T, `select id from public.profiles`);
ok('teacher sees only own profile', r.rows?.length === 1);
r = await as(db, 'authenticated', S, `update public.profiles set role='admin' where id='${S}'`);
ok('student cannot make self admin', !!r.error, r.error);
r = await as(db, 'authenticated', T, `update public.profiles set role='admin' where id='${T}'`);
ok('teacher cannot make self admin', !!r.error, r.error);
r = await as(db, 'authenticated', S, `update public.profiles set disabled=true where id='${T}'`);
ok('student cannot change another account (0 rows)', !r.error && r.affected === 0, r.error ?? `affected ${r.affected}`);
r = await as(db, 'authenticated', T, `update public.profiles set role='teacher' where id='${S}'`);
ok('teacher cannot promote a student (0 rows)', !r.error && r.affected === 0, r.error ?? `affected ${r.affected}`);
r = await as(db, 'authenticated', S, `update public.profiles set display_name='اسمي' where id='${S}'`);
ok('student may change own display name', !r.error && r.affected === 1, r.error);
r = await as(db, 'authenticated', S, `update public.profiles set email='x@y.z' where id='${S}'`);
ok('nobody changes e-mail through the API (column not granted)', !!r.error, r.error);
r = await as(db, 'authenticated', S, `insert into public.profiles (id,email,role) values (gen_random_uuid(),'a@b.c','admin')`);
ok('no INSERT through the API', !!r.error, r.error);
r = await as(db, 'authenticated', A, `delete from public.profiles where id='${S}'`);
ok('no DELETE through the API (even admin)', !!r.error, r.error);
r = await as(db, 'authenticated', S, `truncate public.profiles`);
ok('no TRUNCATE (would bypass RLS)', !!r.error, r.error);
r = await as(db, 'anon', null, `select * from public.profiles`);
ok('anon (not signed in) reads nothing', !!r.error, r.error);
r = await as(db, 'authenticated', A, `update public.profiles set role='teacher' where id='${S}'`);
ok('admin promotes a student to teacher', !r.error && r.affected === 1, r.error);
r = await as(db, 'authenticated', A, `update public.profiles set role='student' where id='${A}'`);
ok('the last admin cannot be demoted', !!r.error && /last admin/.test(r.error), r.error);
r = await as(db, 'authenticated', A, `update public.profiles set disabled=true where id='${A}'`);
ok('the last admin cannot be disabled', !!r.error && /last admin/.test(r.error), r.error);
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values (gen_random_uuid(),'new@x.test','{"display_name":"جديد","role":"admin"}')`);
r = await db.query(`select role from public.profiles where email='new@x.test'`);
ok('a new sign-up is always student (even if it asks for admin)', r.rows[0]?.role === 'student');
await db.exec(`update public.profiles set disabled=true where id='${T}'`); // dashboard (no JWT): allowed
r = await as(db, 'authenticated', T, `update public.profiles set role='admin' where id='${T}'`);
ok('a disabled teacher cannot escalate', !!r.error, r.error);
r = await as(db, 'authenticated', A, `select public.is_admin() as a`);
ok('is_admin() works for the admin inside policies', r.rows?.[0]?.a === true);
r = await as(db, 'anon', null, `select public.is_admin()`);
ok('anon cannot call is_admin()', !!r.error);
console.log(results.join('\n')); console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
