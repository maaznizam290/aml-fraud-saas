create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  external_transaction_id text,
  direction transaction_direction not null,
  amount numeric(18, 2) not null,
  currency char(3) not null default 'USD',
  channel text not null,
  status transaction_status not null default 'COMPLETED',
  counterparty_name text,
  counterparty_account text,
  counterparty_country char(2),
  origin_country char(2),
  destination_country char(2),
  device_id text,
  device_is_new boolean not null default false,
  ip_address inet,
  transaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint transactions_amount_non_negative check (amount >= 0),
  constraint transactions_org_external_id_unique unique (organization_id, external_transaction_id)
);

create index transactions_organization_id_idx on public.transactions(organization_id);
create index transactions_customer_id_idx on public.transactions(customer_id);
create index transactions_transaction_at_idx on public.transactions(organization_id, transaction_at desc);
create index transactions_amount_idx on public.transactions(organization_id, amount);
create index transactions_status_idx on public.transactions(organization_id, status);

comment on table public.transactions is 'Immutable transaction ledger entries. No updated_at: corrections are new rows/status transitions, not edits.';

alter table public.transactions enable row level security;

create policy transactions_select on public.transactions
  for select using (organization_id = public.current_org_id());

create policy transactions_insert on public.transactions
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

create policy transactions_update on public.transactions
  for update using (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER']::user_role[])
  )
  with check (organization_id = public.current_org_id());

create policy transactions_delete on public.transactions
  for delete using (organization_id = public.current_org_id() and public.current_user_role() = 'ADMIN');
