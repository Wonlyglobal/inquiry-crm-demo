import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {MAIL_TYPES,mailTypeRows,renderMailTypeWorkspace,mailParticipationLabel} from '../assets/sales-mail-types.mjs';
import {CATEGORIES} from '../supabase/functions/sales-mail-types/classification.mjs';
test('two new manual categories do not change approved external AI taxonomy',()=>{
 assert.equal(MAIL_TYPES.business_followup,'一般商务跟进');assert.equal(MAIL_TYPES.project_materials,'项目资料往来');assert.equal(CATEGORIES.length,9);assert.ok(!CATEGORIES.includes('business_followup'));
 const rows=mailTypeRows([{id:'s'}],{month:'2026-09',people:[{sales_id:'s',total:2,pending:0,skipped:0,failed:0,confirmed:{business_followup:1,project_materials:1},suggested:{}}]},'2026-09');assert.equal(rows[0].available,true);
});
test('participation is independent from category, copied does not claim personal outreach',()=>{
 const h=renderMailTypeWorkspace([{id:'x',category:'business_followup',method:'human',participation:'copied',subject:'<script>'}]);assert.match(h,/抄送参与（不计本人开发信）/);assert.match(h,/一般商务跟进/);assert.doesNotMatch(h,/<script>/);assert.equal(mailParticipationLabel('bogus'),'参与方式待核实');
});
test('migration adds enum/independent projection and server sender guard but keeps existing auth and fingerprints',()=>{
 const s=fs.readFileSync(new URL('../supabase/migrations/20261023180000_mail_business_types.sql',import.meta.url),'utf8');assert.match(s,/business_followup.*project_materials/);assert.match(s,/outreach_requires_personal_sender/);assert.match(s,/before insert/);assert.match(s,/source_drift_get_sales_mail_type_workspace/);assert.match(s,/private.sales_mail_type_detail\(auth.uid\(\),m.id\)/);assert.doesNotMatch(s,/create or replace function private.sales_mail_type_hash|update public|delete from|grant .*private.sales_mail_participation/i);
});
