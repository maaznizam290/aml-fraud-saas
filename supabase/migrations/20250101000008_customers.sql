create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_customer_id text not null,
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  country_code char(2),
  status customer_status not null default 'ACTIVE',
  risk_rating risk_level not null default 'LOW',
  kyc_status kyc_status not null default 'PENDING',
  account_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_org_external_id_unique unique (organization_id, external_customer_id)
);

create index customers_organization_id_idx on public.customers(organization_id);
create index customers_status_idx on public.customers(organization_id, status);
create index customers_risk_rating_idx on public.customers(organization_id, risk_rating);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy customers_select on public.customers
  for select using (organization_id = public.current_org_id());

create policy customers_insert on public.customers
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy customers_update on public.customers
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy customers_delete on public.customers
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');

-- Extended KYC/behavioral profile, split out from customers so the
-- frequently-joined core row stays narrow.
create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  occupation text,
  employer text,
  expected_monthly_volume numeric(18, 2),
  average_transaction_amount numeric(18, 2),
  typical_countries char(2)[] not null default '{}',
  typical_beneficiaries jsonb not null default '[]'::jsonb,
  behavioral_baseline jsonb not null default '{}'::jsonb,
  sanctions_status sanctions_status not null default 'PENDING_REVIEW',
  sanctions_checked_at timestamptz,
  pep_status boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_profiles_organization_id_idx on public.customer_profiles(organization_id);

create trigger customer_profiles_set_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_updated_at();

alter table public.customer_profiles enable row level security;

create policy customer_profiles_select on public.customer_profiles
  for select using (organization_id = public.current_org_id());

create policy customer_profiles_insert on public.customer_profiles
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy customer_profiles_update on public.customer_profiles
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy customer_profiles_delete on public.customer_profiles
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');
