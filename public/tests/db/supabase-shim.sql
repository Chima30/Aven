-- =============================================================================
-- TEST-ONLY shim that recreates the small part of Supabase that AVEN's
-- migrations depend on, so RLS can be tested against plain PostgreSQL in CI.
--
-- It mirrors Supabase behaviour that matters for security:
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.users and auth.uid() reading the JWT "sub" claim
--   * Supabase's default privileges, which GRANT ALL on new public tables to
--     anon and authenticated — so the tests prove our explicit REVOKEs work.
--
-- This file is NEVER run against a real Supabase project.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on table auth.users to service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase defaults (deliberately permissive — migrations must tighten them).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
