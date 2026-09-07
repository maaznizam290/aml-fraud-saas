-- Generic home for a proposed Hermes learning improvement that doesn't fit
-- neatly into agent_skills/model_versions/rule_versions (e.g. an evidence
-- prioritization suggestion, a false-positive pattern, or a prompt
-- improvement proposal). Those three tables already carry their own
-- governance_status lifecycle for skill/model/rule-shaped changes
-- specifically; this table gives every OTHER improvement type the same
-- PROPOSED -> REVIEW -> APPROVED -> VERSIONED -> DEPLOYED lifecycle,
-- optionally pointing at one of those tables when the candidate IS a
-- skill/model/rule change.
--
-- This table only ever records a human's decision about a proposal.
-- Nothing in this schema (or the application code in feature/hermes-learning)
-- applies a candidate automatically — see CLAUDE.md Critical Rule.
create type improvement_type as enum (
  'SKILL_REFINEMENT',
  'EVIDENCE_PRIORITIZATION',
  'FALSE_POSITIVE_PATTERN',
  'PROMPT_IMPROVEMENT',
  'MODEL_RECOMMENDATION',
  'RULE_RECOMMENDATION'
);

create table public.learning_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  improvement_type improvement_type not null,
  title text not null,
  description text not null,
  payload jsonb not null default '{}'::jsonb,
  supporting_feedback_ids uuid[] not null default '{}',
  status governance_status not null default 'PROPOSED',
  related_skill_id uuid references public.agent_skills(id) on delete set null,
  related_model_version_id uuid references public.model_versions(id) on delete set null,
  related_rule_version_id uuid references public.rule_versions(id) on delete set null,
  proposed_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  versioned_at timestamptz,
  deployed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_candidates_title_not_blank check (btrim(title) <> '')
);

create index learning_candidates_organization_id_idx on public.learning_candidates(organization_id);
create index learning_candidates_status_idx on public.learning_candidates(organization_id, status);
create index learning_candidates_type_idx on public.learning_candidates(organization_id, improvement_type);

create trigger learning_candidates_set_updated_at
  before update on public.learning_candidates
  for each row execute function public.set_updated_at();

comment on table public.learning_candidates is 'A proposed Hermes learning improvement. Application code (feature/hermes-learning) enforces the PROPOSED->REVIEW->APPROVED->VERSIONED->DEPLOYED ordering; this table records the outcome of each step but never applies one automatically.';

alter table public.learning_candidates enable row level security;

create policy learning_candidates_select on public.learning_candidates
  for select using (organization_id = public.current_org_id());

create policy learning_candidates_insert on public.learning_candidates
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

-- Only ADMIN/COMPLIANCE_MANAGER can move a candidate through governance —
-- an ANALYST can propose one (insert) but not approve their own proposal.
create policy learning_candidates_update on public.learning_candidates
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy learning_candidates_delete on public.learning_candidates
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');
