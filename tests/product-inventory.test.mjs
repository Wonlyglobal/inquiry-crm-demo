import test from 'node:test';import assert from 'node:assert/strict';
import {productInventory,inventoryAnswer} from '../supabase/functions/agent-conversation/product-inventory.mjs';
import {catalogIntent,catalogPrecheck,catalogAnswer} from '../supabase/functions/agent-conversation/catalog-knowledge.mjs';
const c={products:[{model:'TEST-1',catalog:'c1',page:1,specs:{厚度:'50mm'}},{model:'TEST1',catalog:'c1',page:2,specs:{}},{model:'TEST-2',specs:{厚度:'40mm'}}]};
test('inventory includes unparsed models and does not merge lookalike names',()=>{const a=productInventory(c);assert.equal(a.length,3);assert.equal(a[1].profile.gaps.length,8);assert.equal(a[2].profile.gaps.length,8);assert.equal(a[0].profile.selection_ready,false)});
test('authorized catalogue route recognises inventory and preserves scope',()=>{const q='全型号资料覆盖清单';assert.ok(catalogPrecheck(q));const i=catalogIntent(q,c);assert.equal(i.kind,'inventory');assert.match(catalogAnswer(i,c,q),/不等于公司全部现售产品/);assert.match(inventoryAnswer(c,'产品档案第2页'),/本页没有条目/)});
