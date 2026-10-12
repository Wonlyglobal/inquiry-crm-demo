import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
const world=await readFile(new URL('../assets/agent-world.mjs',import.meta.url),'utf8');

test('Grace dashboard refreshes an owner-only SEO summary on a bounded cache interval',()=>{
 assert.match(html,/Date\.now\(\)-seoDashboardAt<900000/);
 assert.match(html,/body:\{action:'seo-dashboard'\}/);
 assert.match(html,/worldLiveBoard\(name,seoDashboardState,socialDashboardState\)/);
 assert.match(edge,/input\.action==='seo-dashboard'/);
 assert.match(edge,/user\.id!=='c43bd3c2-6e3a-4228-99c7-dc95f33643f2'/);
 assert.match(edge,/user\.email\|\|''\)\.toLowerCase\(\)!=='chloelee@wonlyglobal\.com'/);
 assert.match(edge,/profile\.role!=='owner'/);
 assert.match(edge,/agent_seo_dashboard_read/);
 assert.match(edge,/\(count\|\|0\)>=6/);
});

test('Grace dashboard distinguishes unavailable and stale SEO snapshots from zero metrics',()=>{
 assert.match(world,/SEO只读数据通路未配置，不能据此判断流量为零/);
 assert.match(world,/SEO来源暂不可用，不能据此判断流量为零/);
 assert.match(world,/快照已过期，仅作历史参考/);
 assert.match(world,/7天 GSC 点击/);
 assert.match(world,/28天自然会话/);
});
