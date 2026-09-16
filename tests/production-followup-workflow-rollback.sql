-- Production acceptance: use one real active role and eligible inquiry, prove
-- the audited create/complete workflow, reject direct writes, then roll back.
begin;

create temp table followup_acceptance_context(actor_id uuid,inquiry_id uuid,followup_id uuid) on commit drop;
insert into followup_acceptance_context(actor_id,inquiry_id)
select p.id,i.id
from public.profiles p
join public.inquiries i on i.owner_id=p.id
where p.active=true and p.role in ('sales','sales_manager','owner')
  and i.validity='valid' and coalesce(i.invalid_review_status,'')<>'pending'
order by case p.role when 'sales' then 1 when 'sales_manager' then 2 else 3 end,i.created_at
limit 1;
grant select,update on followup_acceptance_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select actor_id::text from followup_acceptance_context),true);

do $$
declare
  actor uuid:=auth.uid();
  target uuid:=(select inquiry_id from followup_acceptance_context);
  saved uuid;
  direct_insert_blocked boolean:=false;
  direct_update_blocked boolean:=false;
  error_code text;
begin
  if actor is null or target is null then raise exception 'No active sales-owned eligible inquiry available for rollback acceptance'; end if;

  saved:=public.record_inquiry_followup_v2(target,'other','Production rollback follow-up',null,clock_timestamp()+interval '1 day',false,'normal',null);
  perform public.complete_follow_up_task(saved);

  begin
    insert into public.follow_ups(inquiry_id,author_id,method,content)
    values(target,actor,'other','Forbidden direct follow-up');
  exception when others then
    get stacked diagnostics error_code=returned_sqlstate;
    direct_insert_blocked:=error_code='42501';
  end;
  if not direct_insert_blocked then raise exception 'direct insert unexpectedly succeeded'; end if;

  begin
    update public.follow_ups set content='Forbidden direct update' where id=saved;
  exception when others then
    get stacked diagnostics error_code=returned_sqlstate;
    direct_update_blocked:=error_code='42501';
  end;
  if not direct_update_blocked then raise exception 'direct update unexpectedly succeeded'; end if;
  update followup_acceptance_context set followup_id=saved;
end $$;

reset role;

do $$
declare saved uuid:=(select followup_id from followup_acceptance_context);
begin
  if not exists(select 1 from public.follow_ups where id=saved and completed_at is not null and content='Production rollback follow-up') then
    raise exception 'audited follow-up workflow did not persist completion';
  end if;
  if (select count(*) from public.audit_logs where entity_type='follow_up' and entity_id=saved and action in ('task_created','task_completed'))<>2 then
    raise exception 'follow-up workflow audit evidence is incomplete';
  end if;
end $$;

rollback;

select concat(
  'table=',to_regclass('public.follow_ups') is not null,
  '; anon_create_execute=',has_function_privilege('anon','public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz)','execute'),
  '; authenticated_create_execute=',has_function_privilege('authenticated','public.record_inquiry_followup_v2(uuid,text,text,text,timestamptz,boolean,text,timestamptz)','execute'),
  '; authenticated_insert=',has_table_privilege('authenticated','public.follow_ups','insert'),
  '; authenticated_update=',has_table_privilege('authenticated','public.follow_ups','update'),
  '; rollback_followups=',(select count(*) from public.follow_ups where content in ('Production rollback follow-up','Forbidden direct follow-up','Forbidden direct update'))
) as production_followup_workflow;
