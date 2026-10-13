alter table public.exhibition_participation_plans
  add column if not exists historical_event_year smallint,
  add column if not exists historical_leads_count integer,
  add column if not exists historical_qualified_count integer,
  add column if not exists historical_quoted_count integer,
  add column if not exists historical_deals_count integer,
  add column if not exists historical_effect_note text;

alter table public.exhibition_participation_plans
  drop constraint if exists exhibition_historical_results_valid,
  add constraint exhibition_historical_results_valid check (
    (historical_event_year is null and historical_leads_count is null and historical_qualified_count is null and historical_quoted_count is null and historical_deals_count is null and historical_effect_note is null)
    or
    (historical_event_year between 2000 and 2100
      and historical_leads_count is not null and historical_qualified_count is not null
      and historical_quoted_count is not null and historical_deals_count is not null
      and historical_leads_count >= 0
      and historical_qualified_count between 0 and historical_leads_count
      and historical_quoted_count between 0 and historical_qualified_count
      and historical_deals_count between 0 and historical_quoted_count
      and (historical_effect_note is null or char_length(historical_effect_note) between 2 and 500))
  );

create or replace function public.get_exhibition_participation_context()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; payload jsonb; can_view_budget boolean;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号无权查看参展计划'; end if;
  can_view_budget:=actor.role in ('owner','marketing');
  select jsonb_build_object(
    'can_edit', actor.role in ('owner','marketing') and coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false)=false,
    'can_view_budget',can_view_budget,
    'plans',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'event_key',p.event_key,'event_name',p.event_name,'status',p.participation_status,
      'owner_id',p.owner_id,'owner_name',o.full_name,'updated_at',p.updated_at,
      'budget_amount',case when can_view_budget then p.budget_amount else null end,
      'budget_currency',case when can_view_budget then p.budget_currency else null end,
      'booth_price',p.booth_price,'booth_price_currency',p.booth_price_currency,
      'booth_price_unit',p.booth_price_unit,'booth_price_source_url',p.booth_price_source_url,
      'booth_price_checked_on',p.booth_price_checked_on,
      'target_customer_segments',p.target_customer_segments,'target_regions',p.target_regions,
      'target_buyer_roles',p.target_buyer_roles,'target_customer_note',p.target_customer_note,
      'historical_event_year',p.historical_event_year,'historical_leads_count',p.historical_leads_count,
      'historical_qualified_count',p.historical_qualified_count,'historical_quoted_count',p.historical_quoted_count,
      'historical_deals_count',p.historical_deals_count,'historical_effect_note',p.historical_effect_note
    ) order by p.event_key) from public.exhibition_participation_plans p left join public.profiles o on o.id=p.owner_id),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name) from public.profiles p where p.active=true and not coalesce(p.is_test_data,false) and p.data_environment='production'),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

create or replace function public.save_exhibition_historical_results(
  target_event_key text,target_event_year integer,target_leads_count integer,
  target_qualified_count integer,target_quoted_count integer,target_deals_count integer,
  target_effect_note text,change_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; previous public.exhibition_participation_plans; saved public.exhibition_participation_plans;
  note text:=nullif(trim(coalesce(target_effect_note,'')),''); clearing boolean:=target_event_year is null;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','marketing') or coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false) then
    raise exception '仅可编辑的老板或市场部账号可维护展会历史效果';
  end if;
  select * into previous from public.exhibition_participation_plans where event_key=target_event_key for update;
  if previous.id is null then raise exception '请先保存公司参展状态和负责人'; end if;
  if clearing and (target_leads_count is not null or target_qualified_count is not null or target_quoted_count is not null or target_deals_count is not null or note is not null) then raise exception '清空历史效果时请清空全部字段'; end if;
  if not clearing and (target_event_year not between 2000 and 2100 or target_leads_count is null or target_qualified_count is null or target_quoted_count is null or target_deals_count is null) then raise exception '请完整填写上届年份和四项效果数据'; end if;
  if not clearing and (target_leads_count<0 or target_qualified_count<0 or target_qualified_count>target_leads_count or target_quoted_count<0 or target_quoted_count>target_qualified_count or target_deals_count<0 or target_deals_count>target_quoted_count) then raise exception '历史效果数量必须满足线索、有效客户、报价客户、成交客户的递减关系'; end if;
  if note is not null and char_length(note) not between 2 and 500 then raise exception '复盘说明需为 2–500 字'; end if;
  if length(trim(coalesce(change_reason,''))) not between 4 and 500 then raise exception '请填写 4–500 字的变更原因'; end if;
  update public.exhibition_participation_plans set
    historical_event_year=target_event_year,historical_leads_count=target_leads_count,
    historical_qualified_count=target_qualified_count,historical_quoted_count=target_quoted_count,
    historical_deals_count=target_deals_count,historical_effect_note=note,
    updated_by=actor.id,updated_at=now()
  where id=previous.id returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'exhibition_participation',saved.id,'exhibition_historical_results_updated',to_jsonb(previous),to_jsonb(saved),trim(change_reason));
  return jsonb_build_object('event_key',saved.event_key,'updated_at',saved.updated_at);
end $$;

revoke all on function public.save_exhibition_historical_results(text,integer,integer,integer,integer,integer,text,text) from public,anon;
grant execute on function public.save_exhibition_historical_results(text,integer,integer,integer,integer,integer,text,text) to authenticated;
