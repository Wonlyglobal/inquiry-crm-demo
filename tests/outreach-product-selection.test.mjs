import test from 'node:test';import assert from 'node:assert/strict';
import {OUTREACH_CATEGORIES,suggestedOutreachCategory,METAL_DOOR_1_PROFILE} from '../assets/outreach-product-selection.mjs';
import {PRODUCT_CATEGORIES,outreachProductRequest,outreachProductEvidence,buildProductReviewDraft} from '../supabase/functions/agent-conversation/outreach-product-draft.mjs';
const input={inquiry_id:'00000000-0000-4000-8000-000000000001',recipient:'fixture@example.com',angle:'a synthetic application requirements discussion'};
test('UI and backend categories match, all is explicitly bounded',()=>{
 assert.deepEqual(OUTREACH_CATEGORIES.map(x=>x[0]).sort(),Object.keys(PRODUCT_CATEGORIES).sort());
 const all=Object.keys(PRODUCT_CATEGORIES);assert.equal(outreachProductRequest({...input,categories:all}).categories.length,12);
 for(const categories of [[],['other'],['all'],['steel_door','steel_door'],['__proto__']])assert.throws(()=>outreachProductRequest({...input,categories}));
});
test('best inquiry category defaults without default wooden doors or automatic all',()=>{
 assert.equal(suggestedOutreachCategory('Metal Door 1.0 model recommendation'),'security_door');
 assert.equal(suggestedOutreachCategory('Metal Door 1.0 model recommendation; wooden doors mentioned as background'),'security_door');
 assert.equal(suggestedOutreachCategory('铝木门窗选型'),'aluminum_wood_windows');
 assert.equal(suggestedOutreachCategory('smart lock'),'smart_lock');
 assert.equal(suggestedOutreachCategory('Hello cooperation'),'');
});
test('context is bounded and model evidence missing fails closed for every selection',()=>{
 const req=outreachProductRequest({...input,categories:['steel_door','smart_lock'],model:'S922',application:'indoor',requirements:'confirm configuration'});
 assert.equal(req.model,'S922');assert.throws(()=>outreachProductRequest({...input,category:'steel_door',model:'x'.repeat(81)}));
 const asset={id:'f',name:'钢质门.pdf',isCurrentVersion:true,versionLabel:'V1',document:{status:'ready',sha256:'a'.repeat(64),pages:[{page:1,chunks:['Synthetic model X100']} ]}};
 assert.equal(outreachProductEvidence({status:'available',assets:[asset]},'steel_door','S922').length,0);
 assert.throws(()=>buildProductReviewDraft(req,[{category:'steel_door'}]));
});
test('1.0 has a sourced introduction distinguishing baseline from a named model',()=>{
 assert.match(METAL_DOOR_1_PROFILE.title,/机械.*基线/);
 assert.match(METAL_DOOR_1_PROFILE.limits,/不是已确认的具体型号/);
 assert.match(METAL_DOOR_1_PROFILE.limits,/另行核实/);
 assert.equal(METAL_DOOR_1_PROFILE.source,'https://www.wonlyglobal.com/ru/products/metal-doors/1-0');
});
