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
