import test from 'node:test';
import assert from 'node:assert/strict';
import {privateBundleInput} from '../assets/agent-private-intelligence.mjs';
const bundle={schema:'grace-private-intelligence-bundle-v1',documents:[{kind:'product',synthetic:true}]},raw=JSON.stringify(bundle);
test('private input uses one explicit source and the same bounded bundle schema',async()=>{
 assert.deepEqual(await privateBundleInput(null,raw),bundle);assert.deepEqual(await privateBundleInput({size:raw.length,text:async()=>raw}),bundle);
 await assert.rejects(()=>privateBundleInput(null,''));await assert.rejects(()=>privateBundleInput({size:1,text:async()=>raw},raw));
 await assert.rejects(()=>privateBundleInput(null,JSON.stringify({...bundle,documents:[]})));
 await assert.rejects(()=>privateBundleInput(null,JSON.stringify({...bundle,documents:Array(6).fill({})})));
});
test('private input checks UTF8 bytes, rejects null/invalid JSON and never echoes source text',async()=>{
 await assert.rejects(()=>privateBundleInput(null,'null'),/格式不正确/);
 await assert.rejects(()=>privateBundleInput(null,'synthetic broken body'),e=>e.message==='知识包格式不正确');
 await assert.rejects(()=>privateBundleInput({size:262145,text:async()=>{throw Error('must not read')}}),/超过256KB/);
 await assert.rejects(()=>privateBundleInput(null,JSON.stringify({...bundle,large:'中'.repeat(90000)})),/超过256KB/);
});
