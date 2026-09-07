create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  disposition recommendation_disposition not null,
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  risk_level risk_level not null,
  rationale text not null,
  red_flags jsonb not null default '[]'::jsonb,
  supporting_evidence jsonb not null default '[]'::jsonb,
  contradictory_evidence jsonb not null default '[]'::jsonb,
  recommended_next_steps jsonb not null default '[]'::jsonb,
  ml_score_assessment text,
  investigation_summary text,
  provider text not null,
  model_name text not null,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_recommendations_organization_id_idx on public.ai_recommendations(organization_id);
create index ai_recommendations_alert_id_idx on public.ai_recommendations(alert_id);

comment on table public.ai_recommendations is 'AI-generated recommendation only. disposition is never auto-applied — see analyst_decisions and CLAUDE.md Critical Rule.';

alter table public.ai_recommendations enable row level security;

create policy ai_recommendations_select on public.ai_recommendations
  for select using (organization_id = public.current_org_id());

create policy ai_recommendations_insert on public.ai_recommendations
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy ai_recommendations_delete on public.ai_recommendations
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: a recommendation is immutable once generated; a revised
-- assessment is a new row.

create table public.analyst_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  ai_recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  analyst_id uuid not null references public.profiles(id) on delete restrict,
  decision recommendation_disposition not null,
  agreed_with_ai boolean,
  override_reason text,
  notes text,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint analyst_decisions_override_reason_required check (
    agreed_with_ai is distinct from false or override_reason is not null
  )
);

create index analyst_decisions_organization_id_idx on public.analyst_decisions(organization_id);
create index analyst_decisions_alert_id_idx on public.analyst_decisions(alert_id);
create index analyst_decisions_analyst_id_idx on public.analyst_decisions(analyst_id);

comment on table public.analyst_decisions is 'The human decision of record for an alert. This — never ai_recommendations — is what authorizes downstream action.';

alter table public.analyst_decisions enable row level security;

create policy analyst_decisions_select on public.analyst_decisions
  for select using (organization_id = public.current_org_id());

create policy analyst_decisions_insert on public.analyst_decisions
  for insert with check (
    organization_id = public.current_org_id()
    and analyst_id = auth.uid()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy analyst_decisions_delete on public.analyst_decisions
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: a decision is a permanent record; corrections are new rows.
