import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('restored language shortcuts require reviewed final text and translate only the clicked language',async()=>{
 const handlers=new Map(),calls=[],buttons=['英文','俄文'].map(language=>({dataset:{outreachLanguage:language},addEventListener:(_,handler)=>handlers.set(language,handler)}));
 let finalized=false,allow=false;
 const ctx={document:{querySelectorAll:()=>buttons},translatingOutreach:false,outreachLanguageCodes:{英文:'en',俄文:'ru'},$:()=>({value:'英文'}),finalizedOutreachCopy:null,finalCopyMatches:()=>finalized,finalizeCurrentOutreach:async()=>{calls.push('confirm');return allow},translateFinalOutreach:async languages=>calls.push([...languages]),toast:message=>calls.push(message)};
 vm.createContext(ctx);
 const start=html.indexOf("      document.querySelectorAll('[data-outreach-language]').forEach");
 vm.runInContext(html.slice(start,html.indexOf('      $("#copy-outreach")',start)),ctx);
 await handlers.get('俄文')();assert.deepEqual(calls,['confirm']);
 calls.length=0;allow=true;await handlers.get('俄文')();assert.deepEqual(calls,['confirm',['ru']]);
 calls.length=0;finalized=true;await handlers.get('俄文')();assert.deepEqual(calls,[['ru']]);
 calls.length=0;await handlers.get('英文')();assert.equal(calls.length,1);assert.equal(typeof calls[0],'string');
 calls.length=0;ctx.translatingOutreach=true;await handlers.get('俄文')();assert.deepEqual(calls,[]);
});
test('restored category selector updates the actual internal evidence selection and invalidates old evidence',()=>{
 const handlers=new Map(),boxes=[{value:'smart_lock',checked:false},{value:'wooden_door',checked:true}];
 const nodes={'#grace-outreach-category':{value:'smart_lock',addEventListener:(_,fn)=>handlers.set('select',fn)},'#grace-outreach-categories':{querySelectorAll:()=>boxes,addEventListener:(_,fn)=>handlers.set('multi',fn)},'#grace-outreach-confirm':{checked:true}};
 let invalidated=0;const ctx={$:key=>nodes[key],clearCataloguePreview:()=>invalidated++};vm.createContext(ctx);
 const start=html.indexOf('      $("#grace-outreach-category").addEventListener');
 vm.runInContext(html.slice(start,html.indexOf('      $("#grace-outreach-categories").addEventListener("change",clearCataloguePreview)',start)),ctx);
 handlers.get('select')();assert.deepEqual(boxes.map(x=>x.checked),[true,false]);assert.equal(invalidated,1);assert.equal(nodes['#grace-outreach-confirm'].checked,false);
 boxes.forEach(box=>box.checked=true);handlers.get('multi')();assert.equal(nodes['#grace-outreach-category'].value,'');
});
