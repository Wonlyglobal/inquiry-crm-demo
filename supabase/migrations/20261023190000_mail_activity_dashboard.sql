begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_summary(date)'::regprocedure) is distinct from 'f695cfed81d61e514e744016ee126c86' then raise exception 'source_drift_mail_summary'; end if; end $$;
create or replace function public.get_sales_mail_type_summary(target_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active and a.role in ('owner','sales_manager','sales')) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date then raise exception 'invalid_period'; end if;
 with scope as (select p.id from public.profiles p where private.sales_mail_type_scope(auth.uid(),p.id)),
 messages as (
 select b.user_id as sales_id,m.id,e.category,e.method,m.direction,m.inquiry_id,
 timezone('Asia/Shanghai',coalesce(m.sent_at,m.received_at,m.created_at))::date as mail_day
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id and b.mailbox_kind='personal'
 join scope s on s.id=b.user_id
 left join lateral (select ev.category,ev.method from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where not exists(select 1 from public.inquiries i where i.id=m.inquiry_id and (i.is_test_data or i.data_environment<>'production'))
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
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
notify pgrst,'reload schema';
commit;
