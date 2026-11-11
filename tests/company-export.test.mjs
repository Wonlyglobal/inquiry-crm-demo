import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261111120000_followup_company_exports.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../assets/company-export-ui.mjs',import.meta.url),'utf8');
test('dedicated export exception leaves existing roles, RLS and dual approval functions unchanged',()=>{
 assert.doesNotMatch(sql,/update public\.profiles|alter policy|create or replace function|alter table public/);
 for(const n of ['grants','requests','events']){assert.match(sql,new RegExp('alter table private.company_export_'+n+' enable row level security'));}
 assert.match(sql,/revoke all on function public.company_export_workspace\(text,jsonb\) from public,anon,service_role/);
 assert.match(sql,/me.id<>g.approver_id/);assert.match(sql,/me.id<>g.requester_id/);
 assert.match(sql,/grant_version<>g.version/);assert.match(sql,/for share/);assert.match(sql,/risk-control:/);
});
test('all six categories use production-only snapshots, no raw mail, attachment or bank fields',()=>{
 for(const k of ['customers','contacts','opportunities','followups','quotations','leads'])assert.ok(sql.includes(`'${k}'=any(kinds)`));
 assert.doesNotMatch(sql,/from public\.email_|from public\.customer_documents|bank_account|access_token|original_message/);
 assert.match(sql,/attribution_correction_id is null/);assert.match(sql,/merged_into_id is null/);assert.match(sql,/is_test_data/);
 assert.match(sql,/20MB/);assert.match(sql,/private.crm_export_csv_cell/);assert.match(sql,/status='consumed'/);
});
test('UI only saves server approved CSV and escapes every preview',()=>{
 assert.match(ui,/client.rpc\('company_export_workspace'/);assert.match(ui,/if\(!initial\?\.enabled\)return/);
 assert.match(ui,/saveFile\(file.filename,'\\ufeff'\+file.csv\)/);
 assert.match(ui,/esc\(JSON.stringify\(rows,null,2\)\)/);
 assert.doesNotMatch(ui,/localStorage|signInWithPassword|service_role|\.from\(/);
});
