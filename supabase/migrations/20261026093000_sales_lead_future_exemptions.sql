-- A future leave request must not freeze today's rules for a future workday.
begin;
alter table private.sales_lead_days alter column rule_id drop not null;
update private.sales_lead_days set rule_id=null where day>(clock_timestamp() at time zone 'Asia/Shanghai')::date;
create or replace function private.sales_lead_day(target uuid,d date) returns void language sql security definer set search_path='' as $$
 insert into private.sales_lead_days(sales_id,day,rule_id)
 select target,d,id from private.sales_lead_rules where effective_on<=d order by effective_on desc limit 1
 on conflict(sales_id,day) do update set rule_id=coalesce(sales_lead_days.rule_id,excluded.rule_id);
$$;
create or replace function public.exempt_sales_lead_day(sales_id uuid,target_day date,reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); today date:=(clock_timestamp() at time zone 'Asia/Shanghai')::date;
begin
 if a.role not in('owner','marketing') or $2<today or $2>today+366 or $2 is null or length(btrim(coalesce($3,''))) not between 4 and 1000 then raise exception '仅市场部/老板可登记今天或未来的休假/节假日豁免及原因'; end if;
 if not exists(select 1 from public.profiles where id=$1 and role='sales' and active and not is_test_data and data_environment='production') then raise exception '业务员不可用'; end if;
 if $2>today then insert into private.sales_lead_days(sales_id,day,rule_id) values($1,$2,null) on conflict do nothing;
 else perform private.sales_lead_day($1,$2); end if;
 update private.sales_lead_days set exempt_reason=btrim($3),exempt_at=clock_timestamp() where sales_lead_days.sales_id=$1 and day=$2;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,$1,'exempted',jsonb_build_object('day',$2,'reason',$3));
end $$;
notify pgrst,'reload schema';
commit;
