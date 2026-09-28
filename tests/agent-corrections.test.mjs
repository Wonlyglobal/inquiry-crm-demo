import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {correctionCommand,runCorrectionCommand,relevantCorrections,correctionsInstruction} from '../supabase/functions/agent-conversation/corrections.mjs';
test('correction commands parse submit, list and review; source is mandatory',()=>{
 assert.deepEqual(correctionCommand('纠正：FD-120 门扇厚度为 50mm；原说法：45mm；出处：2026 产品手册第 12 页'),{kind:'submit',correction:'FD-120 门扇厚度为 50mm',wrong:'45mm',source:'2026 产品手册第 12 页'});
 assert.equal(correctionCommand('纠正：FD-120 门扇厚度为 50mm').kind,'invalid');
 assert.equal(correctionCommand('纠正：联系 buyer@example.com 确认；出处：邮件').kind,'invalid');
 assert.deepEqual(correctionCommand('查看待审核纠错'),{kind:'list',status:'pending'});
 assert.deepEqual(correctionCommand('批准纠错 #12'),{kind:'review',decision:'approve',id:12,note:null});
 assert.deepEqual(correctionCommand('驳回纠错 #3 出处不对'),{kind:'review',decision:'reject',id:3,note:'出处不对'});
 assert.equal(correctionCommand('FD-120 厚度多少'),null);assert.equal(correctionCommand('我想纠正一下思路'),null);
});
test('commands call only the reviewer RPCs with the caller client and never claim effect before approval',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);if(name==='submit_agent_correction')return {data:{id:7,status:'pending'},error:null};if(name==='review_agent_correction')return {data:{id:7,status:'approved'},error:null};return {data:[],error:null}}};
 const s=await runCorrectionCommand(correctionCommand('纠正：FD-120 门扇厚度为 50mm；出处：手册第12页'),{client,persona:'Grace'});
 assert.match(s,/#7/);assert.match(s,/尚未生效/);assert.equal(calls[0][0],'submit_agent_correction');assert.equal(calls[0][1].p_persona,'Grace');
 assert.match(await runCorrectionCommand(correctionCommand('批准纠错 #7'),{client,persona:'Grace'}),/已生效/);
 assert.match(await runCorrectionCommand(correctionCommand('查看待审核纠错'),{client,persona:'Grace'}),/没有待审核/);
 const denied={rpc:async()=>({data:null,error:{message:'当前账号无权维护智能体纠错知识'}})};
 assert.match(await runCorrectionCommand(correctionCommand('批准纠错 #7'),{client:denied,persona:'Grace'}),/无权/);
});
test('only relevant approved corrections reach the prompt, with id and source',()=>{
 const rows=[{id:1,persona:'Grace',correction:'FD-120 防火门门扇厚度为 50mm',wrong_claim:'45mm',source_note:'手册第12页',reviewed_at:'2026-09-28T01:00:00Z'},{id:2,persona:'Jay',correction:'沙特展会改到十一月举行',source_note:'主办方邮件',reviewed_at:'2026-09-20T00:00:00Z'}];
 const r=relevantCorrections('FD-120 防火门的门扇厚度是多少',rows);assert.deepEqual(r.map(x=>x.id),[1]);assert.equal(r[0].source,'手册第12页');assert.equal(r[0].approved_at,'2026-09-28');
 assert.deepEqual(relevantCorrections('今天天气如何',rows),[]);assert.match(correctionsInstruction,/已审核纠错 #编号/);
});
test('migration keeps corrections private, reviewer-only and audited',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20260928130000_agent_knowledge_corrections.sql',import.meta.url),'utf8');
 assert.match(sql,/revoke all on public\.agent_knowledge_corrections from anon,authenticated/);
 assert.match(sql,/c43bd3c2-6e3a-4228-99c7-dc95f33643f2/);assert.match(sql,/c\.status='pending'/);
 for(const a of ['agent_correction_submitted',"'agent_correction_'||next_status"])assert.ok(sql.includes(a));
});
