create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notifications_read_at_requires_is_read check (read_at is null or is_read)
);

create index notifications_organization_id_idx on public.notifications(organization_id);
create index notifications_recipient_id_idx on public.notifications(recipient_id, is_read, created_at desc);

-- RLS is row-scoped, not column-scoped: without this, the recipient UPDATE
-- policy below would let a recipient rewrite their own notification's
-- content, not just its read state.
create or replace function public.protect_notification_content()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.type is distinct from old.type
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.metadata is distinct from old.metadata
    or new.organization_id is distinct from old.organization_id
    or new.recipient_id is distinct from old.recipient_id
  then
    raise exception 'Only is_read/read_at may be updated on a notification';
  end if;
  return new;
end;
$$;

create trigger notifications_protect_content
  before update on public.notifications
  for each row execute function public.protect_notification_content();

alter table public.notifications enable row level security;

-- Recipients see only their own notifications (narrower than the usual
-- whole-org read policy, since these are personal, not shared, records).
create policy notifications_select on public.notifications
  for select using (organization_id = public.current_org_id() and recipient_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert with check (
    organization_id = public.current_org_id()
    and public.has_any_role(array['ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST']::user_role[])
  );

-- A recipient may only mark their own notification read/unread, not edit its content.
create policy notifications_update on public.notifications
  for update using (organization_id = public.current_org_id() and recipient_id = auth.uid())
  with check (organization_id = public.current_org_id() and recipient_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete using (organization_id = public.current_org_id() and recipient_id = auth.uid());
