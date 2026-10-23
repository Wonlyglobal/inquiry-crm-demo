import fs from 'node:fs';import crypto from 'node:crypto';
const s=fs.readFileSync('supabase/migrations/20261023180000_mail_business_types.sql','utf8');
let f=s.slice(s.indexOf('create or replace function public.get_sales_mail_type_review_queue('));f=f.slice(0,f.indexOf('end $$;')+7);
const hash=crypto.createHash('md5').update(f.split('as $$')[1].split('$$;')[0]).digest('hex');
f=f.replace("('review','skipped','uncertain','human')","('review','skipped','uncertain','human','awaiting','suggested')")
 .replace('join lateral (select ev.*','left join lateral (select ev.*')
 .replace("and case target_filter when 'review'", "and case target_filter when 'awaiting' then e.method is distinct from 'human' or e.category='uncertain'\n when 'suggested' then e.method='ai' and e.category<>'uncertain'\n when 'review'");
fs.writeFileSync('supabase/migrations/20261023200000_all_pending_mail_review.sql',`begin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\ndo $$ begin if(select md5(prosrc) from pg_proc where oid='public.get_sales_mail_type_review_queue(uuid,date,text,integer)'::regprocedure) is distinct from '${hash}' then raise exception 'source_drift_mail_review_queue'; end if; end $$;\n${f}\nnotify pgrst,'reload schema';\ncommit;\n`);
