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
const direct=readFileSync(new URL('../supabase/migrations/20261112100000_owner_direct_company_exports.sql',import.meta.url),'utf8');
test('direct export is an explicit per-account flag and never a role-wide bypass',()=>{
 assert.match(direct,/add column direct_download boolean not null default false/);
 assert.match(direct,/g.direct_download and not exists\(select 1 from public.profiles where id=g.requester_id and role='owner'\)/);
 assert.match(direct,/r.direct_download is distinct from g.direct_download/);
 assert.match(direct,/me.id=r.requester_id or g.direct_download/);
 assert.match(direct,/'direct_authorized'/);assert.match(direct,/new.direct_download,new.id/);
 assert.match(direct,/requester_id=r.requester_id and approver_id=r.approver_id/);
 assert.match(ui,/r.can_approve/);assert.match(ui,/r.can_download/);assert.match(ui,/created.direct/);
 assert.doesNotMatch(direct,/update public.profiles|alter policy|grant .* on .* to authenticated/);
});
