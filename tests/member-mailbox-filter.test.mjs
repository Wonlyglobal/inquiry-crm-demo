import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const stateSource=html.slice(html.indexOf('      function memberMailboxFilterState('),html.indexOf('      function personalMailboxSettingsLabel('));
const state=vm.runInNewContext(stateSource+';memberMailboxFilterState');
test('known unconnected states remain distinct from unknown/failed/hidden states',()=>{
 assert.equal(state('connected'),'connected');
 for(const status of ['not_connected','error','pending','disabled'])assert.equal(state(status),'not_connected');
 for(const status of [undefined,null,'','unknown','failed','CONNECTED'])assert.equal(state(status),'unknown');
});
const filterSource=html.slice(html.indexOf('      function filterModuleRows()'),html.indexOf('      function renderKnowledgeFilters('));
function fixture(){
 const nodes=new Map();
 const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',classList:{toggle(){}}});return nodes.get(selector)};
 const rows=[{id:'a',cells:['模拟甲','a@example.invalid','已连接'],meta:{memberMailbox:'connected'}},{id:'b',cells:['模拟乙','b@example.invalid','未连接'],meta:{memberMailbox:'not_connected'}},{id:'c',cells:['模拟丙','c@example.invalid','连接异常'],meta:{memberMailbox:'not_connected'}},{id:'d',cells:['模拟丁','d@example.invalid','状态加载失败'],meta:{memberMailbox:'unknown'}}];
 const ctx={$,activeModuleView:'settings',activeInquiryArchive:false,activeInquiryScope:'',activeTodayCategory:'all',inquiryUnreadItems:new Set(),moduleRows:rows,moduleColumns:[],moduleRowClick:null,renderModuleTable:(_columns,visible,_click,filtered)=>{ctx.visible=visible;ctx.filtered=filtered;if(!filtered)ctx.moduleRows=visible;},setModuleState:value=>ctx.emptyState=value};
 vm.createContext(ctx);vm.runInContext(filterSource,ctx);
 return {ctx,$,run:()=>{ctx.filterModuleRows();return Array.from(ctx.visible,row=>row.id)}};
}
test('settings connection filter intersects search, keeps full rows and exposes empty/reset states',()=>{
 const f=fixture();assert.deepEqual(f.run(),['a','b','c','d']);
 f.$('#member-mailbox-filter').value='connected';assert.deepEqual(f.run(),['a']);assert.equal(f.$('#module-filter-summary').textContent,'显示 1 / 4 条');
 f.$('#member-mailbox-filter').value='not_connected';assert.deepEqual(f.run(),['b','c']);
 f.$('#module-search').value=' 模拟乙 ';assert.deepEqual(f.run(),['b']);
 f.$('#module-search').value='A@EXAMPLE.INVALID';assert.deepEqual(f.run(),[]);assert.equal(f.ctx.emptyState,'filtered');
 f.$('#member-mailbox-filter').value='connected';assert.deepEqual(f.run(),['a']);
 f.$('#module-search').value='';f.$('#member-mailbox-filter').value='';assert.deepEqual(f.run(),['a','b','c','d']);
 assert.equal(f.ctx.moduleRows.length,4);
});
test('member filter never applies outside settings',()=>{
 const f=fixture();f.$('#member-mailbox-filter').value='connected';f.ctx.activeModuleView='customers';assert.deepEqual(f.run(),['a','b','c','d']);
});
test('owner mapper uses personal mailbox, never a shared inbox, and preserves unknown status',()=>{
 const start=html.indexOf('          mapper = (x) => {\n            const mailbox =');
 const body=html.slice(start,html.indexOf('        }\n        const moduleResult',start));
 const labels=vm.runInNewContext(html.slice(html.indexOf('      function memberMailboxStatusLabel('),html.indexOf('      function memberMailboxFilterState('))+';memberMailboxStatusLabel');
 const ctx={profile:{id:'owner',role:'owner'},roleNames:{sales:'业务员'},fmtDate:value=>value,memberMailboxFilterState:state,memberMailboxStatusLabel:labels};
 vm.createContext(ctx);vm.runInContext(body,ctx);
 const member={id:'a',full_name:'模拟甲',role:'sales',active:true};
 const mapped=ctx.mapper({...member,mailbox_connections:[{mailbox_kind:'shared_inquiry',status:'connected'},{mailbox_kind:'personal',status:'error'}]});
 assert.equal(mapped.meta.memberMailbox,'not_connected');assert.equal(mapped.cells[6],'连接失败');
 assert.equal(ctx.mapper({...member,mailbox_connections:[{mailbox_kind:'shared_inquiry',status:'connected'}]}).meta.memberMailbox,'not_connected');
 assert.equal(ctx.mapper({...member,mailbox_connections:[{mailbox_kind:'personal',status:'connected'}]}).meta.memberMailbox,'connected');
 assert.equal(ctx.mapper({...member,mailbox_connections:[{mailbox_kind:'personal',status:'unrecognized'}]}).meta.memberMailbox,'unknown');
 assert.equal(ctx.mapper({...member,mailbox_connections:[{mailbox_kind:'personal',status:'unrecognized'}]}).cells[6],'状态未知');
});
test('refresh, cache fallback and reset all retain or clear the correct settings filters',()=>{
 assert.match(html,/const preserveMemberFilters = view === "settings" && activeModuleView === "settings"/);
 assert.match(html,/!preserveEmailSearch && !preserveMemberFilters/);
 assert.match(html,/if\(!preserveMemberFilters\)\$\("#member-mailbox-filter"\)\.value=""/);
 assert.match(html,/if\(view==="settings"\)filterModuleRows\(\);/);
 const reset=html.slice(html.indexOf('      $("#module-reset-filters").addEventListener'),html.indexOf('      $("#module-retry").addEventListener'));
 assert.match(reset,/#member-mailbox-filter"\)\.value = ""/);
 const owner=html.slice(html.indexOf('          mapper = (x) => {\n            const mailbox ='),html.indexOf('        const moduleResult = await runModuleQuery(query);'));
 assert.match(owner,/connection\?\.mailbox_kind==="personal"/);
 assert.match(owner,/memberMailboxFilterState\(mailboxStateHidden\?undefined:/);
 assert.match(html,/memberMailboxFilterState\(statuses.error\?undefined:states.get\(member.id\)\)/);
});
test('control uses the established select style and generated Grace entry stays in sync',()=>{
 assert.match(html,/<select id="member-mailbox-filter" class="module-filter-select" aria-label="筛选成员邮箱连接">/);
 const grace=readFileSync(new URL('../grace.html',import.meta.url),'utf8');
 assert.ok(grace.includes(stateSource));assert.ok(grace.includes(filterSource));
});
