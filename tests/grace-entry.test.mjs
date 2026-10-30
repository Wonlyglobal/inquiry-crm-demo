import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graceDocument} from '../scripts/build-grace-entry.mjs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const entry=readFileSync(new URL('../grace.html',import.meta.url),'utf8');
test('dedicated Grace document stays byte-for-byte derived from current shared runtime',()=>{
 assert.equal(entry,graceDocument(source),'Run node scripts/build-grace-entry.mjs after changing index.html');
 assert.match(entry,/<html[^>]*data-grace-entry="true"/);
 assert.match(entry,/<title>Grace · 王力随身 AI<\/title>/);
 assert.doesNotMatch(entry,/<h1>全球询盘 CRM<\/h1>|<aside class="login-showcase"/);
});
const start=source.indexOf('      async function showApp() {');
const branch=source.slice(start+'      async function showApp() {'.length,source.indexOf('        $("#login").classList.add("hidden");',start));
async function boot(allowed){
 const events=[],nodes=new Map();const $=key=>{if(!nodes.has(key))nodes.set(key,{classList:{add:x=>events.push(key+':hide'),remove:x=>events.push(key+':show')},textContent:''});return nodes.get(key)};
 const never=()=>new Promise(()=>{});
 const run=new Function('$','isGraceApp','canUseAgentWorld','profile','currentAuthUser','restoreAgentLocation','loadInquiries','loadDashboardPreferences','loadMyRiskControls',`return (async()=>{${branch}})()`);
 await run($,()=>true,()=>allowed,{}, {},()=>events.push('Grace mounted'),never,never,never);
 return {events,nodes};
}
test('authorized Grace mounts before pending business data and never enters CRM startup',async()=>{
 const {events}=await boot(true);assert.ok(events.includes('Grace mounted'));assert.ok(events.includes('#app:show'));
});
test('unauthorized account stays on Grace login and does not mount the application',async()=>{
 const {events,nodes}=await boot(false);assert.ok(events.includes('#app:hide'));assert.ok(!events.includes('Grace mounted'));assert.match(nodes.get('#login-error').textContent,/尚未开通 Grace/);
});
test('native platforms use dedicated Grace entry',()=>{
 for(const name of ['ios/Grace/AppDelegate.swift','android/app/src/main/java/com/wonly/grace/MainActivity.java']){
 const native=readFileSync(new URL('../apps/grace/'+name,import.meta.url),'utf8');
 const expected=name.startsWith('ios/')?/https:\/\/crm\.foreverdoodle\.com\/grace-app\.html/:/https:\/\/crm\.foreverdoodle\.com\/grace\.html/;
 assert.match(native,expected);assert.doesNotMatch(native,/https:\/\/crm.foreverdoodle.com\/\?app=grace/);
 if(name.startsWith('ios/')){assert.match(native,/allowedPages.contains\(url.path\)/);assert.match(native,/websiteDataStore = \.default\(\)/)}
 }
});
