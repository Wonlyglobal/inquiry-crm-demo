import test from 'node:test';
import assert from 'node:assert/strict';
import {matchTerritory,resolveInquiryRegion,rankTerritoryCandidates} from '../supabase/functions/_shared/sales-territory.mjs';
test('country codes and Chinese/English names resolve consistently',()=>{
 for(const country of ['AE','阿联酋','United Arab Emirates','UAE'])assert.equal(resolveInquiryRegion(country),'中东');
 for(const [country,region] of [['Nigeria','非洲'],['美国','美洲'],['Germany','欧洲'],['India','南亚'],['Vietnam','东南亚'],['Kazakhstan','中亚']])assert.equal(resolveInquiryRegion(country),region);
});
test('unknown and ambiguous countries do not produce a guessed territory',()=>{
 for(const country of ['', 'Russia', 'Turkey', 'not a country'])assert.equal(resolveInquiryRegion(country),null);
 assert.equal(matchTerritory('India','').status,'unconfigured');
});
test('subregion owner ranks before regional coverage and historical experience cannot override territory',()=>{
 const a={name:'中东负责人',score:0,territory:matchTerritory('AE','中东非大区-中东')};
 const b={name:'大区总监',score:100,territory:matchTerritory('AE','中东非大区')};
 const c={name:'非洲负责人',score:100,territory:matchTerritory('AE','中东非大区-非洲')};
 assert.deepEqual(rankTerritoryCandidates([c,b,a]).map(x=>x.name),[a.name,b.name,c.name]);
});
test('South Asia is distinct from Southeast Asia despite parent business label',()=>{
 assert.equal(matchTerritory('India','东南亚大区-南亚').rank,2);
 assert.equal(matchTerritory('India','东南亚大区-东南亚').rank,0);
 assert.equal(matchTerritory('VN','东南亚大区-东南亚').rank,2);
});
test('regional peers are sorted by operational score',()=>{
 const territory=matchTerritory('US','美洲大区');
 assert.deepEqual(rankTerritoryCandidates([{name:'甲',score:3,territory},{name:'乙',score:8,territory}]).map(x=>x.score),[8,3]);
});

test('CRM bilingual country labels resolve and conflicting regions stay unknown',()=>{
 assert.equal(resolveInquiryRegion('India / 印度'),'南亚');
 assert.equal(resolveInquiryRegion('United Arab Emirates / 阿联酋'),'中东');
 assert.equal(resolveInquiryRegion('China / 中国'),null);
 assert.equal(resolveInquiryRegion('India / 美国'),null);
});
