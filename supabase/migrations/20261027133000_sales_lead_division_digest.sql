begin;
do $$ begin
 if md5((select prosrc from pg_proc where oid='private.process_sales_lead_schedule(timestamptz)'::regprocedure))<>'a9c77c91d5b82eb642552a9528d57f07'
 or md5((select prosrc from pg_proc where oid='public.claim_sales_lead_delivery()'::regprocedure))<>'58580a438ecd8dcfc0666b35a9bb2435'
 or md5((select prosrc from pg_proc where oid='public.finish_sales_lead_delivery(uuid,boolean)'::regprocedure))<>'485088698eede76c1dc222c070ea3acf'
 then raise exception '原调度或派发函数已变化，停止迁移并重新核对'; end if;
end $$;
-- Retain old delivery evidence; supersession is not a successful external send.
alter table private.sales_lead_delivery add column superseded_at timestamptz;
alter table private.sales_lead_delivery add column superseded_reason text;
alter function private.process_sales_lead_schedule(timestamptz) rename to process_sales_lead_personal_schedule_v1;

create function private.process_sales_lead_schedule(run_at timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=(run_at at time zone 'Asia/Shanghai')::date;
 local_now timestamp:=run_at at time zone 'Asia/Shanghai'; r private.sales_lead_rules;
 result jsonb; lines text; total integer; done integer; none_count integer; missing integer;
 short_count integer; exempt integer; leads integer; converted integer; due_at time;
begin
 if not pg_try_advisory_xact_lock(826102600) then return jsonb_build_object('skipped','busy'); end if;
 -- Existing per-person immutable weekly snapshots and scoped CRM notifications.
 result:=private.process_sales_lead_personal_schedule_v1(run_at);
 select * into r from private.sales_lead_rules where effective_on<=d order by effective_on desc limit 1;
 if r.id is null then return result; end if;
 -- Do not replay the old per-person backlog. Keep bodies, attempts and sent times.
 update private.sales_lead_delivery set superseded_at=clock_timestamp(),superseded_reason='replaced_by_division_summary'
 where sent_at is null and superseded_at is null and (delivery_key like 'daily:%' or delivery_key like 'weekly:%');

 select max(rr.remind_at) into due_at from private.sales_lead_days ds
 join private.sales_lead_rules rr on rr.id=ds.rule_id join public.profiles p on p.id=ds.sales_id
 where ds.day=d and p.role='sales' and p.active and not p.is_test_data and p.data_environment='production';
 if extract(isodow from d)<=5 and local_now::time>=due_at then
  with counts as (
   select p.id,p.full_name,p.team,ds.exempt_reason,ds.no_new_reason,rr.daily_min,
    (select count(*)::integer from private.sales_leads l where l.sales_id=p.id and l.recorded_on=d and l.recorded_at<=run_at) n,
    (select count(distinct l.inquiry_id)::integer from private.sales_leads l where l.sales_id=p.id
     and l.converted_at>=d::timestamp at time zone 'Asia/Shanghai' and l.converted_at<=run_at) conversions
   from public.profiles p join private.sales_lead_days ds on ds.sales_id=p.id and ds.day=d
   join private.sales_lead_rules rr on rr.id=ds.rule_id
   where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
  ), ranked as (select *,dense_rank() over(order by n desc) rank from counts)
  select count(*),coalesce(sum(n),0),coalesce(sum(conversions),0),
   count(*) filter(where exempt_reason is null and n>=daily_min),
   count(*) filter(where exempt_reason is null and n=0 and no_new_reason is not null),
   count(*) filter(where exempt_reason is null and n=0 and no_new_reason is null),
   count(*) filter(where exempt_reason is null and n>0 and n<daily_min),count(*) filter(where exempt_reason is not null),
   string_agg(format('%s. %s%s：新增%s条 / 转商机%s条 · %s',rank,
    regexp_replace(coalesce(nullif(full_name,''),'未命名成员'),'[[:cntrl:]]',' ','g'),
    case when nullif(team,'') is null then '' else '（'||regexp_replace(team,'[[:cntrl:]]',' ','g')||'）' end,n,conversions,
    case when exempt_reason is not null then '豁免' when n>=daily_min then '达标'
     when n=0 and no_new_reason is not null then '已申报无新增' when n=0 then '未提交' else '未达标' end),E'\n' order by n desc,full_name,id)
  into total,leads,converted,done,none_count,missing,short_count,exempt,lines from ranked;
  if total>0 then
   insert into private.sales_lead_delivery(delivery_key,body) values('division-daily:'||d,
    format(E'【事业部每日线索排行榜】%s 截止%s（北京时间）\n全员%s人｜新增%s条｜当日转商机%s条\n达标%s人｜无新增申报%s人｜未提交%s人｜未达标%s人｜豁免%s人\n\n%s\n\n按服务器当日录入量降序，同量同名次；无新增申报不算新增，也不代表日报正式提交。\nhttps://crm.foreverdoodle.com/sales-leads.html',
     d,to_char(local_now,'HH24:MI'),total,leads,converted,done,none_count,missing,short_count,exempt,lines)) on conflict do nothing;
  end if;
 end if;
 -- Frozen rules can differ between members after a settings change. Wait for
 -- every eligible member's existing weekly snapshot, never send a partial roster.
 if not exists(select 1 from public.profiles p where p.role='sales' and p.active
  and not p.is_test_data and p.data_environment='production'
  and not exists(select 1 from private.sales_lead_weekly w where w.sales_id=p.id
   and w.week_start=date_trunc('week',d)::date)) then
  with ranked as (
   select p.id,p.full_name,p.team,w.summary,w.cutoff_at,
    dense_rank() over(order by (w.summary->>'period_conversions')::integer desc,(w.summary->>'new_leads')::integer desc) rank
   from private.sales_lead_weekly w join public.profiles p on p.id=w.sales_id
   where w.week_start=date_trunc('week',d)::date and p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
  ) select count(*),coalesce(sum((summary->>'new_leads')::integer),0),coalesce(sum((summary->>'period_conversions')::integer),0),
   string_agg(format('%s. %s：转商机%s条 / 新增%s条 / 跟进%s次 / 无新增申报%s人天 / 未提交%s人天 / 不足目标%s人天',rank,
    regexp_replace(coalesce(nullif(full_name,''),'未命名成员'),'[[:cntrl:]]',' ','g'),summary->>'period_conversions',summary->>'new_leads',summary->>'followup_count',summary->>'no_new_days',summary->>'missing_days',summary->>'short_days'),E'\n'
    order by (summary->>'period_conversions')::integer desc,(summary->>'new_leads')::integer desc,full_name,id)
   into total,leads,converted,lines from ranked;
  if total>0 then
   insert into private.sales_lead_delivery(delivery_key,body) values('division-weekly:'||date_trunc('week',d)::date,
    format(E'【事业部线索与商机周榜】%s—%s（北京时间）\n全员%s人｜新增%s条｜本周转商机%s条\n\n%s\n\n按本周转商机量、新增线索量依次降序，两项相同同名次；采用各人首次周报截止快照，不自动改写历史。\nhttps://crm.foreverdoodle.com/sales-leads.html',date_trunc('week',d)::date,d,total,leads,converted,lines)) on conflict do nothing;
  end if;
 end if;
 return result||jsonb_build_object('feishu_mode','division_digest');
end $$;

-- Only one digest row per daily/weekly period is dispatchable. Legacy evidence
-- remains stored; uncertain provider delivery retains the existing lease/retry policy.
create or replace function public.claim_sales_lead_delivery() returns jsonb language sql security definer set search_path='' as $$
 with due as(select id from private.sales_lead_delivery where sent_at is null and superseded_at is null
 and (delivery_key like 'division-daily:%' or delivery_key like 'division-weekly:%')
 and attempts<5 and (claimed_at is null or claimed_at<clock_timestamp()-interval '10 minutes')
 order by at limit 5 for update skip locked), claimed as(update private.sales_lead_delivery d
 set claimed_at=clock_timestamp(),attempts=attempts+1 from due where d.id=due.id returning d.id,d.body)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') from claimed c;
$$;
revoke all on function private.process_sales_lead_personal_schedule_v1(timestamptz),private.process_sales_lead_schedule(timestamptz) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
