import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{outreachEvidenceRequest,outreachProductEvidence,productCatalogueQueries,PRODUCT_CATEGORIES}from'../supabase/functions/agent-conversation/outreach-product-draft.mjs';
const id='00000000-0000-4000-8000-000000000001';
const asset={id:'fixture',name:'海外零售画册.pdf',isCurrentVersion:true,versionLabel:'V2',document:{sha256:'a'.repeat(64),status:'ready',pages:[{page:5,chunks:['Synthetic: 金属门 1.0 mechanical baseline']},{page:6,chunks:['Synthetic: 智能锁 5.0']}]}};
test('read-only request does not require recipient or private angle and rejects extra data',()=>{
 assert.equal(outreachEvidenceRequest({inquiry_id:id,categories:['security_door'],model:'Metal Door 1.0'}).model,'Metal Door 1.0');
 for(const extra of [{url:'https://example.com'},{angle:'private'},{recipient:'a@example.com'}])assert.throws(()=>outreachEvidenceRequest({inquiry_id:id,categories:['security_door'],...extra}));
});
test('generic catalogue names can match relevant page content; different generations excluded',()=>{
 const e=outreachProductEvidence({status:'available',assets:[asset]},'security_door','Metal Door 1.0',true);assert.equal(e.length,1);assert.equal(e[0].page,5);assert.equal(e[0].human_verified,false);
 assert.equal(outreachProductEvidence({status:'available',assets:[asset]},'security_door','S922',true).length,0);
 assert.deepEqual(productCatalogueQueries('security_door'),['防盗门','security doors','海外零售画册']);
});
test('plans, historical files and unlocated pages are not catalogue evidence',()=>{
 for(const patch of [{name:'展会计划画册.pdf'},{name:'产品logo画册.pdf'},{isCurrentVersion:false},{document:{...asset.document,sha256:''}},{document:{...asset.document,pages:[{page:null,chunks:['金属门 1.0']}]}}])assert.equal(outreachProductEvidence({status:'available',assets:[{...asset,...patch}]},'security_door','Metal Door 1.0',true).length,0);
});
test('preview returns before any draft insert and uses original RLS and material scope',()=>{
 const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 const start=source.indexOf("if(input.action==='outreach-product-draft'");const block=source.slice(start,source.indexOf("if(input.action==='material-progress')",start));
 assert.ok(block.indexOf('if(preview)return json')<block.indexOf("client.from('outreach_drafts').insert"));
 assert.match(block,/client\.from\('inquiries'\)/);assert.match(block,/gateMaterialEvidence\(await loadFullMaterials/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.includes('按所选门类搜索画册（不生成开发信）'));assert.match(html,/selection!==JSON\.stringify/);assert.match(html,/clearCataloguePreview/);
});
test('all selected categories search product terms before catalogue filename fallback',()=>{
 for(const [key,category] of Object.entries(PRODUCT_CATEGORIES)){
  const queries=productCatalogueQueries(key);assert.equal(queries[0],category.query);assert.equal(queries[1],category.label);assert.equal(queries.length,3);assert.match(queries[2],/画册/);
 }
 assert.deepEqual(productCatalogueQueries('unknown'),[]);
});
test('both preview and drafting only use catalogues and report per-category bounded search results',()=>{
 const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
 assert.ok(source.includes('outreachProductEvidence(materials,category,request.model,true)'));
 assert.ok(source.includes('if(items.length)break;'));
 assert.ok(source.includes("scope:'bounded_authorized_search_not_full_catalogue'"));
 assert.ok(source.includes('不代表没有当前版画册'));
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes('await showCatalogueSearchDiagnostics(response,id);'));
 assert.ok(html.includes('response.error.context.clone().json()'));
 const preview=html.slice(html.indexOf('$("#grace-outreach-read-catalogue").addEventListener'),html.indexOf('$("#grace-outreach-categories").addEventListener("change",clearCataloguePreview)'));
 assert.equal(preview.includes("?'Metal Door 1.0'"),false,'category search must not silently apply inquiry model to all categories');
});
