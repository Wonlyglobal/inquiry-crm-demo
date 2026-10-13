alter table public.exhibition_participation_plans
  add column if not exists milestone_timeline jsonb not null default '[]'::jsonb;

alter table public.exhibition_participation_plans
  drop constraint if exists exhibition_milestone_timeline_array,
  add constraint exhibition_milestone_timeline_array check (jsonb_typeof(milestone_timeline)='array' and jsonb_array_length(milestone_timeline)<=7);

create or replace function public.get_exhibition_participation_context()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; payload jsonb; can_view_budget boolean;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号无权查看参展计划'; end if;
  can_view_budget:=actor.role in ('owner','marketing');
  select jsonb_build_object(
    'can_edit',actor.role in ('owner','marketing') and coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false)=false,
    'can_view_budget',can_view_budget,
    'plans',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'event_key',p.event_key,'event_name',p.event_name,'status',p.participation_status,
      'owner_id',p.owner_id,'owner_name',o.full_name,'updated_at',p.updated_at,
      'budget_amount',case when can_view_budget then p.budget_amount else null end,'budget_currency',case when can_view_budget then p.budget_currency else null end,
      'booth_price',p.booth_price,'booth_price_currency',p.booth_price_currency,'booth_price_unit',p.booth_price_unit,
      'booth_price_source_url',p.booth_price_source_url,'booth_price_checked_on',p.booth_price_checked_on,
      'target_customer_segments',p.target_customer_segments,'target_regions',p.target_regions,'target_buyer_roles',p.target_buyer_roles,'target_customer_note',p.target_customer_note,
      'historical_event_year',p.historical_event_year,'historical_leads_count',p.historical_leads_count,'historical_qualified_count',p.historical_qualified_count,
      'historical_quoted_count',p.historical_quoted_count,'historical_deals_count',p.historical_deals_count,'historical_effect_note',p.historical_effect_note,
      'milestone_timeline',p.milestone_timeline
    ) order by p.event_key) from public.exhibition_participation_plans p left join public.profiles o on o.id=p.owner_id),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name) from public.profiles p where p.active=true and not coalesce(p.is_test_data,false) and p.data_environment='production'),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

create or replace function public.save_exhibition_milestones(target_event_key text,target_milestones jsonb,change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; previous public.exhibition_participation_plans; saved public.exhibition_participation_plans; item jsonb; kinds text[]:='{}'; kind text; due text; state text; note text;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','marketing') or coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false) then raise exception '仅可编辑的老板或市场部账号可维护展会关键节点'; end if;
  select * into previous from public.exhibition_participation_plans where event_key=target_event_key for update;
  if previous.id is null then raise exception '请先保存公司参展状态和负责人'; end if;
  if jsonb_typeof(target_milestones)<>'array' or jsonb_array_length(target_milestones)>7 then raise exception '关键节点格式不正确'; end if;
  for item in select value from jsonb_array_elements(target_milestones) loop
    kind:=item->>'type'; due:=item->>'due_date'; state:=item->>'status'; note:=nullif(trim(coalesce(item->>'note','')),'');
    if kind is null or kind not in ('registration','payment','visa','samples','logistics','setup','teardown') or kind=any(kinds) then raise exception '关键节点类型无效或重复'; end if;
    if due is null or due!~'^\d{4}-\d{2}-\d{2}$' then raise exception '请为每个关键节点填写有效日期'; end if;
    perform due::date;
    if state is null or state not in ('planned','completed') then raise exception '关键节点状态无效'; end if;
    if note is not null and char_length(note)>200 then raise exception '节点说明不能超过 200 字'; end if;
    kinds:=array_append(kinds,kind);
  end loop;
  if length(trim(coalesce(change_reason,''))) not between 4 and 500 then raise exception '请填写 4–500 字的变更原因'; end if;
  update public.exhibition_participation_plans set milestone_timeline=target_milestones,updated_by=actor.id,updated_at=now() where id=previous.id returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'exhibition_participation',saved.id,'exhibition_milestones_updated',to_jsonb(previous),to_jsonb(saved),trim(change_reason));
  return jsonb_build_object('event_key',saved.event_key,'updated_at',saved.updated_at);
end $$;

revoke all on function public.save_exhibition_milestones(text,jsonb,text) from public,anon;
grant execute on function public.save_exhibition_milestones(text,jsonb,text) to authenticated;
