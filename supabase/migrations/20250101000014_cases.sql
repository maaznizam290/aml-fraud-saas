create sequence public.case_number_seq;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_number text not null unique,
  alert_id uuid references public.alerts(id) on delete set null,
  related_alert_ids uuid[] not null default '{}',
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_analyst_id uuid references public.profiles(id) on delete set null,
  status case_status not null default 'OPEN',
  priority case_priority not null default 'MEDIUM',
  disposition case_disposition,
  resolution_reason text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_resolution_requires_closed_status check (
    (disposition is null and resolution_reason is null) or status in ('RESOLVED', 'CLOSED')
  )
);

create index cases_organization_id_idx on public.cases(organization_id);
create index cases_customer_id_idx on public.cases(customer_id);
create index cases_alert_id_idx on public.cases(alert_id);
create index cases_status_idx on public.cases(organization_id, status);
create index cases_assigned_analyst_id_idx on public.cases(assigned_analyst_id);

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

create or replace function public.set_case_number()
returns trigger
language plpgsql
as $$
begin
  if new.case_number is null then
    new.case_number := 'CASE-' || lpad(nextval('public.case_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger cases_set_case_number
  before insert on public.cases
  for each row execute function public.set_case_number();

comment on table public.cases is 'A case aggregates the investigation of one (or more related) alerts to a documented resolution. disposition/resolution_reason record a human decision, never an automated one.';

alter table public.cases enable row level security;

create policy cases_select on public.cases
  for select using (organization_id = public.current_org_id());

create policy cases_insert on public.cases
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy cases_update on public.cases
  for update using (
    organization_id = public.current_org_id()
    and (
      public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
      or (public.current_user_role() = 'ANALYST' and (assigned_analyst_id = auth.uid() or assigned_analyst_id is null))
    )
  )
  with check (organization_id = public.current_org_id());

create policy cases_delete on public.cases
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index case_events_organization_id_idx on public.case_events(organization_id);
create index case_events_case_id_idx on public.case_events(case_id, occurred_at);

comment on table public.case_events is 'Chronological investigation history for a case (a human-readable subset of the full audit_logs trail).';

alter table public.case_events enable row level security;

create policy case_events_select on public.case_events
  for select using (organization_id = public.current_org_id());

create policy case_events_insert on public.case_events
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy case_events_delete on public.case_events
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: events are an append-only history.
