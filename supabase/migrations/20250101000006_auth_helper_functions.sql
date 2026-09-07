-- SECURITY DEFINER + fixed search_path so these can be called from inside
-- RLS policies (including on public.profiles itself) without recursing
-- through the caller's own RLS or being hijacked via search_path tricks.

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_org is not null and target_org = public.current_org_id();
$$;

create or replace function public.has_any_role(roles user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = any(roles);
$$;

comment on function public.current_org_id() is 'Organization of the calling authenticated user. Used throughout RLS policies.';
comment on function public.has_any_role(user_role[]) is 'True if the calling user''s role is one of the given roles.';

-- Now that current_user_role() exists, wire up the self-service privilege guard.
-- The app.bypass_profile_privilege_check escape hatch exists solely for
-- trusted SECURITY DEFINER flows (e.g. create_organization_with_admin below)
-- that legitimately need to set a brand-new user's first role/org — it is a
-- transaction-local (set_config(..., true)) setting, never a session-wide one.
--
-- organization_id is never changeable through a plain UPDATE, even by an
-- ADMIN: the profiles_update RLS policy lets a user update their OWN row
-- regardless of organization_id, so without this an ADMIN could "join"
-- another tenant simply by setting their own organization_id — the exact
-- cross-tenant-by-changing-IDs attack this schema must prevent. Moving
-- between organizations is intentionally only possible via a controlled,
-- bypass-flagged path (today: create_organization_with_admin, for a user who
-- doesn't have one yet).
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.bypass_profile_privilege_check', true), 'false') = 'true' then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed directly';
  end if;

  if new.role is distinct from old.role and public.current_user_role() is distinct from 'ADMIN' then
    raise exception 'Only an ADMIN can change role';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Bootstraps a brand-new organization for a signed-in user who does not
-- belong to one yet, and makes them its ADMIN. SECURITY DEFINER is required
-- to get past the chicken-and-egg RLS problem (you can't INSERT a row that
-- satisfies "organization_id = current_org_id()" before you have one).
create or replace function public.create_organization_with_admin(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;

  if exists (
    select 1 from public.profiles where id = auth.uid() and organization_id is not null
  ) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (name, slug) values (org_name, org_slug) returning id into new_org_id;
  insert into public.organization_settings (organization_id) values (new_org_id);

  perform set_config('app.bypass_profile_privilege_check', 'true', true);

  update public.profiles
  set organization_id = new_org_id, role = 'ADMIN'
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found for current user';
  end if;

  return new_org_id;
end;
$$;

revoke all on function public.create_organization_with_admin(text, text) from public;
grant execute on function public.create_organization_with_admin(text, text) to authenticated;
