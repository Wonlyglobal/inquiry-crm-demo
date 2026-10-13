alter table public.exhibition_participation_plans
  add column if not exists budget_amount numeric(14,2) check (budget_amount is null or budget_amount > 0),
  add column if not exists budget_currency text check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  add column if not exists booth_price numeric(14,2) check (booth_price is null or booth_price > 0),
  add column if not exists booth_price_currency text check (booth_price_currency is null or booth_price_currency ~ '^[A-Z]{3}$'),
  add column if not exists booth_price_unit text check (booth_price_unit is null or booth_price_unit in ('sqm','standard_booth','package')),
  add column if not exists booth_price_source_url text,
  add column if not exists booth_price_checked_on date;

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
      'booth_price_checked_on',p.booth_price_checked_on
    ) order by p.event_key) from public.exhibition_participation_plans p left join public.profiles o on o.id=p.owner_id),'[]'::jsonb),
    'owners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name) from public.profiles p where p.active=true and not coalesce(p.is_test_data,false) and p.data_environment='production'),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

create or replace function public.save_exhibition_budget(
  target_event_key text,target_budget_amount numeric,target_budget_currency text,
  target_booth_price numeric,target_booth_price_currency text,target_booth_price_unit text,
  target_booth_price_source_url text,target_booth_price_checked_on date,change_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; previous public.exhibition_participation_plans; saved public.exhibition_participation_plans;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','marketing') or coalesce(((select auth.jwt())->'app_metadata'->>'crm_read_only')::boolean,false) then raise exception '仅可编辑的老板或市场部账号可维护展会预算'; end if;
  select * into previous from public.exhibition_participation_plans where event_key=target_event_key for update;
  if previous.id is null then raise exception '请先保存公司参展状态和负责人'; end if;
  if target_budget_amount is not null and (target_budget_amount<=0 or upper(coalesce(target_budget_currency,'')) !~ '^[A-Z]{3}$') then raise exception '预算金额和币种无效'; end if;
  if target_booth_price is not null and (target_booth_price<=0 or upper(coalesce(target_booth_price_currency,'')) !~ '^[A-Z]{3}$' or target_booth_price_unit not in ('sqm','standard_booth','package')) then raise exception '展位价格、币种或计价单位无效'; end if;
  if target_booth_price is not null and (coalesce(target_booth_price_source_url,'') !~ '^https://' or target_booth_price_checked_on is null) then raise exception '展位价格必须提供 HTTPS 来源和核验日期'; end if;
  if length(trim(coalesce(change_reason,''))) not between 4 and 500 then raise exception '请填写 4–500 字的变更原因'; end if;
  update public.exhibition_participation_plans set
    budget_amount=target_budget_amount,budget_currency=case when target_budget_amount is null then null else upper(target_budget_currency) end,
    booth_price=target_booth_price,booth_price_currency=case when target_booth_price is null then null else upper(target_booth_price_currency) end,
    booth_price_unit=case when target_booth_price is null then null else target_booth_price_unit end,
    booth_price_source_url=case when target_booth_price is null then null else target_booth_price_source_url end,
    booth_price_checked_on=case when target_booth_price is null then null else target_booth_price_checked_on end,
    updated_by=actor.id,updated_at=now() where id=previous.id returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor.id,'exhibition_participation',saved.id,'exhibition_budget_updated',to_jsonb(previous),to_jsonb(saved),trim(change_reason));
  return jsonb_build_object('event_key',saved.event_key,'updated_at',saved.updated_at);
end $$;

revoke all on function public.save_exhibition_budget(text,numeric,text,numeric,text,text,text,date,text) from public,anon;
grant execute on function public.save_exhibition_budget(text,numeric,text,numeric,text,text,text,date,text) to authenticated;
