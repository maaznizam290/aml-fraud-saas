create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index audit_logs_entity_idx on public.audit_logs(organization_id, entity_type, entity_id);
create index audit_logs_correlation_id_idx on public.audit_logs(correlation_id);
create index audit_logs_created_at_idx on public.audit_logs(organization_id, created_at desc);

comment on table public.audit_logs is E'Append-only audit trail. entity_type/entity_id is a loose (non-FK) polymorphic '
  'reference by design, so this table survives even if the referenced row is later deleted. '
  'Standard action values: alert_created, investigation_started, evidence_collected, '
  'ml_prediction_generated, ai_recommendation_generated, analyst_decision_recorded, '
  'case_created, case_updated, case_resolved, model_version_used, rule_version_used, '
  'hermes_learning_event, configuration_changed. metadata must never contain secrets or credentials.';

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select using (organization_id = public.current_org_id());

-- Callers may only ever log themselves as the actor (or an explicit system
-- event with actor_id null) — never impersonate another user in the trail.
create policy audit_logs_insert on public.audit_logs
  for insert with check (
    organization_id = public.current_org_id()
    and (actor_id = auth.uid() or actor_id is null)
  );

-- Deliberately no UPDATE or DELETE policy, for anyone, including ADMIN:
-- the audit trail is immutable once written.
