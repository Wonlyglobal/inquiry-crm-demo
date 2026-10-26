begin;
create table private.sales_lead_weekly(
 id uuid primary key default gen_random_uuid(), week_start date not null, cutoff_at timestamptz not null default clock_timestamp(),
 sales_id uuid not null references public.profiles(id), rule_id uuid not null references private.sales_lead_rules(id),
 summary jsonb not null, unique(week_start,sales_id)
);
alter table private.sales_lead_weekly enable row level security;
revoke all on private.sales_lead_weekly from public,anon,authenticated,service_role;
create trigger sales_lead_weekly_immutable before update or delete on private.sales_lead_weekly for each row execute function private.reject_risk_event_mutation();
create function private.process_sales_lead_schedule(run_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=run_at at time zone 'Asia/Shanghai'; d date:=local_now::date; r private.sales_lead_rules; p record; s private.sales_lead_days; n integer; notice uuid; body text; snap jsonb; wid uuid; missing integer; short_count integer; none_count integer; day_item record; cutoff timestamptz:=run_at; dd record;
begin
 if not pg_try_advisory_xact_lock(826102600) then return jsonb_build_object('skipped','busy'); end if;
 select * into r from private.sales_lead_rules where effective_on<=d order by effective_on desc limit 1;
 if r.id is null then return jsonb_build_object('skipped','not_started'); end if;
 for p in select * from public.profiles where role='sales' and active and not is_test_data and data_environment='production' loop
  for dd in select x::date dt from generate_series(greatest(date_trunc('week',d)::date,(select min(effective_on) from private.sales_lead_rules))::timestamp,d::timestamp,'1 day') x loop
   perform private.sales_lead_day(p.id,dd.dt);
  end loop;
  perform private.sales_lead_day(p.id,d);
  select * into s from private.sales_lead_days where sales_id=p.id and day=d;
  -- Frozen day rules also govern reminder time.
  select * into r from private.sales_lead_rules where id=s.rule_id;
  select count(*) into n from private.sales_leads where sales_id=p.id and recorded_on=d;
  if extract(isodow from d)<=5 and local_now::time>=r.remind_at and s.exempt_reason is null and n<r.daily_min and not(n=0 and s.no_new_reason is not null) then
   body:=format('%s：%s 今日已录入%s条，目标%s条。请录入客户线索；无新增可在CRM填写原因。主管同步提醒。https://crm.foreverdoodle.com/sales-leads.html',d,p.full_name,n,r.daily_min);
   insert into private.sales_lead_delivery(delivery_key,body) values('daily:'||d||':'||p.id,body) on conflict do nothing returning id into notice;
   if notice is not null then
    insert into public.notifications(recipient_id,type,title,body) values(p.id,'sales_lead_daily_due','今日客户线索尚未完成',body);
    insert into public.notifications(recipient_id,type,title,body) select m.id,'sales_lead_daily_due','团队成员客户线索尚未完成',body from public.profiles m where m.active and m.role='sales_manager' and private.crm_manager_covers_user(m.id,p.id);
   end if;
  end if;
  if extract(isodow from d)=r.weekly_day and local_now::time>=r.weekly_at then
   missing:=0; short_count:=0; none_count:=0;
   for day_item in select ds.*,rr.daily_min from private.sales_lead_days ds join private.sales_lead_rules rr on rr.id=ds.rule_id where ds.sales_id=p.id and ds.day between date_trunc('week',d)::date and d and extract(isodow from ds.day)<=5 and ds.exempt_reason is null loop
    select count(*) into n from private.sales_leads where sales_id=p.id and recorded_on=day_item.day;
    if n=0 and day_item.no_new_reason is not null then none_count:=none_count+1;
    elsif n=0 then missing:=missing+1;
    elsif n<day_item.daily_min then short_count:=short_count+1; end if;
   end loop;
   select jsonb_build_object('new_leads',count(*) filter(where recorded_on>=date_trunc('week',d)::date),'cohort_converted',count(*) filter(where recorded_on>=date_trunc('week',d)::date and inquiry_id is not null),'period_conversions',count(distinct inquiry_id) filter(where converted_at>=date_trunc('week',d)::timestamp at time zone 'Asia/Shanghai'),'no_new_days',none_count,'missing_days',missing,'short_days',short_count) into snap from private.sales_leads where sales_id=p.id and recorded_at<=cutoff;
   snap:=snap||jsonb_build_object('stages',coalesce((select jsonb_object_agg(t.stage,t.n) from(select i.status::text stage,count(distinct i.id) n from private.sales_leads l join public.inquiries i on i.id=l.inquiry_id where l.sales_id=p.id and i.owner_id=p.id group by i.status)t),'{}'::jsonb),'followup_count',(select count(*) from public.follow_ups f where exists(select 1 from private.sales_leads l where l.inquiry_id=f.inquiry_id and l.sales_id=p.id) and f.author_id=p.id and f.created_at>=date_trunc('week',d)::timestamp at time zone 'Asia/Shanghai' and f.created_at<=cutoff));
   insert into private.sales_lead_weekly(week_start,sales_id,rule_id,summary) values(date_trunc('week',d)::date,p.id,r.id,snap) on conflict do nothing returning id into wid;
   if wid is not null then
    body:=format('【个人线索与商机周报】%s 截止%s：新增%s条，本周转化%s条，无新增申报%s人天，未提交%s人天，不足目标%s人天，跟进%s次。详情及阶段请在CRM按权限查看：https://crm.foreverdoodle.com/sales-leads.html',p.full_name,local_now,snap->>'new_leads',snap->>'period_conversions',none_count,missing,short_count,snap->>'followup_count');
    insert into private.sales_lead_delivery(delivery_key,body) values('weekly:'||wid,body);
    insert into public.notifications(recipient_id,type,title,body) select m.id,'sales_lead_weekly','个人线索与商机周报',body from public.profiles m where m.active and not m.is_test_data and m.data_environment='production' and (m.id=p.id or m.role in('owner','marketing') or(m.role='sales_manager' and private.crm_manager_covers_user(m.id,p.id)));
   end if;
  end if;
 end loop;
 return jsonb_build_object('processed_on',d);
end $$;
create function public.sales_lead_weekly_reports(from_day date,to_day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); result jsonb;
begin
 if $1 is null or $2 is null or $2<$1 or $2-$1>366 then raise exception '周报周期不正确'; end if;
 select coalesce(jsonb_agg(to_jsonb(w) order by cutoff_at desc),'[]') into result from private.sales_lead_weekly w where week_start between $1 and $2 and (a.role in('owner','marketing') or a.id=w.sales_id or(a.role='sales_manager' and private.crm_manager_covers_user(a.id,w.sales_id)));
 return result;
end $$;
-- Outbox lease prevents duplicate concurrent dispatch. Uncertain network delivery may
-- retry after 10 min; attempts/status retained, never claim exactly-once external delivery.
create function public.claim_sales_lead_delivery() returns jsonb language sql security definer set search_path='' as $$
 with due as(select id from private.sales_lead_delivery where sent_at is null and attempts<5 and (claimed_at is null or claimed_at<clock_timestamp()-interval '10 minutes') order by at limit 5 for update skip locked), claimed as(update private.sales_lead_delivery d set claimed_at=clock_timestamp(),attempts=attempts+1 from due where d.id=due.id returning d.id,d.body)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') from claimed c;
$$;
create function public.finish_sales_lead_delivery(target uuid,succeeded boolean) returns void language sql security definer set search_path='' as $$
 update private.sales_lead_delivery set sent_at=case when succeeded then clock_timestamp() else sent_at end,last_error=case when succeeded then null else 'provider_failed' end where id=target and sent_at is null;
$$;
revoke all on function private.process_sales_lead_schedule(timestamptz),public.claim_sales_lead_delivery(),public.finish_sales_lead_delivery(uuid,boolean),public.sales_lead_weekly_reports(date,date) from public,anon,authenticated,service_role;
grant execute on function public.sales_lead_weekly_reports(date,date) to authenticated;
grant execute on function public.claim_sales_lead_delivery(),public.finish_sales_lead_delivery(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
