import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSubmission,publicUrl} from '../supabase/functions/business-company-intake/payload.mjs';
import {websiteFacts,mergePublicFacts,researchCompanyDomain,normalizeEditorFacts} from '../assets/business-public-research.mjs';
const sample=()=>({domain:'example.com',company:'Example Ltd',country:'Test',identity_confirmed:true,publication_reviewed:true,expected_version:0,request_id:'12345678-1234-4123-8123-123456789012',facts:[{field:'products',value:'Door hardware',source_url:'https://example.com/products',accessed_at:'2026-10-21',verification:'official_self_report'}]});
test('reviewed public facts are normalized and preserve missing event date',()=>{const x=normalizeSubmission(sample());assert.equal(x.payload.facts[0].event_date,null);assert.equal(x.expected_version,0)});
test('no arbitrary CRM/contact fields or unreviewed publication',()=>{for(const extra of [{email:'a@example.com'},{original_message:'private'},{publication_reviewed:false},{expected_version:null}])assert.throws(()=>normalizeSubmission({...sample(),...extra}));});
test('private values, provider identity and unsupported evidence fail closed',()=>{for(const change of [{domain:'web3forms.com'},{company:'Web3Forms'},{facts:[{...sample().facts[0],value:'contact a@example.com'}]},{facts:[{...sample().facts[0],source_url:'https://other.com/a'}]},{facts:[{...sample().facts[0],accessed_at:'2026-02-30'}]}])assert.throws(()=>normalizeSubmission({...sample(),...change}));});
test('public evidence URLs cannot carry query credentials, IPs or insecure sources',()=>{for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://example.com/?token=foo','https://example.com:8000'])assert.throws(()=>publicUrl(url));});
test('browser projection only uses current website evidence, not private CRM fields',()=>{
 const f=websiteFacts({original_message:'PRIVATE INQUIRY',contacts:['PRIVATE CONTACT'],website_evidence:[{title:'Doors',description:'Manufacturer',headings:['Catalogue'],url:'https://example.com/products'}]},'2026-10-21');
 assert.equal(f.length,1);assert.equal(f[0].field,'profile');assert.equal(f[0].verification,'official_self_report');assert.equal(f[0].event_date,null);assert.ok(!JSON.stringify(f).includes('PRIVATE'));assert.match(f[0].value,/Catalogue/);
});
test('refresh deduplicates same evidence without deleting historical facts',()=>{
 const old=sample().facts[0],fresh={...old,accessed_at:'2026-10-22'},changed={...fresh,value:'Updated product line'};
 assert.deepEqual(mergePublicFacts([old],[fresh]),[old]);assert.deepEqual(mergePublicFacts([old],[changed]),[old,changed]);assert.deepEqual(mergePublicFacts([old],[]),[old]);
});
test('mailbox and transport domains are not buyer company websites',()=>{
 for(const domain of ['mail.ru','www.mail.ru','gmail.com','outlook.com','app.web3forms.com','yandex.ru']){assert.equal(researchCompanyDomain(domain),'');assert.throws(()=>normalizeSubmission({...sample(),domain}));}
 assert.equal(researchCompanyDomain('https://www.example.com/about'),'example.com');
});
test('dynamic website title alone cannot masquerade as substantive company research',()=>{
 assert.deepEqual(websiteFacts({website_evidence:[{title:'Imprac',url:'https://imprac.com.ar/'}]},'2026-10-22'),[]);
 assert.throws(()=>normalizeSubmission({...sample(),facts:[{...sample().facts[0],value:'Example Ltd'}]}),/substantive_public_fact_required/);
});
test('manual public evidence requires a value and source while preserving unknown event date',()=>{
 const facts=normalizeEditorFacts([{field:'products',value:'  Publicly listed door hardware range  ',source_url:' https://example.com/products ',event_date:''}],'2026-10-22');
 assert.equal(facts[0].value,'Publicly listed door hardware range');assert.equal(facts[0].source_url,'https://example.com/products');assert.equal(facts[0].event_date,null);assert.equal(facts[0].verification,'official_self_report');
 assert.throws(()=>normalizeEditorFacts([{field:'products',value:'A description',source_url:''}],'2026-10-22'));
 assert.throws(()=>normalizeEditorFacts([{field:'contacts',value:'Private contact',source_url:'https://example.com'}],'2026-10-22'));
 assert.deepEqual(normalizeEditorFacts([{field:'profile',value:'',source_url:''}],'2026-10-22'),[]);
});
