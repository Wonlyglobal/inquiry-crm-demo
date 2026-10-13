create table if not exists public.exhibition_participation_plans (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_name text not null,
  participation_status text not null default 'researching' check (participation_status in ('researching','planned','registered','attending','declined')),
  owner_id uuid references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.exhibition_participation_plans enable row level security;
revoke all on public.exhibition_participation_plans from public, anon, authenticated;

create or replace function public.get_exhibition_participation_context()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor public.profiles; payload jsonb;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号无权查看参展计划'; end if;
  select jsonb_build_object(
    'can_edit', actor.role in ('owner','marketing') and coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false)=false,
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'event_key',p.event_key,'event_name',p.event_name,
      'status',p.participation_status,'owner_id',p.owner_id,
      'owner_name',o.full_name,'updated_at',p.updated_at
    ) order by p.event_key) from public.exhibition_participation_plans p left join public.profiles o on o.id=p.owner_id),'[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name)
      from public.profiles p where p.active=true and not coalesce(p.is_test_data,false) and p.data_environment='production'),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

create or replace function public.save_exhibition_participation_plan(
  target_event_key text,
  target_event_name text,
  target_status text,
  target_owner_id uuid,
  change_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor public.profiles; owner_profile public.profiles; previous public.exhibition_participation_plans; saved public.exhibition_participation_plans;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','marketing') or coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false) then raise exception '仅可编辑的老板或市场部账号可维护参展计划'; end if;
  if target_event_key is null or target_event_key !~ '^[a-z0-9-]{3,100}$' then raise exception '展会标识无效'; end if;
  if length(trim(coalesce(target_event_name,''))) not between 2 and 200 then raise exception '展会名称无效'; end if;
  if target_status not in ('researching','planned','registered','attending','declined') then raise exception '参展状态无效'; end if;
  if target_status <> 'declined' and target_owner_id is null then raise exception '请为该参展计划指定负责人'; end if;
  if length(trim(coalesce(change_reason,''))) not between 4 and 500 then raise exception '请填写 4–500 字的变更原因'; end if;
  if target_owner_id is not null then
    select * into owner_profile from public.profiles where id=target_owner_id and active=true and not coalesce(is_test_data,false) and data_environment='production';
    if owner_profile.id is null then raise exception '负责人必须是有效的生产成员'; end if;
  end if;
  select * into previous from public.exhibition_participation_plans where event_key=target_event_key for update;
  insert into public.exhibition_participation_plans(event_key,event_name,participation_status,owner_id,updated_by)
  values(target_event_key,trim(target_event_name),target_status,target_owner_id,actor.id)
  on conflict(event_key) do update set event_name=excluded.event_name,participation_status=excluded.participation_status,owner_id=excluded.owner_id,updated_by=actor.id,updated_at=now()
  returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'exhibition_participation',saved.id,'exhibition_participation_updated',case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(saved),trim(change_reason));
  return jsonb_build_object('id',saved.id,'event_key',saved.event_key,'status',saved.participation_status,'owner_id',saved.owner_id,'owner_name',owner_profile.full_name,'updated_at',saved.updated_at);
end $$;

revoke all on function public.get_exhibition_participation_context() from public,anon;
revoke all on function public.save_exhibition_participation_plan(text,text,text,uuid,text) from public,anon;
grant execute on function public.get_exhibition_participation_context() to authenticated;
grant execute on function public.save_exhibition_participation_plan(text,text,text,uuid,text) to authenticated;
