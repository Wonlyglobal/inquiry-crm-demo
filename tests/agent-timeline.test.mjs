import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLabels,windowsFrom,storable,timeLabel,STAGES} from '../assets/agent-timeline.mjs';
import {validateTimelineEntry,timelineWindow,expandTimeline,searchQuery} from '../supabase/functions/agent-conversation/request-timeline.mjs';
import {readFileSync} from 'node:fs';
const id='0b0f3c1e-1111-4222-8333-444455556666';
test('pipeline stages and labels come from the answer',()=>{
 assert.deepEqual(STAGES.map(s=>s[1]),['听懂需求','调取资料','执行动作','给出回答']);
 assert.deepEqual(sourceLabels({context:{route:'catalog'}}),['海外画册']);
 assert.deepEqual(sourceLabels({provider:'local',context:{route:'crm_local',labels:['DeepSeek 推理']}}),['CRM 本地统计','DeepSeek 推理']);
 assert.deepEqual(sourceLabels({provider:'local',context:{route:'intelligence'}}),['智能体情报简报']);
 assert.deepEqual(sourceLabels({provider:'bailian',context:{},materials:[{id}],sources:[{url:'https://a.test'}]}),['CRM 脱敏汇总','物料 1 份','联网来源 1 条']);
});
test('every action becomes an in-page window; nothing is a popup',()=>{
 const w=windowsFrom({actions:[{type:'catalog_view',catalog:'c2',page:16,label:'X60 Pro'},{type:'crm_view',view:'quotes',label:'报价管理',url:'https://crm.foreverdoodle.com/#view=quotes'},{type:'crm_record',id,label:'询盘 #51'},{type:'evidence',id:'e1',label:'ASSA'},{type:'web_search',query:'fire door'},{type:'open_url',url:'javascript:1'}],materials:[{id,name:'手册.pdf'}],sources:[{title:'A',url:'https://a.test/x'},{title:'B',url:'http://b.test'}]});
 assert.deepEqual(w.map(x=>x.kind),['catalog','crm_view','crm_record','evidence','search','material','search']);
 assert.equal(w.at(-1).sources.length,1);
 assert.deepEqual(storable(w[3]),{kind:'evidence',id:'e1'});assert.equal(storable({kind:'link',url:'https://x'}),null);assert.equal('asset' in storable(w[5]),false);
 assert.match(timeLabel(new Date().toISOString()),/^\d\d:\d\d$/);assert.match(timeLabel('2026-01-02T03:04:00Z',new Date('2026-09-28')),/^1\/2 /);
});
test('server keeps only safe descriptors for the timeline',()=>{
 assert.equal(timelineWindow({kind:'crm_view',view:'../x'}),null);assert.equal(timelineWindow({kind:'crm_record',id:'1; drop'}),null);
 assert.equal(timelineWindow({kind:'catalog',catalog:'c5',page:1}),null);assert.equal(timelineWindow({kind:'evidence',id:'nope'}),null);
 assert.equal(timelineWindow({kind:'search',query:'call +971 50 123 4567'}),null);
 assert.deepEqual(timelineWindow({kind:'search',query:'fire door',sources:[{title:'A',url:'https://a.test'},{title:'B',url:'javascript:1'}]}).sources,[{title:'A',url:'https://a.test/'}]);
 assert.equal(timelineWindow({kind:'link',url:'https://x.test'}),null);
 const a=validateTimelineEntry({persona:'Grace',question:' 打开零售画册 ',status:'done',route:'actions',steps:['海外画册'],windows:[{kind:'catalog',catalog:'c2',page:1,label:'零售画册',url:'https://signed'},{kind:'bogus'}]});
 assert.equal(a.p_question,'打开零售画册');assert.deepEqual(a.p_windows,[{kind:'catalog',catalog:'c2',page:1,label:'零售画册'}]);
 assert.throws(()=>validateTimelineEntry({persona:'X',question:'a',status:'done'}),/智能体/);assert.throws(()=>validateTimelineEntry({persona:'Grace',question:'',status:'done'}),/为空/);
 assert.deepEqual(expandTimeline([{id:1,windows:[{kind:'evidence',id:'missing'},{kind:'crm_view',view:'quotes'}]}])[0].windows,[{kind:'crm_view',view:'quotes'}]);
 assert.equal(searchQuery({query:'  WONLY fire door '}),'WONLY fire door');assert.throws(()=>searchQuery({query:'x'}),/太短/);assert.throws(()=>searchQuery({query:'a@b.com'}),/敏感/);
});
test('embed mode: same-origin only, no agent world inside the iframe',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/window\.top\.location\.origin===location\.origin/);assert.match(html,/function enterAgentWorld\(\)\{\n\s+if\(window\.CRM_EMBED/);assert.match(html,/if\(window\.CRM_EMBED\|\|!canUseAgentWorld/);
 assert.match(html,/timelineEntry=worldModel\?\.beginTimeline\(question\)/);assert.equal((html.match(/timelineEntry\?\.done\(/g)||[]).length,3);
 const conv=readFileSync(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');assert.doesNotMatch(conv,/window\.open\(/);
 const tl=readFileSync(new URL('../assets/agent-timeline.mjs',import.meta.url),'utf8');assert.doesNotMatch(tl,/window\.open\(|win\.open\(/);
});
test('catalogue opens enlarged for a new request; empty answers are never shown blank',()=>{
 const tl=readFileSync(new URL('../assets/agent-timeline.mjs',import.meta.url),'utf8');
 assert.match(tl,/autoBig:i===firstCatalog/);assert.match(tl,/compact:true/);assert.match(tl,/e\.key!=='Escape'/);
 const conv=readFileSync(new URL('../assets/agent-conversation.mjs',import.meta.url),'utf8');
 assert.match(conv,/if\(!String\(result\?\.answer\|\|''\)\.trim\(\)\)/);assert.match(conv,/这次没有生成回答/);
});
