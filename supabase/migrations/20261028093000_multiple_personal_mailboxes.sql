begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_crm_member_mailbox_status()'::regprocedure) is distinct from 'bb37d7b6a8b4b74fa481be1e0a1f31c2' then raise exception 'source_drift_get_crm_member_mailbox_status'; end if; end $$;
do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_crm_operational_settings()'::regprocedure) is distinct from 'f1edec1397f2994fba2fec0e5c138dbf' then raise exception 'source_drift_get_crm_operational_settings'; end if; end $$;
do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_summary(date)'::regprocedure) is distinct from '80625859fb098c4ec018b082477d6899' then raise exception 'source_drift_get_sales_mail_type_summary'; end if; end $$;
do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_email_activity_metrics(date)'::regprocedure) is distinct from '0bb022d1aaedf0b858016a4347add167' then raise exception 'source_drift_get_sales_email_activity_metrics'; end if; end $$;
-- Email is globally owned; never reassign another person's mailbox on reconnect.
create unique index mailbox_connections_email_normalized_unique on public.mailbox_connections(lower(btrim(email)));
drop index public.mailbox_connections_personal_user_unique;
create view private.person_mail_canonical as
 select distinct on (b.user_id,m.direction,coalesce(nullif(btrim(m.message_id),''),m.id::text)) m.*
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
 order by b.user_id,m.direction,coalesce(nullif(btrim(m.message_id),''),m.id::text),(m.inquiry_id is not null) desc,m.created_at,m.id;
revoke all on private.person_mail_canonical from public,anon,authenticated;
alter table public.mail_outbox add column mailbox_connection_id uuid references public.mailbox_connections(id);

create or replace function public.get_crm_member_mailbox_status()
returns table(profile_id uuid,connection_status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active=true
 and a.role in ('owner','sales_manager','marketing') and a.is_test_data=false and a.data_environment='production') then
 raise exception '当前账号无权查看成员邮箱状态'; end if;
 return query select p.id,
 case when c.user_id is null then 'not_connected'
 when c.status::text in ('connected','error','disabled','pending') then c.status::text
 else 'unknown' end
 from public.profiles p left join lateral (select b.user_id,b.status from public.mailbox_connections b where b.user_id=p.id and b.mailbox_kind='personal' order by case b.status when 'connected' then 0 when 'error' then 1 when 'pending' then 2 else 3 end,b.id limit 1) c on true
 where p.is_test_data=false and p.data_environment='production' order by p.id;
end $$;
create or replace function public.get_crm_operational_settings()
returns table(profile_id uuid,full_name text,role text,team text,sales_region text,paused boolean,revision integer,can_edit boolean,last_synced_at timestamptz,last_tested_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active and not a.is_test_data and a.data_environment='production' and a.role in ('owner','sales_manager','marketing')) then raise exception '无权查看业务设置'; end if;
 return query select p.id,p.full_name::text,p.role::text,p.team::text,
 coalesce((select string_agg(distinct t.sales_region,'、' order by t.sales_region) from public.sales_target_people t where t.profile_id=p.id),''),
 coalesce(s.paused,false),coalesce(s.revision,0),
 p.active and p.role='sales' and ((select a.role='owner' from public.profiles a where a.id=auth.uid()) or private.crm_manager_covers_user(auth.uid(),p.id)),
 m.last_synced_at,m.last_tested_at
 from public.profiles p left join private.crm_assignment_preferences s on s.profile_id=p.id
 left join lateral (select max(b.last_synced_at) as last_synced_at,max(b.last_tested_at) as last_tested_at from public.mailbox_connections b where b.user_id=p.id and b.mailbox_kind='personal') m on true
 where not p.is_test_data and p.data_environment='production' order by p.full_name,p.id;
