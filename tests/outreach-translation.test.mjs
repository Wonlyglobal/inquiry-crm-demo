import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {translationRequest,approvedCustomerCopy,translationBody,checkedTranslation} from '../supabase/functions/outreach-translate/policy.mjs';
const id='11111111-2222-3333-4444-555555555555';
const copy={subject:'Model 1.0',body:'Hello, please confirm 20 doors. Thank you.'};
test('translation accepts only final ID and allowlisted language',()=>{
 assert.equal(translationRequest({final_copy_id:id,target_language:'es'}).target_language,'es');
 for(const value of [{final_copy_id:id,target_language:'xx'},{final_copy_id:id,target_language:'es',body:'raw thread'},{final_copy_id:'zzzzzzzz-2222-3333-4444-555555555555',target_language:'es'}])assert.throws(()=>translationRequest(value));
});
test('provider payload includes only final customer text, not source metadata',()=>{
 const result=translationBody(approvedCustomerCopy({...copy,inquiry_id:id,private_evidence:'never send'}),'es');
 assert.deepEqual(JSON.parse(result.messages[1].content),copy);
 assert.equal(JSON.stringify(result).includes(id),false);
 assert.equal(result.model,'qwen-plus');
});
test('internal drafts and high sensitive fields fail closed',()=>{
 for(const body of ['【Grace 产品证据草稿｜仅内部审核，不可直接发送】','IBAN: DE1234','passport number: 123','api_key=secret','银行卡号1234','1234567890123456'])assert.throws(()=>approvedCustomerCopy({...copy,body}));
});
test('incomplete or numeric-changing translation cannot save',()=>{
 const payload=(body,finish_reason='stop')=>({choices:[{finish_reason,message:{content:JSON.stringify({subject:'Modelo 1.0',body})}}]});
 assert.throws(()=>checkedTranslation(payload('Confirme 200 puertas.'),copy));
 assert.throws(()=>checkedTranslation(payload('Confirme 20 puertas.','length'),copy));
 assert.equal(checkedTranslation(payload('Confirme 20 puertas.'),copy).body,'Confirme 20 puertas.');
});
test('server uses user RLS for business writes and fixed Beijing provider',()=>{
 const code=readFileSync(new URL('../supabase/functions/outreach-translate/index.ts',import.meta.url),'utf8');
 assert.match(code,/client\.from\('outreach_final_copies'\)/);
 assert.match(code,/client\.from\('outreach_drafts'\)\.insert/);
 assert.doesNotMatch(code,/admin\.from\('outreach_drafts'\)/);
 assert.match(code,/OUTREACH_TRANSLATION_POLICY/);
 assert.match(code,/providerJson\(CHAT_URL,translationBody\(copy/);
 assert.match(code,/readback_verified:true,pending_human_review:true,send_allowed:false/);
});
test('final snapshots are append-only with own actor and visible source draft',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261024110000_outreach_final_copy.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/final_copy_append_only/);
 assert.match(sql,/created_by=auth.uid\(\)/);
 assert.doesNotMatch(sql,/security definer/i);
 assert.match(sql,/unique\(draft_id,source_hash\)/);
});
test('translation requires same inquiry, draft, subject, body and language as final snapshot',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const values={'#outreach-selected-subject':'a','#outreach-subject-a':'Hello','#outreach-body':'Customer copy','#outreach-target-language':'英文'};
 const context={currentInquiry:{id:'inquiry',outreachDraftId:'draft'},outreachLanguageCodes:{英文:'en'},$:key=>({value:values[key]})};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('      function finalCopyMatches('),html.indexOf('      async function restoreOutreachFinalCopy(')),context);
 const snapshot={inquiry_id:'inquiry',draft_id:'draft',subject:'Hello',body:'Customer copy',source_language:'en'};
 assert.equal(context.finalCopyMatches(snapshot),true);
 for(const [key,value] of Object.entries({inquiry_id:'other',draft_id:'other',subject:'changed',body:'changed',source_language:'fr'}))assert.equal(context.finalCopyMatches({...snapshot,[key]:value}),false);
});
test('UI saves new versions and translation never calls legacy generator',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const save=html.slice(html.indexOf('      async function saveOutreachDraft()'),html.indexOf('      $("#save-outreach").addEventListener'));
 assert.match(save,/from\("outreach_drafts"\)\.insert\(payload\)/);
 assert.doesNotMatch(save,/\.update\(/);
 assert.match(save,/readback\.data\?\.body!==body/);
 const start=html.indexOf("document.querySelectorAll('[data-outreach-language]')");
 const listener=html.slice(start,html.indexOf('      $("#copy-outreach")',start));
 assert.match(listener,/translateFinalOutreach/);assert.doesNotMatch(listener,/generateOutreach/);
});
