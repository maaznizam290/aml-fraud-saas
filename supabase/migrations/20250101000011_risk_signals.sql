create table public.risk_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  alert_id uuid references public.alerts(id) on delete set null,
  signal_type risk_signal_type not null,
  weight numeric(5, 4) check (weight is null or weight between 0 and 1),
  value jsonb not null default '{}'::jsonb,
  description text,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index risk_signals_organization_id_idx on public.risk_signals(organization_id);
create index risk_signals_customer_id_idx on public.risk_signals(customer_id);
create index risk_signals_alert_id_idx on public.risk_signals(alert_id);
create index risk_signals_signal_type_idx on public.risk_signals(organization_id, signal_type);

comment on table public.risk_signals is 'Normalized deterministic risk signals (rule engine output). Computed independently of, and optionally attached to, an alert.';

alter table public.risk_signals enable row level security;

create policy risk_signals_select on public.risk_signals
  for select using (organization_id = public.current_org_id());

create policy risk_signals_insert on public.risk_signals
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy risk_signals_delete on public.risk_signals
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: a signal is a point-in-time observation, superseded by a
-- new row rather than mutated.
