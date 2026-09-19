begin;
alter table public.plus_profiles add column if not exists role text not null default 'doctor' check(role in ('student','doctor'));
alter table public.plus_profiles alter column crm drop not null;
alter table public.plus_profiles alter column uf drop not null;
create or replace function public.plus_save_profile(uid uuid, full_name text, profile_role text, crm_number text, state_uf text) returns void
language sql security definer set search_path=public as $$
 insert into plus_profiles(user_id,name,role,crm,uf) values(uid,full_name,profile_role,case when profile_role='doctor' then crm_number end,case when profile_role='doctor' then state_uf end)
 on conflict(user_id) do update set name=excluded.name,role=excluded.role,crm=excluded.crm,uf=excluded.uf,
 verified_at=case when excluded.role='doctor' and plus_profiles.role=excluded.role and plus_profiles.name=excluded.name and plus_profiles.crm=excluded.crm and plus_profiles.uf=excluded.uf then plus_profiles.verified_at else null end;
$$;
revoke all on function public.plus_save_profile(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.plus_save_profile(uuid,text,text,text,text) to service_role;
create or replace function public.plus_start_trial(uid uuid) returns void
language sql security definer set search_path=public as $$
 update plus_profiles set trial_started_at=now() where user_id=uid and (role='student' or (role='doctor' and verified_at is not null)) and trial_started_at is null;
$$;
revoke all on function public.plus_start_trial(uuid) from public,anon,authenticated;
grant execute on function public.plus_start_trial(uuid) to service_role;
commit;
