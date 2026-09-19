-- Execute depois de supabase.sql. Nenhum dado clínico é armazenado nestas tabelas.
create table if not exists public.plus_profiles (
  user_id uuid primary key references auth.users(id),
  name text not null,
  crm text not null,
  uf text not null,
  verified_at timestamptz,
  trial_started_at timestamptz
);
create table if not exists public.plus_orders (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  plan_id text not null check(plan_id in ('monthly','quarterly','semester','annual')),
  amount numeric(10,2) not null check(amount>0),
  provider_id text,
  checkout_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index if not exists plus_one_pending on public.plus_orders(user_id) where status in ('pending','authorized');
create table if not exists public.plus_rate_limits (
  user_id uuid primary key references auth.users(id),
  next_request_at timestamptz not null
);
alter table public.plus_profiles enable row level security;
alter table public.plus_orders enable row level security;
alter table public.plus_rate_limits enable row level security;
revoke all on public.plus_profiles,public.plus_orders,public.plus_rate_limits from anon,authenticated;
grant all on public.plus_profiles,public.plus_orders,public.plus_rate_limits to service_role;
create or replace function public.plus_start_trial(uid uuid) returns void
language sql security definer set search_path = public as $$
  update plus_profiles set trial_started_at=now()
  where user_id=uid and verified_at is not null and trial_started_at is null;
$$;
revoke all on function public.plus_start_trial(uuid) from public,anon,authenticated;
grant execute on function public.plus_start_trial(uuid) to service_role;
-- Atomic cooldown across server instances. Contains no patient data.
create or replace function public.plus_take_slot(uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare claimed uuid;
begin
  insert into plus_rate_limits(user_id,next_request_at) values(uid,now()+interval '30 seconds')
  on conflict(user_id) do update set next_request_at=excluded.next_request_at
  where plus_rate_limits.next_request_at<=now() returning user_id into claimed;
  return claimed is not null;
end; $$;
revoke all on function public.plus_take_slot(uuid) from public,anon,authenticated;
grant execute on function public.plus_take_slot(uuid) to service_role;