end $$;
create or replace function public.get_sales_mail_type_summary(target_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active and a.role in ('owner','sales_manager','sales')) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date then raise exception 'invalid_period'; end if;
 with scope as (select p.id from public.profiles p where private.sales_mail_type_scope(auth.uid(),p.id)),
 raw_messages as (
 select b.user_id as sales_id,m.id,m.message_id,e.category,e.method,e.created_at as classified_at,m.direction,m.inquiry_id,
 timezone('Asia/Shanghai',coalesce(m.sent_at,m.received_at,m.created_at))::date as mail_day
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
 join scope s on s.id=b.user_id
 left join lateral (select ev.category,ev.method,ev.created_at from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where not exists(select 1 from public.inquiries i where i.id=m.inquiry_id and (i.is_test_data or i.data_environment<>'production'))
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
 ), message_keys as (
 select sales_id,direction,coalesce(nullif(btrim(message_id),''),id::text) as mail_key,
 min(mail_day) as mail_day,count(distinct category) filter(where method='human') as human_categories,
 (array_agg(inquiry_id order by id) filter(where inquiry_id is not null))[1] as inquiry_id
 from raw_messages group by sales_id,direction,coalesce(nullif(btrim(message_id),''),id::text)
 ), messages as (
 select distinct on (r.sales_id,r.direction,k.mail_key)
 r.sales_id,r.id,r.direction,k.mail_day,k.inquiry_id,
 case when k.human_categories>1 then 'uncertain' else r.category end as category,r.method
 from raw_messages r join message_keys k on k.sales_id=r.sales_id and k.direction is not distinct from r.direction and k.mail_key=coalesce(nullif(btrim(r.message_id),''),r.id::text)
 order by r.sales_id,r.direction,k.mail_key,(r.method='human') desc nulls last,r.classified_at desc nulls last,r.id
 ), grouped as (select sales_id,category,method,count(*) as n from messages group by sales_id,category,method)
 select coalesce(jsonb_agg(jsonb_build_object('sales_id',s.id,
 'total',(select count(*) from messages m where m.sales_id=s.id),
 'inbound',(select count(*) from messages m where m.sales_id=s.id and m.direction='inbound'),
 'outbound',(select count(*) from messages m where m.sales_id=s.id and m.direction='outbound'),
 'unknown_direction',(select count(*) from messages m where m.sales_id=s.id and m.direction is distinct from 'inbound' and m.direction is distinct from 'outbound'),
 'linked',(select count(*) from messages m where m.sales_id=s.id and m.inquiry_id is not null),
 'confirmed_total',(select count(*) from messages m where m.sales_id=s.id and m.method='human' and m.category<>'uncertain'),
 'awaiting_confirmation',(select count(*) from messages m where m.sales_id=s.id and (m.method is distinct from 'human' or m.category='uncertain')),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from (
 select mail_day as day,count(*) as total,count(*) filter(where direction='inbound') as inbound,
 count(*) filter(where direction='outbound') as outbound,
 count(*) filter(where method='human' and category<>'uncertain') as confirmed_total,
 count(*) filter(where method is distinct from 'human' or category='uncertain') as awaiting_confirmation,
 count(*) filter(where inquiry_id is not null) as linked
 from messages m where m.sales_id=s.id group by mail_day) d),'[]'::jsonb),
 'pending',(select count(*) from messages m where m.sales_id=s.id and m.method is null),
 'skipped',(select count(*) from messages m where m.sales_id=s.id and m.method='skipped'),
 'failed',(select count(*) from messages m where m.sales_id=s.id and m.method='failed'),
 'confirmed',coalesce((select jsonb_object_agg(g.category,g.n) from grouped g where g.sales_id=s.id and g.method='human'),'{}'::jsonb),
 'suggested',coalesce((select jsonb_object_agg(g.category,g.n) from grouped g where g.sales_id=s.id and g.method='ai'),'{}'::jsonb)
 )),'[]'::jsonb) into result from scope s;
 return jsonb_build_object('month',to_char(target_month,'YYYY-MM'),'people',result,'policy','observation_only_no_performance_score','activity_schema','synced-mail-activity-v1');
end $$;

