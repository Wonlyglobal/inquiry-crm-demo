import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeRequest,composeBody,checkedComposedLetter,publicEvidenceItem} from '../assets/outreach-compose-policy.mjs';
const fact={statement:'Synthetic company distributes entry doors.',source:'https://example.com/about',date:'2026-10-24'};
const input={inquiry_id:'11111111-1111-4111-8111-111111111111',objective:'meeting',tone:'consultative',company_facts:[fact],market_facts:[],product_facts:[],confirmed_public:true};
test('composition requires explicit confirmation and public sourced company evidence',()=>{
 assert.equal(composeRequest(input).company_facts.length,1);
 for(const change of [{confirmed_public:false},{company_facts:[]},{email:'private@example.com'},{original_message:'raw thread'}])assert.throws(()=>composeRequest({...input,...change}));
});
test('public projection rejects internal URLs, contacts, high sensitivity and missing dates',()=>{
 for(const source of ['http://example.com','https://127.0.0.1/x','https://crm.foreverdoodle.com/x','https://abc.supabase.co/x','https://example.com/x?token=a','https://user:pass@example.com/x'])assert.throws(()=>publicEvidenceItem({...fact,source}));
 for(const statement of ['Contact private@example.com','Phone +8613812345678','IBAN DE123','【Grace 产品证据草稿】','api_key=secret','来信人与公司关系尚未核实'])assert.throws(()=>publicEvidenceItem({...fact,statement}));
 assert.throws(()=>publicEvidenceItem({...fact,date:''}));
});
test('model projection retains approved company, market and product facts but no inquiry identifiers',()=>{
 const request=composeRequest({...input,market_facts:[{...fact,statement:'Synthetic dated public market event.'}],product_facts:[{...fact,source:'https://www.wonlyglobal.com/products',statement:'Synthetic approved public product positioning.'}]});
 const payload=composeBody(request),projection=JSON.parse(payload.messages[1].content);
 assert.deepEqual(Object.keys(projection),['company_facts','market_facts','product_facts']);
 assert.equal(projection.market_facts.length,1);assert.equal(projection.product_facts.length,1);
 assert.equal(JSON.stringify(payload).includes(input.inquiry_id),false);
 assert.match(payload.messages[0].content,/20-minute online meeting/);
 assert.doesNotMatch(composeBody({...request,objective:'qualify'}).messages[0].content,/invite one 20-minute/);
});
test('truncated output, credentials and unsolicited promises cannot become drafts',()=>{
 const payload=(letter,finish_reason='stop')=>({choices:[{finish_reason,message:{content:JSON.stringify(letter)}}]});
 assert.throws(()=>checkedComposedLetter(payload({subject:'Synthetic',body:'Hello content'},'length')));
 for(const body of ['Our MOQ is 100 sets.','We guarantee completion.','Email private@example.com','Dear Customer, body','<script>bad</script>'])assert.throws(()=>checkedComposedLetter(payload({subject:'Synthetic',body})));
 assert.equal(checkedComposedLetter(payload({subject:'Synthetic meeting',body:'A public event suggests a relevant discussion. Could we arrange a short call?'})).send_allowed,false);
});
test('server authenticates original user and reads only inquiry id; service role is audit-only',()=>{
 const source=readFileSync(new URL('../supabase/functions/outreach-compose/index.ts',import.meta.url),'utf8');
 assert.ok(source.includes("client.from('inquiries').select('id')"));
 assert.ok(source.includes('OUTREACH_COMPOSE_POLICY'));
 assert.equal(source.includes("admin.from('inquiries')"),false);
 assert.equal(source.includes("from('companies')"),false);
 assert.ok(source.includes('providerJson(CHAT_URL,composeBody(input),key)'));
});
