import test from 'node:test';import assert from 'node:assert/strict';
import {catalogPrecheck,catalogIntent,catalogAnswer,findModels,loadCatalog,resetCatalogCache,validCatalog,PRIVATE_CATALOG} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
// Synthetic fixture only: the real catalogue extract stays in the private bucket, never in this repo.
const catalog={schema:'wonly-catalog-v1',sources:[{id:'c2',edition:'2026-08'}],
 products:[
  {model:'Q80 Max',name:'Remote-Sensing Lock',category:'smart_lock',series:null,catalog:'c4',page:28,specs:{Colour:'Test Gold',Dimensions:'Front panel 400 mm'},claims:[],leaf_options:[],unreadable:[],confidence:'medium'},
  {model:'Q80 Max',name:'Remote-Sensing Lock',category:'smart_lock',series:null,catalog:'c2',page:64,specs:{Colour:'Other Gold'},claims:['Opens at 2-4 m.'],leaf_options:[],unreadable:[],confidence:'high'},
  {model:'Q80',name:'Remote-Sensing Lock',category:'smart_lock',series:null,catalog:'c4',page:15,specs:{Version:'Standard'},claims:[],leaf_options:[],unreadable:['Colour'],confidence:'high'},
  {model:'Z60 Pro',name:'Z60 Pro',category:'smart_door',series:'Smart Door 5.0',catalog:'c2',page:16,specs:{Display:'10.1" touchscreen',Power:'220 V mains'},claims:[],leaf_options:['Single leaf','Double leaf'],unreadable:[],confidence:'high'},
  {model:'WL-T001',name:'Soundproof wooden door',category:'wooden_door',series:'Test Series',catalog:'c3',page:5,specs:{},claims:[],leaf_options:[],unreadable:[],confidence:'medium'},
  {model:'A5',name:'Lock',category:'smart_lock',series:null,catalog:'c1',page:56,specs:{},claims:[],leaf_options:[],unreadable:[],confidence:'high'}],
 facts:[{topic:'patents',text:'over 9 test patents',catalog:'c2',page:3}],
 conflicts:[{topic:'patents',label:'专利数量',statements:[{text:'over 9 test patents',catalog:'c2',page:3},{text:'7 test patents',catalog:'c3',page:3}]}],
 pages:[{catalog:'c1',page:57,text:'Fire Windows Fire resistance: over 1 hour.'}]};

test('precheck only lets product/catalogue questions through, never file requests',()=>{
 assert.equal(catalogPrecheck('Z60 Pro 的参数是什么'),true);
 assert.equal(catalogPrecheck('画册里写的专利数量'),true);
 assert.equal(catalogPrecheck('有哪些智能锁型号'),true);
 assert.equal(catalogPrecheck('把 Z60 Pro 的画册发给我'),false);
 assert.equal(catalogPrecheck('本月沙特询盘质量怎么样'),false);
});
test('models match longest first and short codes are ignored',()=>{
 assert.deepEqual(findModels('Q80 Max 和 Q80 有什么区别',catalog),['Q80 Max','Q80']);
 assert.deepEqual(findModels('q80max的颜色',catalog),['Q80 Max']);
 assert.deepEqual(findModels('Q80-Max 的颜色',catalog),['Q80 Max']);
 assert.deepEqual(findModels('A5 纸打印参数',catalog),[]);
});
test('model answer cites catalogue pages, shows cross-catalogue differences and unreadable fields',()=>{
 const q='Q80 Max 和 Q80 的参数';const a=catalogAnswer(catalogIntent(q,catalog),catalog,q);
 assert.match(a,/未发送给外部模型/);assert.match(a,/真智能锁画册 PDF第28页/);assert.match(a,/零售画册 PDF第64页/);
 assert.match(a,/写作“Other Gold”/);assert.match(a,/看不清、未收录：Colour/);assert.match(a,/Opens at 2-4 m/);assert.match(a,/尚待产品负责人抽检/);
});
test('list, facts with conflicts, and page search',()=>{
 const l=catalogAnswer(catalogIntent('有哪些智能门型号',catalog),catalog);assert.match(l,/Smart Door 5.0：Z60 Pro（零售画册 PDF第16页）/);
 const q='画册里专利有多少';const f=catalogAnswer(catalogIntent(q,catalog),catalog,q);assert.match(f,/over 9 test patents/);assert.match(f,/专利数量”有不同说法/);
 const s=catalogAnswer(catalogIntent('画册里 Fire resistance 怎么写',catalog),catalog);assert.match(s,/工程画册 PDF第57页/);
 assert.equal(catalogIntent('Z60 Pro 的画册 PDF 发我',catalog),null);
 assert.equal(catalogAnswer(catalogIntent('今天天气',catalog),catalog),null);
});
test('loader reads only the private bucket, validates schema and caches',async()=>{
 resetCatalogCache();let calls=0;const admin={storage:{from:b=>{assert.equal(b,PRIVATE_CATALOG.bucket);return {download:async p=>{calls++;assert.equal(p,PRIVATE_CATALOG.path);return {data:new Blob([JSON.stringify(catalog)]),error:null}}}}}};
 assert.ok(await loadCatalog(admin,1000));await loadCatalog(admin,2000);assert.equal(calls,1);
 resetCatalogCache();assert.equal(await loadCatalog({storage:{from:()=>({download:async()=>({data:new Blob(['{"schema":"x"}']),error:null})})}}),null);
 assert.equal(validCatalog({schema:'wonly-catalog-v1',products:[],sources:[]}),true);
});
