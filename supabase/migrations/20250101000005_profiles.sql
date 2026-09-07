-- Application-level user record, 1:1 with auth.users. organization_id is
-- nullable so a freshly signed-up user can exist before joining/creating an
-- organization (see create_organization_with_admin in the next migration).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email text not null,
  full_name text,
  role user_role not null default 'ANALYST',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles(organization_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Application profile for an auth.users identity: organization membership + role.';

-- Auto-create a profile whenever a new Supabase Auth user is created.
-- organization_id/role can be seeded from signup metadata (e.g. an invite
-- flow); otherwise the user starts unassigned until they join/create an org.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'organization_id', '')::uuid,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::user_role, 'ANALYST')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
