import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {actionIntent,actionAnswer,competitorLinks,competitorLinksFromIntent,safeUrl,ALLOWED_HOSTS,CRM_ORIGIN} from '../supabase/functions/agent-conversation/agent-actions.mjs';
import {competitorIntent} from '../supabase/functions/agent-conversation/public-research.mjs';
import {safeActionUrl,OPEN_WORDS} from '../assets/agent-conversation.mjs';
test('CRM pages open in a new window through the #view= link',()=>{
 const i=actionIntent('帮我打开询盘列表');assert.deepEqual(i.views.map(v=>v.view),['inquiries']);assert.equal(i.views[0].url,CRM_ORIGIN+'#view=inquiries');
 assert.deepEqual(actionIntent('调出今天的销售日报').views.map(v=>v.view),['daily']);
 assert.equal(actionIntent('询盘怎么样'),null);assert.equal(actionIntent('展示一下询盘转化情况'),null);assert.equal(actionIntent('打开心扉聊聊'),null);
});
test('competitor pages: by brand alias or by category/market, only official https sources',()=>{
 const l=competitorLinks('打开霍曼的竞品资料');assert.ok(l.length>0&&l.every(a=>a.url.startsWith('https://')&&/rmann/i.test(a.label)));
 assert.ok(competitorLinks('打开 ASSA ABLOY 页面').every(a=>/ASSA/.test(a.label)));
 const byMarket=competitorLinksFromIntent(competitorIntent('打开沙特防火门竞品'));assert.ok(byMarket.length>0&&byMarket.length<=5);
 for(const a of [...l,...byMarket])assert.ok(ALLOWED_HOSTS.includes(new URL(a.url).hostname));
});
test('searches carry only the keywords and never contact details',()=>{
 const s=actionIntent('打开浏览器谷歌搜索 fire rated door Saudi distributor');assert.match(s.search.url,/^https:\/\/www\.google\.com\/search\?q=fire%20rated%20door%20Saudi%20distributor$/);
 assert.match(actionIntent('帮我打开百度搜一下王力防盗门').search.url,/^https:\/\/www\.baidu\.com\/s\?wd=/);
 const b=actionIntent('打开浏览器搜索 buyer@example.com');assert.equal(b.search,null);assert.match(actionAnswer(b).answer,/不会把它放进搜索网址/);
});
test('answer lists what opens and explains the popup fallback; URLs re-checked in the browser',()=>{
 const r=actionAnswer(actionIntent('打开报价管理和客户公海'));assert.equal(r.actions.length,2);assert.match(r.answer,/报价管理/);assert.match(r.answer,/允许 crm.foreverdoodle.com 弹出窗口/);
 assert.equal(safeUrl('http://x.com'),null);assert.equal(safeActionUrl('javascript:alert(1)'),null);assert.equal(safeActionUrl('https://u:p@x.com'),null);assert.equal(safeActionUrl('https://www.google.com/search?q=a'),'https://www.google.com/search?q=a');
 assert.ok(OPEN_WORDS.test('帮我打开'));
});
test('the CRM page handles #view= links with role checks',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/#view=\(\[a-z0-9-\]\{2,40\}\)/);assert.match(html,/canAccessView\(initialView\[1\]\)/);
});
import {recordIntent,resolveRecords,recordAnswer,catalogPageIntent,catalogPagePath,catalogPageActions} from '../supabase/functions/agent-conversation/agent-actions.mjs';
test('open a specific inquiry by number or customer name, through the caller RLS client',async()=>{
 assert.deepEqual(recordIntent('打开询盘51'),{kind:'inquiry_no',no:51});assert.deepEqual(recordIntent('打开 #51 询盘'),{kind:'inquiry_no',no:51});
 assert.deepEqual(recordIntent('帮我打开 Example Door Trading 的询盘'),{kind:'company',name:'Example Door Trading'});
 for(const q of ['打开询盘列表','询盘51怎么样','打开我的客户','打开 100%_x 的询盘'])assert.equal(recordIntent(q),null,q);
 const id='0b0f3c1e-1111-4222-8333-444455556666';const calls=[];
 const q=()=>{const o={select:()=>o,ilike:(c,v)=>{calls.push(['ilike',v]);return o},in:()=>o,order:()=>o,eq:()=>o,limit:async()=>({data:calls.length?[{id:'c1',name:'Example Door Trading LLC'}]:[]})};return o};
 const client={from:t=>{if(t==='companies')return q();const o={select:()=>o,in:()=>o,order:()=>o,eq:()=>o,limit:async()=>({data:[{id,inquiry_no:51,title:'Fire doors RFQ',company_id:'c1',companies:{name:'Example Door Trading LLC'}}]})};return o}};
 const recs=await resolveRecords({kind:'company',name:'Example Door'},client);assert.equal(recs[0].company,'Example Door Trading LLC');assert.deepEqual(calls[0],['ilike','%Example Door%']);
 const r=recordAnswer({kind:'company',name:'Example Door'},recs);assert.equal(r.actions[0].url,CRM_ORIGIN+'#inquiry/'+id);assert.match(r.answer,/#51｜Example Door Trading LLC/);assert.match(r.answer,/没有发送给外部模型/);
 assert.match(recordAnswer({kind:'inquiry_no',no:9},[]).answer,/没有找到 #9/);assert.equal(recordAnswer({kind:'inquiry_no',no:9},[{id:'x',no:9}]).actions.length,0);
});
test('catalogue pages open via short-lived signed links from the private bucket only',async()=>{
 assert.equal(catalogPageIntent('打开 X60 Pro 的画册页'),true);assert.equal(catalogPageIntent('X60 Pro 的参数'),false);
 assert.equal(catalogPagePath('c2',16),'catalog-pages/c2_p016.jpg');assert.equal(catalogPagePath('c9',1),null);assert.equal(catalogPagePath('c2',0),null);
 const signed=[];const admin={storage:{from:b=>{assert.equal(b,'agent-private-knowledge');return {createSignedUrl:async(p,ttl)=>{signed.push([p,ttl]);return {data:{signedUrl:'https://plhverjihjilnuhlhlxi.supabase.co/storage/v1/object/sign/'+p+'?token=t'},error:null}}}}}};
 const catalog={products:[{model:'X60 Pro',catalog:'c2',page:16},{model:'X60 Pro',catalog:'c1',page:18},{model:'X60 Pro',catalog:'c2',page:16}]};
 const a=await catalogPageActions(['X60 Pro'],catalog,admin);assert.equal(a.length,2);assert.deepEqual(signed[0],['catalog-pages/c2_p016.jpg',600]);assert.match(a[0].label,/零售画册 PDF第16页/);
});
