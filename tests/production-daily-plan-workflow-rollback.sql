-- Production acceptance: exercise one real active role with disposable records,
-- prove direct writes are blocked, then roll the entire workflow back.
begin;

create temp table daily_plan_acceptance_context(actor_id uuid,plan_id uuid) on commit drop;
insert into daily_plan_acceptance_context(actor_id)
select p.id
from public.profiles p
where p.active=true and p.role in ('sales','sales_manager','owner')
order by case p.role when 'sales' then 1 when 'sales_manager' then 2 else 3 end,p.created_at
limit 1;
grant select,update on daily_plan_acceptance_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select actor_id::text from daily_plan_acceptance_context),true);

do $$
declare
  actor uuid:=auth.uid();
  saved uuid;
  direct_write_blocked boolean:=false;
  error_code text;
begin
  if actor is null then raise exception 'No active sales-capable profile available for rollback acceptance'; end if;

  saved:=public.create_sales_daily_plan(current_date,'Production rollback daily plan','high',null,null);
  perform public.save_sales_daily_plan_result(saved,'Rollback acceptance completed');

  begin
    insert into public.sales_daily_plans(owner_id,plan_date,title)
    values(actor,current_date,'Forbidden direct daily plan');
  exception when others then
    get stacked diagnostics error_code=returned_sqlstate;
    direct_write_blocked:=error_code='42501';
  end;
  if not direct_write_blocked then raise exception 'direct insert unexpectedly succeeded'; end if;
  update daily_plan_acceptance_context set plan_id=saved;
end $$;

reset role;

do $$
declare saved uuid:=(select plan_id from daily_plan_acceptance_context);
begin
  if not exists(select 1 from public.sales_daily_plans where id=saved and completed_at is not null and key_result='Rollback acceptance completed') then
    raise exception 'audited daily plan workflow did not persist its result';
  end if;
  if (select count(*) from public.audit_logs where entity_type='daily_plan' and entity_id=saved and action in ('daily_plan_created','daily_plan_completed'))<>2 then
    raise exception 'daily plan workflow audit evidence is incomplete';
  end if;
end $$;

rollback;

select concat(
  'table=',to_regclass('public.sales_daily_plans') is not null,
  '; anon_execute=',has_function_privilege('anon','public.create_sales_daily_plan(date,text,text,timestamptz,uuid)','execute'),
  '; authenticated_execute=',has_function_privilege('authenticated','public.create_sales_daily_plan(date,text,text,timestamptz,uuid)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.sales_daily_plans','insert'),
  '; authenticated_update=',has_table_privilege('authenticated','public.sales_daily_plans','update'),
  '; rollback_plans=',(select count(*) from public.sales_daily_plans where title in ('Production rollback daily plan','Forbidden direct daily plan'))
) as production_daily_plan_workflow;
