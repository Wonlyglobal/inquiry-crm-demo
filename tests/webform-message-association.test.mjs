import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWebsiteFormMessage,isWebsiteFormServiceDomain} from '../mail-sync/src/website-form.mjs';
const source=readFileSync(new URL('../mail-sync/src/index.mjs',import.meta.url),'utf8');
const matchSource=source.slice(source.indexOf('async function matchInquiry('),source.indexOf('\nasync function reconcileMessageCopies('));
function matcher(tables){
  const calls=[];
  const db={from(table){const filters=[];const chain={select(){return chain},eq(key,value){filters.push([key,value]);return chain},not(){return chain},limit(){calls.push({table,filters});return Promise.resolve({data:tables[table]||[],error:null})}};return chain}};
  const match=new Function('db','headerId','parseWebsiteFormMessage','isWebsiteFormServiceDomain',`${matchSource};return matchInquiry;`)(db,x=>String(x||'').replace(/^<|>$/g,''),parseWebsiteFormMessage,isWebsiteFormServiceDomain);
  return {match,calls};
}
const connection={mailbox_kind:'shared_inquiry'};
const message={direction:'inbound',sender_email:'notify@web3forms.com',message_id:'new@example.test',in_reply_to:'old@example.test',reference_ids:['old@example.test'],subject:'WONLY Enquiry',body_text:'name: Synthetic Buyer\ncompany: Buyer Ltd\nemail: buyer@example.test\nsource: quote_modal'};
test('new provider form ignores old thread and shared sender; next form remains independent',async()=>{
 const {match,calls}=matcher({});
 assert.equal((await match(message,connection)).method,'website_new_submission');
 assert.equal((await match({...message,message_id:'second@example.test'},connection)).method,'website_new_submission');
 assert.ok(calls.every(x=>x.filters.every(([key])=>key==='message_id')));
});
test('same submission reuses exact intake and never creates a second lead',async()=>{
 const {match}=matcher({email_intake:[{id:'intake',inquiry_id:'lead'}]});
 assert.equal((await match(message,connection)).id,'lead');
});
test('review-pending malformed vendor form stays unlinked on repeated sync',async()=>{
 const {match}=matcher({email_intake:[{id:'pending',inquiry_id:null}]});
 const result=await match({...message,body_text:'incomplete form'},connection);
 assert.equal(result.id,null);assert.equal(result.intakeId,'pending');
});
