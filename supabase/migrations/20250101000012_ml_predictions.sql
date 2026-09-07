create table public.ml_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  alert_id uuid references public.alerts(id) on delete set null,
  -- FK to public.model_versions(id) is added once that table exists, in
  -- 20250101000022_model_versions.sql.
  model_version_id uuid,
  provider text not null,
  model_name text not null,
  prediction text not null,
  score numeric(5, 4) not null check (score between 0 and 1),
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  features jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ml_predictions_organization_id_idx on public.ml_predictions(organization_id);
create index ml_predictions_customer_id_idx on public.ml_predictions(customer_id);
create index ml_predictions_alert_id_idx on public.ml_predictions(alert_id);

comment on table public.ml_predictions is 'Raw ML model output. score alone must never be treated as an adverse decision — see CLAUDE.md Critical Rule.';

alter table public.ml_predictions enable row level security;

create policy ml_predictions_select on public.ml_predictions
  for select using (organization_id = public.current_org_id());

create policy ml_predictions_insert on public.ml_predictions
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy ml_predictions_delete on public.ml_predictions
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: predictions are immutable observations.
