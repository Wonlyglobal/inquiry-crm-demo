import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {appendQuestionMessage,currentQuestionWindow,openQuestionWindow,restoreHistoryQuestion}=await import(process.env.QUESTION_WINDOWS_BASELINE?pathToFileURL(process.env.QUESTION_WINDOWS_BASELINE):new URL('../assets/agent-question-windows.mjs',import.meta.url));

// Only the DOM operations used by the real question-window module; no network/storage.
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.className='';this.textContent='';this.open=false;this.hidden=false;this.scrollTop=0;this.events={};}
 get classList(){return {contains:c=>this.className.split(/\s+/).includes(c),add:c=>{if(!this.classList.contains(c))this.className+=' '+c}}}
 get lastElementChild(){return this.children.at(-1)||null}
 append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n)}}
 remove(){if(this.parentElement){const list=this.parentElement.children;list.splice(list.indexOf(this),1);this.parentElement=null}}
 before(n){n.remove();const p=this.parentElement;n.parentElement=p;p.children.splice(p.children.indexOf(this),0,n)}
 replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes)}
 contains(n){return this===n||this.children.some(c=>c.contains(n))}
 matches(selector){const open=selector.endsWith('[open]');if(open&&!this.open)return false;selector=selector.replace('[open]','');const [tag,...classes]=selector.split('.');return (!tag||tag===this.tagName)&&classes.every(c=>this.classList.contains(c))}
 querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)])}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null}
 addEventListener(type,fn){this.events[type]=fn}
 setAttribute(k,v){this[k]=v}
 getBoundingClientRect(){return {top:0}}
}
function fixture(t){const prior=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};t.after(()=>{globalThis.document=prior});const parent=new Element('section'),host=new Element('div');host.dataset={};parent.append(host);return host}
const cards=host=>host.querySelectorAll('.question-window');
const user=(host,q,options)=>appendQuestionMessage(host,'user',q,options).closest('.question-window');
const assistant=(host,q,options)=>appendQuestionMessage(host,'assistant',q,options);

test('second ordinary question immediately has its own title and answer destination',t=>{
 const host=fixture(t);const first=user(host,'合成问题一');assistant(host,'合成回答一');
 const second=user(host,'合成问题二');assert.notEqual(first,second);assert.equal(cards(host).length,2);
 assert.equal(second.querySelector('summary').textContent,'合成问题二');assert.equal(first.open,false);assert.equal(second.open,true);
 assert.equal(second.querySelector('.ai-message.assistant'),null,'never display the previous answer while waiting');
 assistant(host,'合成回答二');assert.equal(first.querySelector('.ai-message.assistant').textContent,'合成回答一');assert.equal(second.querySelector('.ai-message.assistant').textContent,'合成回答二');
 assert.equal(host.dataset.newQuestion,undefined,'new display card is not a model-context reset');
});
test('follow-up is separately titled without pretending it is a new semantic demand',t=>{
 const host=fixture(t);user(host,'合成产品参数');assistant(host,'合成参数回答');const next=user(host,'那来源是哪一页？');
 assert.equal(cards(host).length,2);assert.equal(next.querySelector('summary').textContent,'那来源是哪一页？');assert.equal(host.dataset.newQuestion,undefined);
});
test('viewing history during the second request cannot redirect its reply',t=>{
 const host=fixture(t),first=user(host,'合成旧问题');assistant(host,'合成旧回答');const second=user(host,'合成新问题');
 openQuestionWindow(host,first,{viewOnly:true});assert.equal(currentQuestionWindow(host),second);assistant(host,'合成新回答');
 assert.equal(first.querySelectorAll('.ai-message.assistant').length,1);assert.equal(second.querySelector('.ai-message.assistant').textContent,'合成新回答');assert.equal(second.open,true);
});
test('an explicit reveal target reuses the pending-answer card only',t=>{
 const host=fixture(t),first=user(host,'合成待展开问题');user(host,'打开',{card:first});assistant(host,'合成详细回答',{card:first});
 assert.equal(cards(host).length,1);assert.equal(first.querySelector('summary').textContent,'合成待展开问题');assert.equal(first.querySelectorAll('.ai-message.user').length,2);
});
test('history restoration and fresh retry remain distinct from the current writer',t=>{
 const host=fixture(t),writer=user(host,'合成当前问题');const history=restoreHistoryQuestion(host,'合成历史问题',new Element('div'),()=>{});
 assert.equal(currentQuestionWindow(host),writer);assert.equal(history.dataset.historyOnly,'true');
 host.dataset.newQuestion='true';const retry=user(host,'合成历史问题');assert.notEqual(retry,history);assert.equal(currentQuestionWindow(host),retry);assert.equal(history.querySelectorAll('.ai-message.assistant').length,1);
});
for(const file of ['index.html','grace.html'])test(`${file}: local analysis timeline captures the newly created question card`,async t=>{
 const host=fixture(t);const source=readFileSync(process.env.QUESTION_PAGE_BASELINE||new URL('../'+file,import.meta.url),'utf8');
 const begin=source.indexOf('$("#ai-assistant-form").addEventListener("submit",async event=>{');assert.ok(begin>=0);
 const snippet=source.slice(begin,source.indexOf('      bindMetricHelp();',begin));let submit;const input={value:''},entries=[];
 const form={addEventListener(type,fn){submit=fn}};const worldModel={isModel:()=>false,beginTimeline:q=>{const card=currentQuestionWindow(host);entries.push({q,card});return {done(){}}}};
 const worldIntelligence={answer:q=>'合成内部汇总：'+q},addAiMessage=(role,text)=>appendQuestionMessage(host,role,text);
 const setup=new Function('$','worldModel','worldIntelligence','addAiMessage','canUseAgentWorld',`let worldPersona='Grace',profile={},currentAuthUser={},aiLastQuestion='',aiLastContext=null,aiConversation=[];const aiDataContext=()=>({});${snippet}`);
 setup(id=>id==='#ai-assistant-form'?form:input,worldModel,worldIntelligence,addAiMessage,()=>true);
 for(const q of ['合成本地首问','合成本地第二问']){input.value=q;await submit({preventDefault(){}})}
 assert.equal(entries.length,2);assert.notEqual(entries[0].card,entries[1].card);
 for(const {q,card} of entries)assert.equal(card.querySelector('summary').textContent,q);
});
test('both entry pages and model controller import one shared version of question state',()=>{
 const sources=['index.html','grace.html','assets/agent-conversation.mjs'].map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 const versions=sources.map(s=>s.match(/agent-question-windows\.mjs\?v=([^'"]+)/)?.[1]);assert.equal(new Set(versions).size,1);assert.ok(versions[0]);
 for(const source of sources.slice(0,2))assert.match(source,/onMessage:\(role,text,options\)=>\{addAiMessage\(role,text,options\)/);
 assert.match(sources[2],/onMessage\('user',question,\{card:currentQuestionWindow/);
});
