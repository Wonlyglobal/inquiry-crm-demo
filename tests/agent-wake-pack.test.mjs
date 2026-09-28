import test from 'node:test';import assert from 'node:assert/strict';
import {createWakeConversation} from '../assets/agent-wake.mjs';
const make=status=>{function R(){}R.prototype.processLocally=true;R.available=async()=>status;R.install=async()=>true;return R};
test('a downloadable language pack is reported so the download waits for a user click',async()=>{
 const w=s=>createWakeConversation({Recognition:make(s),onState:()=>{},onWake:()=>{},onQuestion:()=>{}});
 assert.equal(await w('downloadable').needsDownload(),true);assert.equal(await w('downloading').needsDownload(),true);
 assert.equal(await w('available').needsDownload(),false);assert.equal(await w('unavailable').needsDownload(),false);
 assert.equal(await createWakeConversation({Recognition:undefined,onState:()=>{}}).needsDownload(),false);
});
