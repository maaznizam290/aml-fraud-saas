-- Storage foundation only. The Hermes learning engine (write paths, retrieval
-- ranking, embeddings) is owned by feature/hermes-learning — this branch just
-- provides a tenant-safe place to persist it.
create table public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category memory_category not null,
  subject_type text,
  subject_id uuid,
  content jsonb not null default '{}'::jsonb,
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_memory_organization_id_idx on public.agent_memory(organization_id);
create index agent_memory_category_idx on public.agent_memory(organization_id, category);
create index agent_memory_subject_idx on public.agent_memory(organization_id, subject_type, subject_id);

create trigger agent_memory_set_updated_at
  before update on public.agent_memory
  for each row execute function public.set_updated_at();

alter table public.agent_memory enable row level security;

create policy agent_memory_select on public.agent_memory
  for select using (organization_id = public.current_org_id());

create policy agent_memory_insert on public.agent_memory
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy agent_memory_update on public.agent_memory
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy agent_memory_delete on public.agent_memory
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

create table public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  version text not null default '0.1.0',
  status skill_status not null default 'DRAFT',
  source text not null default 'built-in',
  governance_state governance_status not null default 'PROPOSED',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_skills_org_name_version_unique unique (organization_id, name, version)
);

create index agent_skills_organization_id_idx on public.agent_skills(organization_id);
create index agent_skills_status_idx on public.agent_skills(organization_id, status);

create trigger agent_skills_set_updated_at
  before update on public.agent_skills
  for each row execute function public.set_updated_at();

comment on table public.agent_skills is 'Governance record for a Hermes capability. Reaching ACTIVE/DEPLOYED here records an approval already made elsewhere — this table does not itself deploy anything.';

alter table public.agent_skills enable row level security;

create policy agent_skills_select on public.agent_skills
  for select using (organization_id = public.current_org_id());

create policy agent_skills_write on public.agent_skills
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  );

create policy agent_skills_update on public.agent_skills
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy agent_skills_delete on public.agent_skills
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

create table public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  ai_recommendation_id uuid references public.ai_recommendations(id) on delete set null,
  analyst_id uuid not null references public.profiles(id) on delete restrict,
  feedback_type feedback_type not null,
  decision text,
  rating smallint check (rating is null or rating between 1 and 5),
  comments text,
  learning_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_feedback_organization_id_idx on public.agent_feedback(organization_id);
create index agent_feedback_alert_id_idx on public.agent_feedback(alert_id);
create index agent_feedback_ai_recommendation_id_idx on public.agent_feedback(ai_recommendation_id);

comment on table public.agent_feedback is 'Analyst feedback on AI output, the raw material for Hermes learning. Recording feedback never itself changes agent_skills/model_versions/rule_versions state.';

alter table public.agent_feedback enable row level security;

create policy agent_feedback_select on public.agent_feedback
  for select using (organization_id = public.current_org_id());

create policy agent_feedback_insert on public.agent_feedback
  for insert with check (
    organization_id = public.current_org_id()
    and analyst_id = auth.uid()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy agent_feedback_delete on public.agent_feedback
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- No UPDATE policy: feedback is a permanent record; corrections are new rows.
