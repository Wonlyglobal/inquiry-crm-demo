import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productDocument,productKey,canonicalModel,span} from './private-product-evidence-fixture.mjs';
const migration=readFileSync(new URL('../supabase/migrations/20261026150000_private_product_page_evidence.sql',import.meta.url),'utf8');
const previous=readFileSync(new URL('../supabase/migrations/20261023110000_private_facebook_youtube_daily.sql',import.meta.url),'utf8');
const body=(text,name)=>text.match(new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?end; \\$\\$;'))?.[0];
test('product scope uses a full source-and-complete-model digest within the unchanged 100-character selector',()=>{
 const d=productDocument();assert.equal(d.key.length,72);assert.match(d.key,/^product-[a-f0-9]{64}$/);
 for(const m of ['TEST80 PRO','TEST80/PRO','ＴＥＳＴ８０ . ＰＲＯ','TEST80\nPRO'])assert.equal(productKey(d.source_sha256,m),d.key);
 assert.notEqual(productKey(d.source_sha256,'TEST80'),d.key);assert.notEqual(productKey('b'.repeat(64),'TEST80 PRO'),d.key);
 assert.equal(canonicalModel('TEST80 Basic'),'TEST80BASIC');assert.equal(d.product_evidence.source_published_at,null);
});
test('migration preserves the previous seven-kind validator byte-for-byte outside the product branch',()=>{
 const added=" if d->>'kind'='product' then perform public.validate_private_product_page_evidence(d); return; end if;\n";
 assert.equal(body(migration,'validate_private_intelligence').replace(added,''),body(previous,'validate_private_intelligence'));
 assert.equal(body(migration,'read_agent_private_intelligence').replace("'facebook','youtube','product')","'facebook','youtube')"),body(previous,'read_agent_private_intelligence'));
});
test('migration adds no table, actor, persistence, receipt, execute grant or RLS authority',()=>{
 assert.doesNotMatch(migration,/\b(?:create table|alter table|grant execute|create(?: or replace)? function public\.(?:private_intelligence_actor|sync_agent_private_intelligence|receipt_agent_private_intelligence))\b/i);
 for(const name of ['private_intelligence_actor','validate_private_intelligence','sync_agent_private_intelligence','read_agent_private_intelligence','receipt_agent_private_intelligence'])assert.match(migration,new RegExp("'public\\."+name+'\\('));
 assert.match(migration,/revoke all on function public\.validate_private_product_page_evidence\(jsonb\) from public,anon,authenticated/);
 assert.match(migration,/char_length\(p_key\),0\)>100/);assert.match(migration,/owner_id=actor/);assert.match(migration,/agent_private_intelligence_read/);
});
test('source text offsets use Unicode code points and fixtures contain no human-verified or current-source assertion',()=>{
 const s=span('🧪 TEST80 PRO\nSynthetic supply 8V','TEST80 PRO',{model:'TEST80 PRO'});assert.equal(s.start,2);assert.equal(s.end,12);
 const d=productDocument();assert.equal(d.human_verified,false);assert.equal(d.product_evidence.regions[0].source_kind,'native_text');
 assert.equal('isCurrentVersion' in d.product_evidence,false);assert.equal('human_verified' in d.product_evidence,false);
});
