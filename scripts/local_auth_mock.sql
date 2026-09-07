-- Minimal stand-in for the parts of Supabase's built-in `auth` schema that
-- our migrations reference (auth.users, auth.identities, auth.uid(), and the
-- authenticated/anon/service_role roles). Used ONLY for local validation of
-- this branch's migrations/seed against a plain Postgres instance where the
-- real Supabase platform schema isn't present. Never applied to a real
-- Supabase project (which already provides the genuine auth schema).
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token text,
  recovery_token text,
  email_change_token_new text,
  email_change text
);

create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  identity_data jsonb,
  provider text,
  provider_id text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public, auth to authenticated, anon, service_role;

-- Real Supabase projects grant these to anon/authenticated/service_role at
-- provisioning time (with matching ALTER DEFAULT PRIVILEGES so future
-- tables inherit them too) — RLS then does the actual row-level narrowing
-- on top. Replicated here only so this table-privilege layer exists when
-- validating against a plain, non-Supabase-provisioned Postgres instance.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
