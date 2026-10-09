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
test('answer points to the Grace timeline (no popups); competitors are evidence cards; search stays in-page',()=>{
 const r=actionAnswer(actionIntent('打开报价管理和客户公海'));assert.equal(r.actions.length,2);assert.match(r.answer,/报价管理/);assert.match(r.answer,/需求时间线/);assert.doesNotMatch(r.answer,/弹出窗口|新窗口/);
 const c=competitorLinks('打开霍曼的竞品资料');assert.ok(c.length>0&&c.every(a=>a.type==='evidence'&&a.id&&a.quote&&a.accessed));
 const s=actionIntent('帮我打开浏览器搜索 fire rated door Riyadh');assert.equal(s.search.type,'web_search');assert.equal(s.search.query,'fire rated door Riyadh');
 assert.equal(actionIntent('打开浏览器搜索 john@example.com').search,null);
 assert.equal(safeUrl('http://x.com'),null);assert.equal(safeActionUrl('javascript:alert(1)'),null);assert.equal(safeActionUrl('https://u:p@x.com'),null);assert.equal(safeActionUrl('https://www.google.com/search?q=a'),'https://www.google.com/search?q=a');
 assert.ok(OPEN_WORDS.test('帮我打开'));
});
test('the CRM page handles #view= links with role checks',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/#view=\(\[a-z0-9-\]\{2,40\}\)/);assert.match(html,/canAccessView\(initialView\[1\]\)/);
});
import {recordIntent,resolveRecords,recordAnswer,catalogPageIntent,catalogPagePath,catalogPageActions,catalogNameIntent,catalogPagesRequest} from '../supabase/functions/agent-conversation/agent-actions.mjs';
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
test('catalogue opens as a flip-through viewer action; page links are signed per catalogue',async()=>{
 assert.equal(catalogPageIntent('打开 X60 Pro 的画册页'),true);assert.equal(catalogPageIntent('X60 Pro 的参数'),false);
 assert.equal(catalogPagePath('c2',16),'catalog-pages/c2_p016.jpg');assert.equal(catalogPagePath('c9',1),null);assert.equal(catalogPagePath('c2',0),null);
 const catalog={sources:[{id:'c1',pages:61},{id:'c2',pages:70}],products:[{model:'X60 Pro',catalog:'c2',page:16},{model:'X60 Pro',catalog:'c1',page:18},{model:'X60 Pro',catalog:'c2',page:16}]};
 const a=await catalogPageActions(['x60-pro'],catalog);assert.equal(a.length,2);
 assert.deepEqual(a[0],{type:'catalog_view',catalog:'c2',page:16,pages:70,label:'X60 Pro · 零售画册 第16页'});assert.equal('url' in a[0],false);
 assert.equal(catalogNameIntent('打开零售画册'),'c2');assert.equal(catalogNameIntent('给我零售画册的PDF'),'c2');assert.equal(catalogNameIntent('下载木门画册'),'c3');assert.equal(catalogNameIntent('零售画册里有哪些防火门，给我列一下'),null);assert.equal(catalogNameIntent('打开工程画册'),'c1');assert.equal(catalogNameIntent('零售画册有几页'),null);
 const r=catalogPagesRequest({catalog:'c2'},catalog);assert.equal(r.title,'零售画册');assert.equal(r.paths.length,70);assert.equal(r.paths[69],'catalog-pages/c2_p070.jpg');assert.equal(r.pdfPath,'catalog-pdf/c2.pdf');assert.equal(r.pdfName,'WONLY-Retail-Catalogue-2026-08.pdf');
 assert.throws(()=>catalogPagesRequest({catalog:'c9'},catalog),/画册无效/);assert.throws(()=>catalogPagesRequest({catalog:'c3'},catalog),/页数未知/);
 assert.throws(()=>catalogPagesRequest({catalog:'../x'},catalog),/画册无效/);
});
import {pickCatalogAsset,CATALOG_QUERIES} from '../supabase/functions/agent-conversation/agent-actions.mjs';
test('catalogue PDF comes from the material library: best current matching PDF, nothing when unsure',()=>{
 const assets=[{id:'a1',name:'王力海外零售产品画册-2025.pdf',isCurrentVersion:false},{id:'a2',name:'WONLY Retail Product Catalogue 2026.pdf',isCurrentVersion:true},{id:'a3',name:'零售画册封面.jpg',isCurrentVersion:true},{id:'a4',name:'WONLY Project Solutions 2026.pdf',isCurrentVersion:true}];
 assert.deepEqual(pickCatalogAsset('c2',assets),{id:'a2',name:'WONLY Retail Product Catalogue 2026.pdf'});
 assert.equal(pickCatalogAsset('c1',assets).id,'a4');assert.equal(pickCatalogAsset('c3',assets),null);assert.equal(pickCatalogAsset('c9',assets),null);
 assert.equal(pickCatalogAsset('c2',[{id:'x',name:'零售价格表.pdf',isCurrentVersion:true}]),null);
 assert.equal(CATALOG_QUERIES.c4.length,2);
});
