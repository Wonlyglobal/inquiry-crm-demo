import test from 'node:test';
import assert from 'node:assert/strict';
import {officialInquiryRows} from '../assets/official-inquiries.mjs';
test('official inquiry scope excludes personal imports even when labelled website; unknown is not official',async()=>{
 const rows=[{id:'a',source:'website'},{id:'b',source:'website'},{id:'c',source:'other'}];
 const result=await officialInquiryRows(rows,async()=>({data:[{id:'a',origin:'official'},{id:'b',origin:'personal'},{id:'c',origin:'unknown'}]}));
 assert.deepEqual(result,[rows[0]]);assert.equal(rows.length,3);
});
test('origin batches cover all pages and failure does not silently show all imported data',async()=>{
 let calls=0;const rows=Array.from({length:401},(_,i)=>({id:String(i)}));
 const result=await officialInquiryRows(rows,async(name,{target_ids})=>{calls++;assert.equal(name,'get_inquiry_channel_origins');assert.ok(target_ids.length<=200);return {data:target_ids.map(id=>({id,origin:'official'}))}});
 assert.equal(result.length,401);assert.equal(calls,3);
 await assert.rejects(()=>officialInquiryRows(rows,async()=>({error:{message:'unavailable'}})),/核对失败/);
});
