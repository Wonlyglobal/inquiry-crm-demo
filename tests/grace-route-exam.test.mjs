import test from 'node:test';import assert from 'node:assert/strict';
import {route,EXAM} from '../scripts/grace-route-exam.mjs';
import {specIntent,specAnswer} from '../supabase/functions/agent-conversation/catalog-spec.mjs';

test('routing exam: every typical question reaches the path that has its data',()=>{
 const fails=EXAM.map(c=>{const [r,d]=route(c.q);return new RegExp(c.expect).test(r+' '+d)?null:`${c.q} -> ${r} ${d}`}).filter(Boolean);
 assert.deepEqual(fails,[]);assert.ok(EXAM.length>=60);
});
const catalog={products:[
 {catalog:'c1',page:12,category:'fire_window',model:'FW-60',specs:{'Fire rating':'EI 60'}},
 {catalog:'c2',page:8,category:'security_door',model:'W-S1',specs:{'Grade':'Grade A (GB 17565)','Thickness':'70mm'}},
 {catalog:'c3',page:5,category:'wooden_door',model:'MW-1',specs:{'Core fill':'honeycomb'}}],
 pages:[{catalog:'c3',page:3,text:'静音木门 采用多层密封 静音设计'}]};
test('spec lookup: catalogue values with pages, never generic numbers',()=>{
 const f=specAnswer(specIntent('防火门耐火多久'),catalog);assert.match(f,/EI 60（FW-60；工程画册 PDF第12页）/);
 const w=specAnswer(specIntent('静音木门隔音多少分贝'),catalog);assert.match(w,/没有写明木门的「隔声」/);assert.match(w,/不会用行业通用数值/);
 const r=specAnswer(specIntent('有没有达到 RC3 防盗等级的门'),catalog);assert.match(r,/没有找到明确标为 RC3/);assert.match(r,/Grade A/);
 assert.equal(specIntent('木门多久能交货'),null);assert.equal(specIntent('竞品防火门耐火等级'),null);
});
test('a named model goes to the model card, not the spec lookup',async()=>{
 const {readFileSync}=await import('node:fs');const ts=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.match(ts,/catalog&&!findModels\(input\.question,catalog\)\.length\?specAnswer/);
});
