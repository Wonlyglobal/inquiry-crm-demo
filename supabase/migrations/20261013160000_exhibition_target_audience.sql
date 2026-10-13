alter table public.exhibition_participation_plans
  add column if not exists target_customer_segments text[] not null default '{}',
  add column if not exists target_regions text[] not null default '{}',
  add column if not exists target_buyer_roles text[] not null default '{}',
  add column if not exists target_customer_note text;

alter table public.exhibition_participation_plans
  drop constraint if exists exhibition_target_customer_note_length,
  add constraint exhibition_target_customer_note_length
    check (target_customer_note is null or char_length(target_customer_note) between 2 and 500);

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
      'target_buyer_roles',p.target_buyer_roles,'target_customer_note',p.target_customer_note
    ) order by p.event_key) from public.exhibition_participation_plans p left join public.profiles o on o.id=p.owner_id),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name) from public.profiles p where p.active=true and not coalesce(p.is_test_data,false) and p.data_environment='production'),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

create or replace function public.save_exhibition_target_audience(
  target_event_key text,target_customer_segments text[],target_regions text[],
  target_buyer_roles text[],target_customer_note text,change_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; previous public.exhibition_participation_plans; saved public.exhibition_participation_plans;
  segments text[]:=coalesce(target_customer_segments,'{}'); regions text[]:=coalesce(target_regions,'{}');
  buyer_roles text[]:=coalesce(target_buyer_roles,'{}'); note text:=nullif(trim(coalesce(target_customer_note,'')),'');
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','marketing') or coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false) then
    raise exception '仅可编辑的老板或市场部账号可维护目标客户构成';
  end if;
  select * into previous from public.exhibition_participation_plans where event_key=target_event_key for update;
  if previous.id is null then raise exception '请先保存公司参展状态和负责人'; end if;
  if cardinality(segments)>8 or not (segments <@ array['经销商','批发商','进口商','工程承包商','地产开发商','建筑设计机构','门窗制造商','安防集成商','酒店与物业','零售连锁']::text[]) then raise exception '目标客户类型无效'; end if;
  if cardinality(regions)>8 or not (regions <@ array['本地市场','东亚','东南亚','南亚','中东','欧洲','北美','拉丁美洲','非洲','大洋洲']::text[]) then raise exception '目标区域无效'; end if;
  if cardinality(buyer_roles)>8 or not (buyer_roles <@ array['企业老板','采购负责人','工程项目负责人','产品经理','技术负责人','渠道负责人','设计师/建筑师','锁匠/安装商']::text[]) then raise exception '采购角色无效'; end if;
  if cardinality(segments)=0 or cardinality(buyer_roles)=0 then raise exception '至少选择一种客户类型和采购角色'; end if;
  if note is not null and char_length(note) not between 2 and 500 then raise exception '补充说明需为 2–500 字'; end if;
  if length(trim(coalesce(change_reason,''))) not between 4 and 500 then raise exception '请填写 4–500 字的变更原因'; end if;
  update public.exhibition_participation_plans set
    target_customer_segments=(select array_agg(distinct value order by value) from unnest(segments) value),
    target_regions=coalesce((select array_agg(distinct value order by value) from unnest(regions) value),'{}'),
    target_buyer_roles=(select array_agg(distinct value order by value) from unnest(buyer_roles) value),
    target_customer_note=note,updated_by=actor.id,updated_at=now()
  where id=previous.id returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'exhibition_participation',saved.id,'exhibition_target_audience_updated',to_jsonb(previous),to_jsonb(saved),trim(change_reason));
  return jsonb_build_object('event_key',saved.event_key,'updated_at',saved.updated_at);
end $$;

revoke all on function public.save_exhibition_target_audience(text,text[],text[],text[],text,text) from public,anon;
grant execute on function public.save_exhibition_target_audience(text,text[],text[],text[],text,text) to authenticated;
