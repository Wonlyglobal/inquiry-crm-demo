const activeTurns=new WeakMap();
export function currentQuestionWindow(host){const active=activeTurns.get(host);if(active&&host.contains(active))return active;activeTurns.delete(host);return host.querySelector('.question-window[open]')||host.lastElementChild}
// Keep original message nodes and file buttons: no HTML interpretation or cloned handlers.
export function appendQuestionMessage(host,role,text){
 const node=document.createElement('div');node.className=`ai-message ${role}`;node.textContent=text;
 let card=role==='user'?(host.querySelector('.question-window[open]')||currentQuestionWindow(host)):currentQuestionWindow(host);
 const fresh=host.dataset.newQuestion==='true';
 if((role==='user'&&(fresh||!card?.querySelector('.ai-message.user')))||!card?.classList.contains('question-window')){
  delete host.dataset.newQuestion;
  for(const old of host.querySelectorAll('.question-window'))old.open=false;
  card=document.createElement('details');card.className='question-window';card.open=true;
  const title=document.createElement('summary');title.textContent=role==='user'?text:'智能体回复';card.append(title);
  const body=document.createElement('div');body.className='question-window-body';card.append(body);host.append(card);
  updateHistory(host);
  card.addEventListener('toggle',()=>{if(card.open)for(const other of host.querySelectorAll('.question-window'))if(other!==card)other.open=false});
 }
 if(role==='user'){activeTurns.set(host,card);if(card.querySelector('.ai-message.user'))node.classList.add('follow-up');card.open=true}
 card.hidden=false;card.querySelector('.question-window-body').append(node);
 if(role==='assistant')card.open=true;
 host.scrollTop=0;const body=card.querySelector('.question-window-body');body.scrollTop=Math.max(0,body.scrollTop+node.getBoundingClientRect().top-body.getBoundingClientRect().top);
 return node;
}
export function appendQuestionMaterials(host,list){(currentQuestionWindow(host)?.querySelector('.question-window-body')||host).append(list)}

function updateHistory(host){
 if(!host.parentElement.querySelector('.question-new')){const fresh=document.createElement('button');fresh.type='button';fresh.className='question-new';fresh.textContent='新需求';fresh.onclick=()=>{host.dataset.newQuestion='true';for(const c of host.querySelectorAll('.question-window'))c.open=false};host.before(fresh)}
 let nav=host.parentElement.querySelector('.question-history');
 if(!nav){nav=document.createElement('select');nav.className='question-history';nav.setAttribute('aria-label','查看历史问题');host.before(nav);nav.onchange=()=>{const cards=[...host.querySelectorAll('.question-window')],chosen=cards[Number(nav.value)];for(const card of cards){card.hidden=card!==chosen&&card!==cards.at(-1);card.open=card===chosen}host.scrollTop=0};}
 const cards=[...host.querySelectorAll('.question-window')];nav.replaceChildren();
 cards.forEach((card,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1}. ${card.querySelector('summary').textContent.slice(0,65)}`;nav.append(option);card.hidden=index<cards.length-2});
 nav.value=String(cards.length-1);nav.hidden=cards.length<3;
}

export function openQuestionWindow(host,card){
 if(!card||!host.contains(card))return false;
 const cards=[...host.querySelectorAll('.question-window')];
 for(const c of cards){c.hidden=c!==card&&c!==cards.at(-1);c.open=c===card}
 const nav=host.parentElement.querySelector('.question-history');if(nav)nav.value=String(cards.indexOf(card));
 activeTurns.set(host,card);host.scrollTop=0;card.querySelector('.question-window-body').scrollTop=0;return true;
}
