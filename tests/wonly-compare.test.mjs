import test from 'node:test';import assert from 'node:assert/strict';
import {compareIntent,compareAnswer,wonlyFacts} from '../supabase/functions/agent-conversation/wonly-compare.mjs';
import {competitorIntent,competitorAnswer,mentionedCompanies,PUBLIC_EVIDENCE,CATEGORIES} from '../supabase/functions/agent-conversation/public-research.mjs';
const catalog={products:[{model:'S80 Max',category:'smart_lock',catalog:'c4',page:15,specs:{'Standard features':'Fingerprint + Passcode + App'}},{model:'K300',category:'security_door',catalog:'c2',page:21,specs:{Grade:'Grade 4 burglary resistance',Standard:'GB 17565-2022',Thickness:'90 mm'}}]};
test('evidence covers the new markets and categories, all valid',()=>{
 assert.ok(PUBLIC_EVIDENCE.length>=140);assert.equal(CATEGORIES.wooden_door,'木门');
 for(const m of ['SA','AE','MX'])assert.ok(PUBLIC_EVIDENCE.filter(e=>e.market===m).length>=20,m);
 assert.ok(PUBLIC_EVIDENCE.filter(e=>e.category==='wooden_door').length>=20);
 assert.ok(PUBLIC_EVIDENCE.every(e=>e.source_url.startsWith('https://')&&e.quote));
});
test('brand names find that company; generic words do not',()=>{
 assert.deepEqual(mentionedCompanies('NAFFCO 的防火门怎么样'),['NAFFCO（阿联酋）']);
 assert.ok(mentionedCompanies('霍曼').some(c=>/Hörmann/.test(c)));assert.deepEqual(mentionedCompanies('Riyadh fire door tender'),[]);
 assert.deepEqual(mentionedCompanies('王力防盗门'),[]);
 const i=competitorIntent('凯迪仕有哪些开锁方式');assert.equal(i.dimension,'unlock_methods');assert.match(competitorAnswer(i),/七种开锁方式/);
 assert.match(competitorAnswer(competitorIntent('墨西哥木门竞品')),/BERING|Occidente/);
});
test('WONLY vs competitor table: catalogue facts with page, competitor facts with link, gaps named, no ranking',()=>{
 const f=wonlyFacts(catalog);assert.equal(f.security_door.security_class[0].value,'Grade 4 burglary resistance');assert.match(f.smart_lock.unlock_methods[0].ref,/真智能锁画册 PDF第15页/);
 assert.equal(compareIntent('王力防盗门怎么样'),null);assert.equal(compareIntent('X60 Pro 的参数'),null);
 const i=compareIntent('王力防盗门和墨西哥竞品对比');assert.deepEqual(i.categories,['security_door']);assert.deepEqual(i.markets,['MX']);
 const a=compareAnswer(i,catalog);assert.match(a,/Grade 4 burglary resistance（K300；零售画册 PDF第21页）/);assert.match(a,/https:\/\/www\.sivicon\.mx/);
 assert.match(a,/王力画册没有写明：.*钢板厚度/);assert.match(a,/不能直接换算/);assert.match(a,/没有发送给外部模型/);
 assert.match(compareAnswer(compareIntent('王力智能锁和凯迪仕对比'),catalog),/凯迪仕.*七种开锁方式/s);
});
