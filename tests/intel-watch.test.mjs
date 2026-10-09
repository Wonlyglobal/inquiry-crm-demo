import test from 'node:test';import assert from 'node:assert/strict';
import {findDate,extractCandidates,selectNew,report} from '../scripts/intel-watch.mjs';
const html=`<ul><li><time>16 Sep 2026</time><a href="/group/en/news-media/press-releases/id.abc">ASSA ABLOY acquires a door company in Mexico to expand</a></li>
<li><a href="https://www.assaabloy.com/group/en/news-media/press-releases/id.old?utm=x#top">An older headline that is already in the public feed</a> 2026-08-01</li>
<li><a href="https://evil.example/news/x">Off-site link with a long enough title to pass</a></li>
<li><a href="/group/en/careers/jobs">A careers page link that is not news related at all</a></li>
<li><a href="/group/en/news-media/press-releases/id.more">Read more</a></li></ul>`;
test('dates are found in common formats',()=>{
 assert.equal(findDate('Published 16 Sep 2026'),'2026-09-16');assert.equal(findDate('September 3, 2026'),'2026-09-03');assert.equal(findDate('2026-08-01'),'2026-08-01');assert.equal(findDate('no date'),null);
});
test('only same-site news links with real titles become candidates',()=>{
 const c=extractCandidates(html,'https://www.assaabloy.com/group/en/news-media/press-releases');
 assert.deepEqual(c.map(x=>x.url),['https://www.assaabloy.com/group/en/news-media/press-releases/id.abc','https://www.assaabloy.com/group/en/news-media/press-releases/id.old']);
 assert.equal(c[0].date,'2026-09-16');
});
test('known and stale items are dropped; the report says candidates are unverified and shows failures',()=>{
 const c=extractCandidates(html,'https://www.assaabloy.com/group/en/news-media/press-releases');
 const fresh=selectNew(c,new Set(['https://www.assaabloy.com/group/en/news-media/press-releases/id.old']),Date.parse('2026-09-28'));
 assert.deepEqual(fresh.map(x=>x.url),['https://www.assaabloy.com/group/en/news-media/press-releases/id.abc']);
 const r=report([{name:'ASSA ABLOY',url:'https://x',status:'ok',found:2,fresh},{name:'Asturmex',url:'https://y',status:'failed',error:'HTTP 500',found:0,fresh:[]},{name:'WONLY',url:'https://z',status:'empty',found:0,fresh:[]}],new Date('2026-09-28T01:00:00Z'));
 assert.match(r.markdown,/候选不是已核验事实/);assert.match(r.markdown,/读取失败（HTTP 500）/);assert.match(r.markdown,/动态加载/);assert.equal(r.fresh,1);assert.equal(r.failed,1);
});
test('nearest date wins when dates appear on both sides',async()=>{
 const {nearestDate}=await import('../scripts/intel-watch.mjs');
 assert.equal(nearestDate('Older 2026-08-01 text 16 Sep 2026 ',' more 2026-07-01'),'2026-09-16');
 assert.equal(nearestDate('long text without any date at all',' 2026-09-20 x'),'2026-09-20');
});
