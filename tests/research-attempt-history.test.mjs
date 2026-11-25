import test from 'node:test';import assert from 'node:assert/strict';import {attemptText,loadAttemptHistory} from '../assets/research-attempt-history.mjs';
test('saved search remains pending identity; unavailable is never represented as complete',()=>{
 const row={created_at:'2026-11-25T00:00:00Z',status:'unavailable',company_claim:'MSB Company',location_claim:'Riyadh',result:{}};
 assert.match(attemptText(row),/检索未完成，身份待核验/);assert.match(attemptText({...row,status:'completed'}),/检索完成，身份待核验/);assert.match(attemptText(row),/未公开入库/);
});
test('history retrieval failure and stale inquiry cannot erase or invent saved research',async()=>{
 const panel={textContent:'old'},client={from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({error:{message:'denied'}})})};
 await loadAttemptHistory({client,panel,inquiryId:'one',isCurrent:()=>true});assert.match(panel.textContent,/读取失败/);
});
