import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {selectedTranslationLanguages,OUTREACH_TRANSLATION_LANGUAGES} from '../assets/outreach-languages.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('only selected supported languages are generated, deduplicated, source omitted',()=>{
 assert.deepEqual(selectedTranslationLanguages(['ru','es','ru'],'en'),['ru','es']);
 assert.deepEqual(selectedTranslationLanguages(['en'],'en'),[]);
 assert.deepEqual(selectedTranslationLanguages([]),[]);
 assert.throws(()=>selectedTranslationLanguages(['xx']));
 assert.equal(selectedTranslationLanguages(OUTREACH_TRANSLATION_LANGUAGES.map(([k])=>k),'en').length,5);
});
test('language checkboxes do not generate until explicit button click',()=>{
 const block=html.slice(html.indexOf("document.querySelectorAll('[data-outreach-language-code]').forEach(box=>box.addEventListener"),html.indexOf('      $("#copy-outreach")'));
 assert.ok(block.includes("addEventListener('change',updateOutreachLanguageSelection)"));
 assert.ok(block.includes('await translateFinalOutreach(selected)'));
 assert.equal(block.includes('Object.values(outreachLanguageCodes)'),false);
 assert.ok(html.includes('请选择至少一种不同于原文的目标语言'));
 assert.ok(block.includes('!await finalizeCurrentOutreach()'),'translation explicitly offers finalization instead of a dead-end toast');
});
test('finalization returns verified snapshot, refreshes language UI, and cancellation writes nothing',async()=>{
 const source=html.slice(html.indexOf('      async function finalizeCurrentOutreach('),html.indexOf('      $("#finalize-outreach").addEventListener'));
 const nodes=new Map(),$=key=>{if(!nodes.has(key))nodes.set(key,{value:'Reviewed customer body',disabled:false,textContent:''});return nodes.get(key)};
 let confirmed=false,writes=0,updates=0;
 const snapshot={id:'snapshot'},query={insert(){writes++;return this},select(){return this},eq(){return this},async single(){return {data:snapshot}}};
 const ctx={$,translatingOutreach:false,currentInquiry:{latestOutreachDraft:{}},isInternalProductReviewDraft:()=>false,appConfirm:async()=>confirmed,saveOutreachDraft:async()=>({id:'draft'}),supabase:{from:()=>query},finalCopyMatches:()=>true,toast:()=>{},updateOutreachLanguageSelection:()=>updates++,finalizedOutreachCopy:null};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 assert.equal(await ctx.finalizeCurrentOutreach(),undefined);assert.equal(writes,0);assert.equal($('#finalize-outreach').disabled,false);
 confirmed=true;assert.equal(await ctx.finalizeCurrentOutreach(),snapshot);assert.equal(ctx.finalizedOutreachCopy,snapshot);assert.equal(writes,1);assert.equal(updates,2);
 ctx.isInternalProductReviewDraft=()=>true;assert.equal(await ctx.finalizeCurrentOutreach(),null);assert.equal(writes,1,'internal worksheets cannot be finalized or translated');
});
test('original and structured message tab stays first even for old customized orders',()=>{
 const keys=['research','outreach','followup','summary','validity','attribution','journey','events','audit'];
 const tabs=new Map(keys.map(key=>[key,{key}]));let order=[...keys];
 const container={querySelector:s=>tabs.get(s.match(/="([^"]+)"/)[1]),append:tab=>{order=order.filter(key=>key!==tab.key);order.push(tab.key)}};
 const ctx={$:()=>container,detailTabsInitialOrder:keys};vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('      function applyDetailTabsOrder('),html.indexOf('      function storedDetailTabsOrder(')),ctx);
 ctx.applyDetailTabsOrder(['audit','events','summary','research','unknown','audit']);
 assert.deepEqual(order.slice(0,3),['summary','research','outreach']);
 assert.equal(order.length,keys.length);assert.equal(new Set(order).size,keys.length);
 assert.deepEqual(order.slice(3,5),['audit','events']);
});
