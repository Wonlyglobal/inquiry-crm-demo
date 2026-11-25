import test from 'node:test';import assert from 'node:assert/strict';
import {countryView,countryChoices,compareCountries} from '../assets/country-view.mjs';
import {filterCustomerDirectory} from '../assets/customer-directory.mjs';
test('country grouping collapses aliases and keeps original city / ambiguous entries',()=>{
 for(const raw of ['kenya','Kenya','肯尼亚'])assert.equal(countryView(raw).key,'肯尼亚');
 for(const raw of ['尼日利亚 拉各斯','尼日利亚拉各斯','Nigeria Enugu'])assert.equal(countryView(raw).key,'尼日利亚');
 assert.equal(countryView('阿联酋 / United Arab Emirates').key,'阿联酋');
 assert.equal(countryView('México').label,'墨西哥');assert.equal(countryView('未知').key,'__missing');
 assert.match(countryView('中国（新加坡，澳大利亚）').key,/^__review:/);
 assert.equal(countryView('尼日利亚 拉各斯').raw,'尼日利亚 拉各斯');
 assert.deepEqual(countryChoices(['Kenya','肯尼亚','kenya']).map(x=>[x.key,x.count]),[['肯尼亚',3]]);
 assert.ok(compareCountries('Kenya','')<0);
});
test('country customer sort/filter preserve provenance and do not mutate the supplied directory',()=>{
 const rows=['Kenya','肯尼亚','Ghana'].map((country,i)=>({key:String(i),company:{name:String(i),country},ownerName:'业务员',sourceKeys:[i===1?'personal':'official'],stages:[],search:'',lastAt:'2026-11-25'}));const before=JSON.stringify(rows);
 assert.equal(filterCustomerDirectory(rows,{country:'肯尼亚',origin:'official',sort:'country'}).length,1);
 assert.deepEqual(filterCustomerDirectory(rows,{sort:'country'}).map(x=>countryView(x.company.country).key),['加纳','肯尼亚','肯尼亚']);assert.equal(JSON.stringify(rows),before);
});
