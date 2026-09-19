begin;
-- Plus administrators are managed only through the trusted database console.
create table if not exists public.plus_admins (
 user_id uuid primary key references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.plus_admins enable row level security;
revoke all on public.plus_admins from public,anon,authenticated;
grant all on public.plus_admins to service_role;
commit;
