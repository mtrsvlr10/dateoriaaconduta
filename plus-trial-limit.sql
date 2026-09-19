begin;
alter table public.plus_profiles add column if not exists trial_analyses_used integer not null default 0 check(trial_analyses_used>=0 and trial_analyses_used<=25);
-- Operational identifiers only; no patient data.
create table if not exists public.plus_trial_requests (
 id uuid primary key,
 user_id uuid not null references public.plus_profiles(user_id),
 created_at timestamptz not null default now()
);
alter table public.plus_trial_requests enable row level security;
revoke all on public.plus_trial_requests from public,anon,authenticated;
grant all on public.plus_trial_requests to service_role;
create or replace function public.plus_reserve_trial(uid uuid, request_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update plus_profiles set trial_analyses_used=trial_analyses_used+1
 where user_id=uid and trial_analyses_used<25 and trial_started_at>now()-interval '120 hours'
 and (role='student' or (role='doctor' and verified_at is not null));
 if not found then return false; end if;
 insert into plus_trial_requests(id,user_id) values(request_id,uid);
 return true;
end; $$;
create or replace function public.plus_refund_trial(uid uuid, request_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 -- Same lock order as reservation; deleting the receipt makes refunds idempotent.
 perform 1 from plus_profiles where user_id=uid for update;
 delete from plus_trial_requests where id=request_id and user_id=uid;
 if found then update plus_profiles set trial_analyses_used=greatest(0,trial_analyses_used-1) where user_id=uid; end if;
end; $$;
revoke all on function public.plus_reserve_trial(uuid,uuid),public.plus_refund_trial(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plus_reserve_trial(uuid,uuid),public.plus_refund_trial(uuid,uuid) to service_role;
commit;
