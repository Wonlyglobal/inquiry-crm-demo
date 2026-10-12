begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Aggregate-only email activity metrics for the sales dashboard.
-- No message content or contact identifiers are returned; no scores/ranks change.
create or replace function public.get_sales_email_activity_metrics(
  target_period_start date default date_trunc('month', timezone('Asia/Shanghai',now()))::date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.crm_role;
  actor_team text;
  period_start timestamptz;
  period_end timestamptz;
  current_month_start date;
  people_result jsonb;
  daily_result jsonb;
begin
  select p.role,p.team into actor_role,actor_team
  from public.profiles p where p.id=actor and p.active=true;
  current_month_start:=date_trunc('month',(clock_timestamp() at time zone 'Asia/Shanghai')::date)::date;
  if actor_role is null or actor_role not in ('owner','sales_manager','sales') then
    raise exception '当前角色无权查看销售邮件活动指标';
  end if;
  if target_period_start is null
    or target_period_start<>date_trunc('month',target_period_start)::date
    or target_period_start>current_month_start then
    raise exception '统计周期必须为当前或历史月份';
  end if;

  period_start:=target_period_start::timestamp at time zone 'Asia/Shanghai';
  period_end:=(target_period_start+interval '1 month')::timestamp at time zone 'Asia/Shanghai';

  with sales_scope as (
    select p.id,p.full_name,p.team
    from public.profiles p
    where p.active=true and p.role='sales'
      and (actor_role='owner'
        or (actor_role='sales_manager' and p.team is not distinct from actor_team)
        or (actor_role='sales' and p.id=actor))
  ), sent as (
    -- A successful CRM outreach audit is the explicit source for development
    -- mail. Replies, drafts, failures and external unclassified messages are excluded.
    select e.id,e.actor_id as salesperson_id,e.entity_id as inquiry_id,e.created_at as sent_at,
      nullif(e.after_data->>'message_id','') as message_id
    from public.audit_logs e
    join sales_scope s on s.id=e.actor_id
    join public.inquiries i on i.id=e.entity_id
    where e.entity_type='inquiry' and e.action='outreach_email_sent'
      and e.created_at>=period_start and e.created_at<period_end
      and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
  ), sent_stats as (
    select s.id as salesperson_id,
      count(x.id)::integer as development_sent,
      count(x.id) filter(where x.sent_at<=clock_timestamp()-interval '7 days')::integer as mature_7d_sent,
      count(x.id) filter(where x.sent_at<=clock_timestamp()-interval '7 days' and x.message_id is not null
        and exists(
          select 1 from public.email_messages incoming
          join public.mailbox_connections box on box.id=incoming.mailbox_connection_id
          where incoming.inquiry_id=x.inquiry_id and incoming.direction='inbound'
            and incoming.association_status='matched' and incoming.received_at>=x.sent_at
            and incoming.received_at<x.sent_at+interval '7 days'
            and box.user_id=x.salesperson_id and box.mailbox_kind='personal'
            and (incoming.in_reply_to=x.message_id or x.message_id=any(coalesce(incoming.reference_ids,'{}'::text[])))
        ))::integer as replied_7d
    from sales_scope s left join sent x on x.salesperson_id=s.id
    group by s.id
  ), inbound_stats as (
    select s.id as salesperson_id,count(m.id)::integer as customer_inbound
    from sales_scope s
    left join public.mailbox_connections b on b.user_id=s.id and b.mailbox_kind='personal'
    left join public.email_messages m on m.mailbox_connection_id=b.id and m.direction='inbound'
      and m.association_status='matched' and m.received_at>=period_start and m.received_at<period_end
    left join public.inquiries i on i.id=m.inquiry_id and i.owner_id=s.id and i.validity='valid'
      and coalesce(i.excluded_from_dashboard,false)=false
    where m.id is null or i.id is not null
    group by s.id
  ), reply_stats as (
    select s.id as salesperson_id,
      count(r.id) filter(where r.status='open')::integer as pending_replies,
      count(r.id) filter(where r.status='open' and r.received_at<=clock_timestamp()-interval '24 hours')::integer as overdue_replies,
      count(r.id) filter(where r.status='replied')::integer as replied_in_period,
      count(r.id) filter(where r.status='replied' and r.replied_at<=r.received_at+interval '24 hours')::integer as replied_within_24h,
      round((percentile_cont(0.5) within group(order by extract(epoch from (r.replied_at-r.received_at))/60)
        filter(where r.status='replied'))::numeric,1) as median_reply_minutes
    from sales_scope s
    left join public.email_reply_reminders r on r.owner_id=s.id and r.received_at>=period_start and r.received_at<period_end
    left join public.inquiries i on i.id=r.inquiry_id and i.owner_id=s.id and i.validity='valid'
      and coalesce(i.excluded_from_dashboard,false)=false
    where r.id is null or i.id is not null
    group by s.id
  ), ai_stats as (
    select s.id as salesperson_id,
      count(distinct result.id)::integer as ai_generated,
      count(distinct result.id) filter(where result.status='pending_human_review')::integer as ai_pending_review,
      count(distinct job.id) filter(where job.status in ('queued','processing'))::integer as ai_queued,
      count(distinct job.id) filter(where job.status='failed')::integer as ai_failed,
      max(result.created_at) as ai_last_observation_at
    from sales_scope s
    left join public.sales_email_analysis_results result on result.salesperson_id=s.id and result.period_start=target_period_start
    left join public.sales_email_analysis_jobs job on job.salesperson_id=s.id and job.period_start=target_period_start
    group by s.id
  ), mailbox_stats as (
    select s.id as salesperson_id,
      coalesce((select b.status from public.mailbox_connections b where b.user_id=s.id and b.mailbox_kind='personal'
        order by case b.status when 'connected' then 0 when 'error' then 1 else 2 end,b.updated_at desc limit 1),'not_connected') as mailbox_status,
      (select max(coalesce(c.last_synced_at,b.last_synced_at)) from public.mailbox_connections b
        left join public.email_sync_cursors c on c.mailbox_connection_id=b.id
        where b.user_id=s.id and b.mailbox_kind='personal') as last_synced_at,
      coalesce((select bool_or(c.last_error is not null) from public.mailbox_connections b
        left join public.email_sync_cursors c on c.mailbox_connection_id=b.id
        where b.user_id=s.id and b.mailbox_kind='personal'),false) as sync_has_error
    from sales_scope s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sales_id',s.id,'sales_name',s.full_name,'team',s.team,
    'development_sent',ss.development_sent,'mature_7d_sent',ss.mature_7d_sent,'replied_7d',ss.replied_7d,
    'reply_rate_7d',case when ss.mature_7d_sent=0 then null else round(ss.replied_7d::numeric/ss.mature_7d_sent,4) end,
    'customer_inbound',coalesce(ins.customer_inbound,0),
    'pending_replies',coalesce(rs.pending_replies,0),'overdue_replies',coalesce(rs.overdue_replies,0),
    'replied_in_period',coalesce(rs.replied_in_period,0),'replied_within_24h',coalesce(rs.replied_within_24h,0),
    'median_reply_minutes',rs.median_reply_minutes,
    'ai_generated',coalesce(ai.ai_generated,0),'ai_pending_review',coalesce(ai.ai_pending_review,0),
    'ai_queued',coalesce(ai.ai_queued,0),'ai_failed',coalesce(ai.ai_failed,0),'ai_last_observation_at',ai.ai_last_observation_at,
    'mailbox_status',ms.mailbox_status,'last_synced_at',ms.last_synced_at,'sync_has_error',ms.sync_has_error
  ) order by s.full_name),'[]'::jsonb) into people_result
  from sales_scope s
  join sent_stats ss on ss.salesperson_id=s.id
  left join inbound_stats ins on ins.salesperson_id=s.id
  left join reply_stats rs on rs.salesperson_id=s.id
  left join ai_stats ai on ai.salesperson_id=s.id
  left join mailbox_stats ms on ms.salesperson_id=s.id;

  with sales_scope as (
    select p.id from public.profiles p
    where p.active=true and p.role='sales'
      and (actor_role='owner'
        or (actor_role='sales_manager' and p.team is not distinct from actor_team)
        or (actor_role='sales' and p.id=actor))
  ), activity as (
    select e.actor_id as salesperson_id,(e.created_at at time zone 'Asia/Shanghai')::date as activity_day,
      count(*)::integer as development_sent,0::integer as customer_inbound
    from public.audit_logs e join sales_scope s on s.id=e.actor_id
    join public.inquiries i on i.id=e.entity_id
    where e.entity_type='inquiry' and e.action='outreach_email_sent'
      and e.created_at>=period_start and e.created_at<period_end
      and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    group by e.actor_id,(e.created_at at time zone 'Asia/Shanghai')::date
    union all
    select i.owner_id,(m.received_at at time zone 'Asia/Shanghai')::date,0::integer,count(*)::integer
    from public.email_messages m
    join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
    join public.inquiries i on i.id=m.inquiry_id and i.owner_id=b.user_id
    join sales_scope s on s.id=i.owner_id
    where m.direction='inbound' and m.association_status='matched'
      and m.received_at>=period_start and m.received_at<period_end
      and i.validity='valid' and coalesce(i.excluded_from_dashboard,false)=false
    group by i.owner_id,(m.received_at at time zone 'Asia/Shanghai')::date
  ), daily_groups as (
    select a.salesperson_id,a.activity_day,sum(a.development_sent)::integer as development_sent,
      sum(a.customer_inbound)::integer as customer_inbound
    from activity a group by a.salesperson_id,a.activity_day
  )
  select coalesce(jsonb_agg(jsonb_build_object('sales_id',d.salesperson_id,'day',d.activity_day,
    'development_sent',d.development_sent,'customer_inbound',d.customer_inbound)
    order by d.activity_day,d.salesperson_id),'[]'::jsonb) into daily_result
  from daily_groups d;

  return jsonb_build_object('period_start',target_period_start,
    'period_end',(target_period_start+interval '1 month'-interval '1 day')::date,
    'timezone','Asia/Shanghai','people',coalesce(people_result,'[]'::jsonb),
    'daily',coalesce(daily_result,'[]'::jsonb),
    'scoring_policy','observation_only_no_score_or_rank_effect',
    'definitions',jsonb_build_object(
      'development_sent','仅统计 CRM 成功发送且写入 outreach_email_sent 审计的开发信；不含回复、草稿、失败和未分类邮箱外发',
      'reply_rate_7d','发送满 7 天的开发信中，7 天内收到同一 RFC 邮件线程客户来信的比例；未满 7 天不进入分母',
      'customer_inbound','业务员个人邮箱内已关联、有效且未排除询盘的客户来信',
      'reply_handling','客户来信到业务员回复的提醒状态、24 小时比例和中位耗时',
      'privacy','仅返回按角色范围聚合的数据，不返回正文、主题、邮箱地址或客户明细'));
end;
$$;

revoke all on function public.get_sales_email_activity_metrics(date) from public,anon;
grant execute on function public.get_sales_email_activity_metrics(date) to authenticated;

notify pgrst,'reload schema';
commit;
