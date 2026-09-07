alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select using (id = public.current_org_id());

-- No direct INSERT policy: creation only happens via create_organization_with_admin().
create policy organizations_update on public.organizations
  for update using (id = public.current_org_id() and public.current_user_role() = 'ADMIN')
  with check (id = public.current_org_id());

alter table public.organization_settings enable row level security;

create policy organization_settings_select on public.organization_settings
  for select using (organization_id = public.current_org_id());

create policy organization_settings_update on public.organization_settings
  for update using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN')
  with check (organization_id = public.current_org_id());

alter table public.profiles enable row level security;

-- Every org member can see their teammates; everyone can always see themselves
-- (covers the moment right after signup, before organization_id is set).
create policy profiles_select on public.profiles
  for select using (organization_id = public.current_org_id() or id = auth.uid());

-- Self-service updates (e.g. full_name) plus ADMIN managing teammates.
-- protect_profile_privileges() trigger blocks a non-admin from smuggling a
-- role/org change through their own allowed self-update.
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN'))
  with check (id = auth.uid() or (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN'));

-- No INSERT/DELETE policies: rows are created by the handle_new_user() trigger
-- and are never hard-deleted (use is_active instead).