CREATE OR REPLACE FUNCTION public.get_sales_email_activity_metrics(target_period_start date DEFAULT (date_trunc('month'::text, timezone('Asia/Shanghai'::text, now())))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid(); actor_role public.crm_role; actor_team text; period_start timestamptz; period_end timestamptz;
  current_month_start date; people_result jsonb; daily_result jsonb;
begin
  select p.role,p.team into actor_role,actor_team from public.profiles p where p.id=actor and p.active=true;
  current_month_start:=date_trunc('month',(clock_timestamp() at time zone 'Asia/Shanghai')::date)::date;
  if actor_role is null or actor_role not in ('owner','sales_manager','sales') then raise exception '当前角色无权查看销售邮件活动指标'; end if;
  if target_period_start is null or target_period_start<>date_trunc('month',target_period_start)::date or target_period_start>current_month_start then raise exception '统计周期必须为当前或历史月份'; end if;
  period_start:=target_period_start::timestamp at time zone 'Asia/Shanghai'; period_end:=(target_period_start+interval '1 month')::timestamp at time zone 'Asia/Shanghai';
  with sales_scope as (
    select p.id,p.full_name,p.team from public.profiles p where p.active=true and p.role='sales'
      and (actor_role='owner' or (actor_role='sales_manager' and p.team is not distinct from actor_team) or (actor_role='sales' and p.id=actor))
  ), sent as (
    select e.id,e.actor_id as salesperson_id,e.entity_id as inquiry_id,e.created_at as sent_at,nullif(e.after_data->>'message_id','') as message_id
    from public.audit_logs e join sales_scope s on s.id=e.actor_id join public.inquiries i on i.id=e.entity_id
    where e.entity_type='inquiry' and e.action='outreach_email_sent' and e.created_at>=period_start and e.created_at<period_end and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
  ), sent_stats as (
    select s.id as salesperson_id,count(x.id)::integer as development_sent,count(x.id) filter(where x.sent_at<=clock_timestamp()-interval '7 days')::integer as mature_7d_sent,
      count(x.id) filter(where x.sent_at<=clock_timestamp()-interval '7 days' and x.message_id is not null and exists(
        select 1 from private.person_mail_canonical incoming join public.mailbox_connections box on box.id=incoming.mailbox_connection_id
        where incoming.inquiry_id=x.inquiry_id and incoming.direction='inbound' and incoming.association_status='matched' and incoming.received_at>=x.sent_at and incoming.received_at<x.sent_at+interval '7 days'
          and box.user_id=x.salesperson_id and box.mailbox_kind='personal' and (incoming.in_reply_to=x.message_id or x.message_id=any(coalesce(incoming.reference_ids,'{}'::text[])))))::integer as replied_7d
    from sales_scope s left join sent x on x.salesperson_id=s.id group by s.id
  ), inbound_stats as (
    select s.id as salesperson_id,count(m.id)::integer as customer_inbound from sales_scope s
    left join public.mailbox_connections b on b.user_id=s.id and b.mailbox_kind='personal'
    left join private.person_mail_canonical m on m.mailbox_connection_id=b.id and m.direction='inbound' and m.association_status='matched' and m.received_at>=period_start and m.received_at<period_end
    left join public.inquiries i on i.id=m.inquiry_id and i.owner_id=s.id and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    where m.id is null or i.id is not null group by s.id
  ), reply_stats as (
    select s.id as salesperson_id,count(r.id) filter(where r.status='open')::integer as pending_replies,
      count(r.id) filter(where r.status='open' and r.received_at<=clock_timestamp()-interval '24 hours')::integer as overdue_replies,
      count(r.id) filter(where r.status='replied')::integer as replied_in_period,
      count(r.id) filter(where r.status='replied' and r.replied_at<=r.received_at+interval '24 hours')::integer as replied_within_24h,
      round((percentile_cont(0.5) within group(order by extract(epoch from (r.replied_at-r.received_at))/60) filter(where r.status='replied'))::numeric,1) as median_reply_minutes
    from sales_scope s left join public.email_reply_reminders r on r.owner_id=s.id and r.received_at>=period_start and r.received_at<period_end
    left join public.inquiries i on i.id=r.inquiry_id and i.owner_id=s.id and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    where r.id is null or i.id is not null group by s.id
  ), ai_stats as (
    select s.id as salesperson_id,count(distinct result.id)::integer as ai_generated,count(distinct result.id) filter(where result.status='pending_human_review')::integer as ai_pending_review,
      count(distinct job.id) filter(where job.status in ('queued','processing'))::integer as ai_queued,count(distinct job.id) filter(where job.status='failed')::integer as ai_failed,max(result.created_at) as ai_last_observation_at
    from sales_scope s left join public.sales_email_analysis_results result on result.salesperson_id=s.id and result.period_start=target_period_start
    left join public.sales_email_analysis_jobs job on job.salesperson_id=s.id and job.period_start=target_period_start group by s.id
  ), mailbox_stats as (
    select s.id as salesperson_id,coalesce((select b.status from public.mailbox_connections b where b.user_id=s.id and b.mailbox_kind='personal' order by case b.status when 'connected' then 0 when 'error' then 1 else 2 end,b.updated_at desc limit 1),'not_connected') as mailbox_status,
      (select max(coalesce(c.last_synced_at,b.last_synced_at)) from public.mailbox_connections b left join public.email_sync_cursors c on c.mailbox_connection_id=b.id where b.user_id=s.id and b.mailbox_kind='personal') as last_synced_at,
      coalesce((select bool_or(c.last_error is not null) from public.mailbox_connections b left join public.email_sync_cursors c on c.mailbox_connection_id=b.id where b.user_id=s.id and b.mailbox_kind='personal'),false) as sync_has_error
    from sales_scope s
  )
  select coalesce(jsonb_agg(jsonb_build_object('sales_id',s.id,'sales_name',s.full_name,'team',s.team,'development_sent',ss.development_sent,'mature_7d_sent',ss.mature_7d_sent,'replied_7d',ss.replied_7d,
    'reply_rate_7d',case when ss.mature_7d_sent=0 then null else round(ss.replied_7d::numeric/ss.mature_7d_sent,4) end,'customer_inbound',coalesce(ins.customer_inbound,0),
    'pending_replies',coalesce(rs.pending_replies,0),'overdue_replies',coalesce(rs.overdue_replies,0),'replied_in_period',coalesce(rs.replied_in_period,0),'replied_within_24h',coalesce(rs.replied_within_24h,0),
    'median_reply_minutes',rs.median_reply_minutes,'ai_generated',coalesce(ai.ai_generated,0),'ai_pending_review',coalesce(ai.ai_pending_review,0),'ai_queued',coalesce(ai.ai_queued,0),'ai_failed',coalesce(ai.ai_failed,0),
    'ai_last_observation_at',ai.ai_last_observation_at,'mailbox_status',ms.mailbox_status,'last_synced_at',ms.last_synced_at,'sync_has_error',ms.sync_has_error) order by s.full_name),'[]'::jsonb) into people_result
  from sales_scope s join sent_stats ss on ss.salesperson_id=s.id left join inbound_stats ins on ins.salesperson_id=s.id left join reply_stats rs on rs.salesperson_id=s.id left join ai_stats ai on ai.salesperson_id=s.id left join mailbox_stats ms on ms.salesperson_id=s.id;
  with sales_scope as (
    select p.id from public.profiles p where p.active=true and p.role='sales' and (actor_role='owner' or (actor_role='sales_manager' and p.team is not distinct from actor_team) or (actor_role='sales' and p.id=actor))
  ), activity as (
    select b.user_id as salesperson_id,(coalesce(m.sent_at,m.received_at,m.created_at) at time zone 'Asia/Shanghai')::date as activity_day,
      count(*) filter(where m.direction='outbound')::integer as total_sent,count(*) filter(where m.direction='inbound')::integer as total_received,
      0::integer as development_sent,0::integer as customer_inbound,0::integer as reply_sent
    from private.person_mail_canonical m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal' join sales_scope s on s.id=b.user_id
    where coalesce(m.sent_at,m.received_at,m.created_at)>=period_start and coalesce(m.sent_at,m.received_at,m.created_at)<period_end
    group by b.user_id,(coalesce(m.sent_at,m.received_at,m.created_at) at time zone 'Asia/Shanghai')::date
    union all
    select e.actor_id,(e.created_at at time zone 'Asia/Shanghai')::date,0::integer,0::integer,count(*)::integer,0::integer,0::integer
    from public.audit_logs e join sales_scope s on s.id=e.actor_id join public.inquiries i on i.id=e.entity_id
    where e.entity_type='inquiry' and e.action='outreach_email_sent' and e.created_at>=period_start and e.created_at<period_end and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    group by e.actor_id,(e.created_at at time zone 'Asia/Shanghai')::date
    union all
    select i.owner_id,(m.received_at at time zone 'Asia/Shanghai')::date,0::integer,0::integer,0::integer,count(*)::integer,0::integer
    from private.person_mail_canonical m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
    join public.inquiries i on i.id=m.inquiry_id and i.owner_id=b.user_id join sales_scope s on s.id=i.owner_id
    where m.direction='inbound' and m.association_status='matched' and m.received_at>=period_start and m.received_at<period_end and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    group by i.owner_id,(m.received_at at time zone 'Asia/Shanghai')::date
    union all
    select e.actor_id,(e.created_at at time zone 'Asia/Shanghai')::date,0::integer,0::integer,0::integer,0::integer,count(*)::integer
    from public.audit_logs e join sales_scope s on s.id=e.actor_id join public.inquiries i on i.id=e.entity_id
    where e.entity_type='inquiry' and e.action='inquiry_reply_email_sent' and e.created_at>=period_start and e.created_at<period_end and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    group by e.actor_id,(e.created_at at time zone 'Asia/Shanghai')::date
  ), daily_groups as (
    select a.salesperson_id,a.activity_day,sum(a.total_sent)::integer as total_sent,sum(a.total_received)::integer as total_received,
      sum(a.development_sent)::integer as development_sent,sum(a.customer_inbound)::integer as customer_inbound,sum(a.reply_sent)::integer as reply_sent
    from activity a group by a.salesperson_id,a.activity_day
  )
  select coalesce(jsonb_agg(jsonb_build_object('sales_id',d.salesperson_id,'day',d.activity_day,'total_sent',d.total_sent,'total_received',d.total_received,
    'development_sent',d.development_sent,'customer_inbound',d.customer_inbound,'reply_sent',d.reply_sent) order by d.activity_day,d.salesperson_id),'[]'::jsonb) into daily_result from daily_groups d;
  return jsonb_build_object('period_start',target_period_start,'period_end',(target_period_start+interval '1 month'-interval '1 day')::date,'timezone','Asia/Shanghai','people',coalesce(people_result,'[]'::jsonb),
    'daily',coalesce(daily_result,'[]'::jsonb),'scoring_policy','observation_only_no_score_or_rank_effect','definitions',jsonb_build_object(
      'development_sent','仅统计 CRM 成功发送且写入 outreach_email_sent 审计的开发信；不含回复、草稿、失败和未分类邮箱外发','total_sent','业务员个人阿里邮箱当日同步成功的全部发件数量',
      'total_received','业务员个人阿里邮箱当日同步成功的全部收件数量','reply_sent','业务员从 CRM 成功回复客户且写入 inquiry_reply_email_sent 审计的数量',
      'reply_rate_7d','发送满 7 天的开发信中，7 天内收到同一 RFC 邮件线程客户来信的比例；未满 7 天不进入分母','customer_inbound','业务员个人邮箱内已关联、有效且未排除询盘的客户来信',
      'reply_handling','客户来信到业务员回复的提醒状态、24 小时比例和中位耗时','privacy','仅返回按角色范围聚合的数据，不返回正文、主题、邮箱地址或客户明细'));
end;
$function$;


create function public.set_scheduled_mailbox_connection(target_outbox_id uuid,target_connection_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join public.mailbox_connections b on b.user_id=p.id where p.id=auth.uid() and p.active and p.role in ('sales','sales_manager','marketing','owner') and b.id=target_connection_id and b.mailbox_kind='personal' and b.status='connected') then raise exception '所选个人邮箱不可用'; end if;
 update public.mail_outbox set mailbox_connection_id=target_connection_id where id=target_outbox_id and sender_user_id=auth.uid() and status='pending' and delivery_mode='scheduled';
 if not found then raise exception '定时邮件不可修改'; end if;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason) values(auth.uid(),'profile',auth.uid(),'scheduled_mailbox_selected',jsonb_build_object('outbox_id',target_outbox_id,'mailbox_connection_id',target_connection_id),'业务员选择本人定时邮件的发件邮箱');
end $$;
revoke all on function public.set_scheduled_mailbox_connection(uuid,uuid) from public,anon;
grant execute on function public.set_scheduled_mailbox_connection(uuid,uuid) to authenticated;
create function public.schedule_mailbox_message_from(target_connection_id uuid,target_inquiry_id uuid,recipient_email text,cc_list text[],mail_subject text,mail_body text,reply_message_id text,scheduled_for timestamptz,target_quotation_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job uuid;
begin
 if not exists(select 1 from public.profiles p join public.mailbox_connections b on b.user_id=p.id where p.id=auth.uid() and p.active and b.id=target_connection_id and b.mailbox_kind='personal' and b.status='connected') then raise exception '所选个人邮箱不可用'; end if;
 job:=public.schedule_mailbox_message(target_inquiry_id,recipient_email,cc_list,mail_subject,mail_body,reply_message_id,scheduled_for,target_quotation_id);
 perform public.set_scheduled_mailbox_connection(job,target_connection_id);
 return job;
end $$;
revoke all on function public.schedule_mailbox_message_from(uuid,uuid,text,text[],text,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.schedule_mailbox_message_from(uuid,uuid,text,text[],text,text,text,timestamptz,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
