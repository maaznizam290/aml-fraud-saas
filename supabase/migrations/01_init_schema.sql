-- AML Fraud SaaS — MVP consolidated schema
--
-- Tenancy model: every business row carries org_id. Row-Level Security scopes
-- reads to the caller's own organization via the auth_org_id() helper below.
-- Writes to transactions / alerts / hermes_rules happen from the Express
-- gateway using the Supabase service-role key (which bypasses RLS), because
-- the gateway is the only component allowed to run the fraud-scoring and
-- Hermes governance logic. The chief_compliance_officer promotion check for
-- hermes_rules is therefore enforced in application code (server/routes),
-- not in a database policy — documented here so the tradeoff isn't silent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamp with time zone default now()
);

create table profiles (
    id uuid primary key references auth.users(id),
    org_id uuid references organizations(id),
    email text unique not null,
    role text check (role in ('analyst', 'chief_compliance_officer')),
    created_at timestamp with time zone default now()
);

create table transactions (
    id text primary key,
    org_id uuid references organizations(id),
    amount_pkr numeric not null,
    sender_id text not null,
    recipient_id text not null,
    device_fingerprint text,
    status text check (status in ('APPROVED', 'BLOCKED', 'PENDING_REVIEW')),
    ml_score float,
    -- Snapshot of the risk features the score was computed from
    -- (velocity_last_24h, account_age_days, device_risk_score). Kept so
    -- Hermes rule synthesis can backtest proposed heuristics against real
    -- historical transactions, not just the seed dataset.
    ml_features jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table alerts (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations(id),
    transaction_id text references transactions(id),
    alert_type text not null,
    risk_level text check (risk_level in ('LOW', 'MEDIUM', 'HIGH')),
    hermes_brief text,
    status text check (status in ('OPEN', 'RESOLVED_APPROVED', 'RESOLVED_BLOCKED')),
    assigned_analyst uuid references profiles(id),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table hermes_rules (
    id text primary key,
    org_id uuid references organizations(id),
    rule_name text not null,
    conditions jsonb not null,
    status text check (status in ('PENDING', 'DEPLOYED', 'ARCHIVED')),
    accuracy_rating float,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger transactions_set_updated_at
    before update on transactions
    for each row execute function set_updated_at();

create trigger alerts_set_updated_at
    before update on alerts
    for each row execute function set_updated_at();

create trigger hermes_rules_set_updated_at
    before update on hermes_rules
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index transactions_org_id_idx on transactions(org_id);
create index transactions_status_idx on transactions(status);
create index alerts_org_id_idx on alerts(org_id);
create index alerts_status_idx on alerts(status);
create index alerts_transaction_id_idx on alerts(transaction_id);
create index hermes_rules_org_id_idx on hermes_rules(org_id);
create index hermes_rules_status_idx on hermes_rules(status);

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

create or replace function auth_org_id()
returns uuid as $$
    select org_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_role()
returns text as $$
    select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table alerts enable row level security;
alter table hermes_rules enable row level security;

create policy organizations_select_own on organizations
    for select using (id = auth_org_id());

create policy profiles_select_own_org on profiles
    for select using (org_id = auth_org_id());

create policy profiles_update_self on profiles
    for update using (id = auth.uid());

create policy transactions_select_own_org on transactions
    for select using (org_id = auth_org_id());

create policy alerts_select_own_org on alerts
    for select using (org_id = auth_org_id());

create policy hermes_rules_select_own_org on hermes_rules
    for select using (org_id = auth_org_id());

-- Note: no INSERT/UPDATE policies are defined for transactions, alerts, or
-- hermes_rules. Those writes are performed exclusively by the Express
-- gateway using the service-role key, which bypasses RLS entirely. This
-- keeps the fraud-scoring and Hermes governance rules (including the
-- chief_compliance_officer promotion gate) as a single application-layer
-- code path instead of being duplicated/diverging into SQL policies.
