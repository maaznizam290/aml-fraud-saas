-- organization_id is nullable: null represents a platform-wide model shared
-- across all tenants; a set value represents a tenant-specific fine-tuned
-- model. Only platform operations (service role / migrations) can write
-- platform-wide rows — see RLS below.
create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  model_name text not null,
  version text not null,
  provider text not null,
  model_type text not null,
  status governance_status not null default 'PROPOSED',
  metrics jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index model_versions_organization_id_idx on public.model_versions(organization_id);
create index model_versions_model_name_idx on public.model_versions(model_name, version);

create trigger model_versions_set_updated_at
  before update on public.model_versions
  for each row execute function public.set_updated_at();

comment on table public.model_versions is 'ML model governance record. Reaching DEPLOYED here documents an approval made by a human; this table has no automatic deployment behavior.';

alter table public.model_versions enable row level security;

create policy model_versions_select on public.model_versions
  for select using (organization_id is null or organization_id = public.current_org_id());

create policy model_versions_insert on public.model_versions
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  );

create policy model_versions_update on public.model_versions
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  )
  with check (organization_id = public.current_org_id());

-- Platform-wide (organization_id is null) rows are managed out-of-band
-- (service role / migrations), not through tenant RLS.

alter table public.ml_predictions
  add constraint ml_predictions_model_version_id_fkey
  foreign key (model_version_id) references public.model_versions(id) on delete set null;

create index ml_predictions_model_version_id_idx on public.ml_predictions(model_version_id);

create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_name text not null,
  version text not null,
  definition jsonb not null,
  status governance_status not null default 'PROPOSED',
  proposed_by uuid references public.profiles(id) on delete set null,
  proposed_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_versions_org_name_version_unique unique (organization_id, rule_name, version)
);

create index rule_versions_organization_id_idx on public.rule_versions(organization_id);
create index rule_versions_rule_name_idx on public.rule_versions(organization_id, rule_name);

create trigger rule_versions_set_updated_at
  before update on public.rule_versions
  for each row execute function public.set_updated_at();

comment on table public.rule_versions is 'Deterministic rule-engine governance record, versioned per tenant. Reaching DEPLOYED here documents an approval made by a human.';

alter table public.rule_versions enable row level security;

create policy rule_versions_select on public.rule_versions
  for select using (organization_id = public.current_org_id());

create policy rule_versions_insert on public.rule_versions
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  );

create policy rule_versions_update on public.rule_versions
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy rule_versions_delete on public.rule_versions
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');
