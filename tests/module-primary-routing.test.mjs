import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('      $("#module-primary").addEventListener("click", async () => {');
const handler=html.slice(start,html.indexOf('      $("#calendar-generate-daily")',start));
const direct=html.match(/modulePrimary\.onclick = [^\n]+/)[0];
async function click(view){
 const calls=[];let listener;
 const button={addEventListener:(_,fn)=>listener=fn};
 const context={activeModuleView:view,view,modulePrimary:button,$:()=>button,
 openMailboxBinding:()=>calls.push('mailbox'),runRiskScan:()=>calls.push('scan'),
 openSales360CycleForm:()=>calls.push('cycle'),openWhatsAppConnectionForm:()=>calls.push('whatsapp'),
 openDailyPlanEditor:()=>calls.push('daily'),openKnowledgeEditor:()=>calls.push('knowledge'),
 openMailTemplateEditor:()=>calls.push('template'),appConfirm:async()=>{calls.push('confirm-mail');return false}};
 vm.runInNewContext(handler+'\n'+direct,context);
 await listener();await button.onclick?.();return calls;
}
test('risk scan and scoring primary actions fire once without mailbox fallthrough',async()=>{
 assert.deepEqual(await click('risk-review'),['scan']);
 assert.deepEqual(await click('performance-360'),['cycle']);
 assert.deepEqual(await click('whatsapp'),['whatsapp']);
});
test('only settings opens general mailbox setup; other modules retain their actions',async()=>{
 for(const [view,expected] of [['settings','mailbox'],['follow-calendar','daily'],['knowledge','knowledge'],['templates','template'],['communications','confirm-mail']])assert.deepEqual(await click(view),[expected]);
 assert.deepEqual(await click('unknown'),[]);
});
