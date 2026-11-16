import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPageIntent,catalogNameIntent,catalogRequestTurn} from '../supabase/functions/agent-conversation/agent-actions.mjs';
import {nextMaterialHistory} from '../assets/agent-question-plan.mjs';
import {productLedgerText} from '../supabase/functions/agent-conversation/product-coverage.mjs';
test('natural requests open the named catalogue, not a knowledge report',()=>{
 for(const q of ['我需要智能锁画册','给我智能锁画册','我想要一本智能锁画册','打开智能锁画册']){
  assert.equal(catalogPageIntent(q),true,q);assert.equal(catalogNameIntent(q),'c4',q);
 }
 for(const q of ['智能锁画册有哪些参数','我需要智能锁画册里的供电参数','画册里的尺寸是多少'])assert.equal(catalogPageIntent(q),false,q);
});
test('catalogue follow-up retains last topic and explicit changes win',()=>{
 const history=nextMaterialHistory({provider:'internal',context:{route:'actions',material_question:'我需要智能锁画册'}});
 assert.equal(catalogRequestTurn('画册',history),'打开真智能锁画册');
 assert.equal(catalogRequestTurn('画册呢',history),'打开真智能锁画册');
 assert.equal(catalogRequestTurn('画册',['智能锁画册V9']),'打开真智能锁画册 V9');
 assert.equal(catalogRequestTurn('我需要木门画册',history),'我需要木门画册');
 assert.equal(catalogRequestTurn('画册',[]),'打开画册');
 assert.equal(catalogRequestTurn('画册',['今天社媒数据']),'打开画册');
});
test('ordinary product ledger omits unrelated competitor report',()=>{
 const ledger={products:[{name:'SYNTHETIC',states:{coverage:'1页',extraction:'1条',model_check:'待核实',competitor:'UNRELATED',analysis:'UNRELATED',pending:'1条'},conflicts:[],expert:null,competitor_candidates:[],comparisons:[]}],similar:[],hidden_findings:0};
 assert.doesNotMatch(productLedgerText(ledger),/UNRELATED|竞品型号|竞品证据/);
});
