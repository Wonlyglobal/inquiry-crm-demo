begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin if(select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_review_queue(uuid,date,text,integer)'::regprocedure) is distinct from 'c3a9b6f42dc43fbffe4dc03d75fc2608' then raise exception 'source_drift_mail_review_queue'; end if; end $$;
create or replace function public.get_sales_mail_type_review_queue(target_sales uuid,target_month date,target_filter text default 'review',target_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sales_mail_type_scope(auth.uid(),target_sales) then raise exception 'forbidden'; end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month>date_trunc('month',timezone('Asia/Shanghai',now()))::date
 or target_filter is null or target_filter not in ('review','skipped','uncertain','human','awaiting','suggested') or target_offset is null or target_offset<0 or target_offset>100000 then raise exception 'invalid_filter_or_period'; end if;
 with eligible as (
 select m.id,m.direction,left(m.subject,300) as subject,private.sales_mail_type_hash(m) as source_hash,
 coalesce(m.sent_at,m.received_at,m.created_at) as occurred_at,
 private.sales_mail_participation(m) as participation,
 e.category,e.method,e.confidence,e.reason,e.evidence,e.model,e.created_at as classified_at
 from public.email_messages m join public.mailbox_connections b on b.id=m.mailbox_connection_id
 left join lateral (select ev.* from public.sales_mail_type_events ev where ev.message_id=m.id and ev.source_hash=private.sales_mail_type_hash(m)
 order by (ev.method='human') desc,ev.created_at desc,ev.id desc limit 1) e on true
 where b.user_id=target_sales and b.mailbox_kind='personal' and private.sales_mail_type_detail(auth.uid(),m.id)
 and coalesce(m.sent_at,m.received_at,m.created_at)>=target_month::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<(target_month+interval '1 month')::timestamp at time zone 'Asia/Shanghai'
 and coalesce(m.sent_at,m.received_at,m.created_at)<=clock_timestamp()
 and case target_filter when 'awaiting' then e.method is distinct from 'human' or e.category='uncertain'
 when 'suggested' then e.method='ai' and e.category<>'uncertain'
 when 'review' then e.method='skipped' or (e.method='ai' and e.category='uncertain')
 when 'skipped' then e.method='skipped' when 'uncertain' then e.method='ai' and e.category='uncertain' when 'human' then e.method='human' else false end
 ), page as (select * from eligible order by occurred_at desc,id limit 50 offset target_offset)
 select jsonb_build_object('total',(select count(*) from eligible),'items',coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc,id) from page p),'[]'::jsonb)) into result;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
