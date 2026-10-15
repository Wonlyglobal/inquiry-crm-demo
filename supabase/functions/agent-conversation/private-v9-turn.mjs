import {resolveMaterialTurn} from './material-dialogue.mjs';
import {normalizeModelQuestion} from './catalog-knowledge.mjs';
const version=/v\s*9|第九版|跨页画册/i;
const scoped=q=>/智能锁|smart.?lock/i.test(q)&&version.test(q);
const follow=q=>/^(那|它|这个|该型号|还有|继续|展开|详细一点|下一页)/.test(q.trim());
const strip=q=>normalizeModelQuestion(q).replace(/v\s*9|第九版|跨页画册/ig,'');
export function privateV9Turn(q,history=[]){
 const previous=history.at(-1)||'';
 if(!scoped(q)&&!(scoped(previous)&&follow(q)))return null;
 const resolved=resolveMaterialTurn(strip(q),scoped(previous)?[strip(previous)]:[]);
 if(follow(q)&&!history.length)return {question:'',clarification:'请先选择完整型号，再查询智能锁画册v9；当前无法确定“它”指哪款产品。'};
 return {...resolved,question:resolved.question+' 智能锁画册v9'};
}
