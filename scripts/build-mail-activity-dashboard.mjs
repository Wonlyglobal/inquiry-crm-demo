// Mechanical extension of the existing count-only RPC; preserve its exact scope.
import fs from 'node:fs';
import crypto from 'node:crypto';
const path='supabase/migrations/20261023123000_sales_mail_types.sql';
const src=fs.readFileSync(path,'utf8');
let f=src.slice(src.indexOf('create function public.get_sales_mail_type_summary('));
f=f.slice(0,f.indexOf('end $$;')+7);
const oldBody=f.split('as $$')[1].split('$$;')[0];
f=f.replace('create function','create or replace function')
 .replace('m.id,e.category,e.method','m.id,e.category,e.method,m.direction,m.inquiry_id,\n timezone(\'Asia/Shanghai\',coalesce(m.sent_at,m.received_at,m.created_at))::date as mail_day')
 .replace("'total',(select count(*) from messages m where m.sales_id=s.id),",`'total',(select count(*) from messages m where m.sales_id=s.id),
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
 from messages m where m.sales_id=s.id group by mail_day) d),'[]'::jsonb),`)
 .replace("'policy','observation_only_no_performance_score'","'policy','observation_only_no_performance_score','activity_schema','synced-mail-activity-v1'");
const sql=`begin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\ndo $$ begin if (select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_summary(date)'::regprocedure) is distinct from '${crypto.createHash('md5').update(oldBody).digest('hex')}' then raise exception 'source_drift_mail_summary'; end if; end $$;\n${f}\nnotify pgrst,'reload schema';\ncommit;\n`;
fs.writeFileSync('supabase/migrations/20261023190000_mail_activity_dashboard.sql',sql);
