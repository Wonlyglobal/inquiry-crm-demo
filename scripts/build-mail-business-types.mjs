// Generate additive migration from reviewed prior RPC sources; existing auth/hash/order remain exact.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),base=await readFile(new URL('supabase/migrations/20261023123000_sales_mail_types.sql',root),'utf8'),queue=await readFile(new URL('supabase/migrations/20261023160000_sales_mail_review_queue.sql',root),'utf8');
const extract=(text,name)=>{const start=text.indexOf(`create function public.${name}(`),end=text.indexOf('end $$;',start);if(start<0||end<0)throw new Error('RPC source missing');return text.slice(start,end+7).replace('create function','create or replace function');};
let sql=await readFile(new URL('scripts/mail-business-types-prefix.sql',root),'utf8');
for(const [text,name] of [[base,'get_sales_mail_type_workspace'],[queue,'get_sales_mail_type_review_queue']]){
 let f=extract(text,name),needle='coalesce(m.sent_at,m.received_at,m.created_at) as occurred_at,';
 if(f.split(needle).length!==2)throw new Error('RPC projection drift');
 const body=f.split('as $$')[1].split('$$;')[0],hash=createHash('md5').update(body).digest('hex');
 sql+=`\ndo $$ begin if (select md5(prosrc) from pg_proc where oid='public.${name}(${name.endsWith('workspace')?'uuid,date,integer,boolean':'uuid,date,text,integer'})'::regprocedure) is distinct from '${hash}' then raise exception 'source_drift_${name}'; end if; end $$;\n`;
 sql+='\n'+f.replace(needle,needle+'\n private.sales_mail_participation(m) as participation,')+'\n';
}
sql+="\nnotify pgrst,'reload schema';\ncommit;\n";
await writeFile(new URL('supabase/migrations/20261023180000_mail_business_types.sql',root),sql);
if(process.argv[2]){const checks=await readFile(new URL('tests/mail-business-types-rollback.sql',root),'utf8');await writeFile(process.argv[2],sql.replace(/commit;\s*$/,()=>checks+'\nrollback;\n'),{mode:0o600});}
