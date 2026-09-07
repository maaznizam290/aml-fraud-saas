-- Tenants. RLS is enabled in 20250101000007_org_profile_rls.sql, once the
-- helper functions it depends on (which read from profiles) exist.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint organizations_name_not_blank check (btrim(name) <> '')
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

comment on table public.organizations is 'Tenants. Every business record is scoped to one organization via organization_id.';

-- One-to-one tenant configuration, kept separate from organizations so
-- operational metadata and free-form settings don't widen the core row.
create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  risk_thresholds jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_settings_set_updated_at
  before update on public.organization_settings
  for each row execute function public.set_updated_at();

comment on table public.organization_settings is 'Per-tenant configuration (risk thresholds, notification preferences, misc settings).';
