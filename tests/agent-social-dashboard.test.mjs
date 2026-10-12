import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {socialDashboardSummary} from '../supabase/functions/agent-conversation/social.mjs';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
const world=await readFile(new URL('../assets/agent-world.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../assets/agent-world.css',import.meta.url),'utf8');

test('social dashboard projection is aggregate-only and preserves unverified status',()=>{
 const result=socialDashboardSummary({status:'available',generated_at:'2026-10-12T00:00:00Z',accounts:[{name:'Private Account',status:'available',through:'2026-10-11T00:00:00Z'}],competitors:[{name:'Private Competitor'}],published_28d:[{platform:'youtube',published_posts:4,recorded_likes:32,recorded_views:800,recorded_comments:3,recorded_shares:2,metric_status:'recorded_not_verified',topics:['private post title']},{platform:'linkedin',published_posts:'bad',recorded_views:null}]});
 assert.equal(result.status,'available');assert.equal(result.own_accounts,1);assert.equal(result.available_accounts,1);assert.equal(result.competitor_accounts,1);
 assert.deepEqual(result.published_28d[0],{platform:'youtube',published_posts:4,recorded_likes:32,recorded_views:800,recorded_comments:3,recorded_shares:2,metric_status:'recorded_not_verified'});
 assert.equal(result.published_28d[1].published_posts,null);assert.equal(result.published_28d[1].recorded_views,null);
 assert.equal(JSON.stringify(result).includes('Private Account'),false);assert.equal(JSON.stringify(result).includes('Private Competitor'),false);assert.equal(JSON.stringify(result).includes('private post title'),false);
 assert.equal(socialDashboardSummary({status:'unavailable'}).status,'unavailable');
});

test('social dashboard is owner-only, audited, rate-limited, and refreshed through the UI',()=>{
 assert.match(edge,/input\.action==='social-dashboard'/);assert.match(edge,/agent_social_dashboard_read/);assert.match(edge,/\(count\|\|0\)>=6/);assert.match(edge,/socialDashboardSummary\(await loadSocial\(authorization\)\)/);
 assert.match(html,/action:'social-dashboard'/);assert.match(html,/socialDashboardAt<900000/);assert.match(html,/worldLiveBoard\(name,seoDashboardState,socialDashboardState\)/);
 assert.match(world,/互动值是社媒系统登记值，尚未核验/);assert.match(world,/社媒只读数据通路暂不可用，不能据此判断内容或互动为零/);assert.match(world,/平台后台为零/);
 assert.match(css,/Grace light workspace/);assert.match(css,/#agent-world\{--glass:#fff/);assert.match(css,/\.live-social-grid/);
});
