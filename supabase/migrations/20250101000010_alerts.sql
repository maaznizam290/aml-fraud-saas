create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  related_transaction_ids uuid[] not null default '{}',
  alert_type alert_type not null,
  severity alert_severity not null default 'MEDIUM',
  status investigation_state not null default 'RECEIVED',
  source alert_source not null default 'RULE_ENGINE',
  triggered_rules jsonb not null default '[]'::jsonb,
  risk_score numeric(5, 4) check (risk_score is null or risk_score between 0 and 1),
  ml_score numeric(5, 4) check (ml_score is null or ml_score between 0 and 1),
  assigned_analyst_id uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alerts_resolved_at_requires_resolved_status check (
    resolved_at is null or status = 'RESOLVED'
  )
);

create index alerts_organization_id_idx on public.alerts(organization_id);
create index alerts_customer_id_idx on public.alerts(customer_id);
create index alerts_transaction_id_idx on public.alerts(transaction_id);
create index alerts_status_idx on public.alerts(organization_id, status);
create index alerts_severity_idx on public.alerts(organization_id, severity);
create index alerts_assigned_analyst_id_idx on public.alerts(assigned_analyst_id);
create index alerts_opened_at_idx on public.alerts(organization_id, opened_at desc);

create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

comment on table public.alerts is 'Drives the investigation lifecycle. status doubles as the investigation state (RECEIVED..RESOLVED). Never set to RESOLVED by anything other than a recorded human/case decision.';

alter table public.alerts enable row level security;

create policy alerts_select on public.alerts
  for select using (organization_id = public.current_org_id());

create policy alerts_insert on public.alerts
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

-- ADMIN/COMPLIANCE_MANAGER can touch any alert in the org; an ANALYST may
-- only update alerts assigned to them or currently unassigned (e.g. to claim it).
create policy alerts_update on public.alerts
  for update using (
    organization_id = public.current_org_id()
    and (
      public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
      or (public.current_user_role() = 'ANALYST' and (assigned_analyst_id = auth.uid() or assigned_analyst_id is null))
    )
  )
  with check (organization_id = public.current_org_id());

create policy alerts_delete on public.alerts
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');
