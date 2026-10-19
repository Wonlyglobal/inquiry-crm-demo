// Presentation only: move existing controls, retaining their handlers and authorization.
export function arrangeVoiceSettings(tools,root){
 if(!tools||tools.dataset.grouped==='true')return;
 tools.dataset.grouped='true';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n};
 const control=name=>tools.querySelector(`[data-voice-tool="${name}"]`);
 const move=(host,names)=>{for(const name of names){const node=control(name);if(node)host.append(node)}};
 const card=(title,description)=>{const box=el('section',null,'voice-settings-card');box.append(el('h3',title));if(description)box.append(el('p',description,'voice-settings-description'));return box};
 const live=el('div',null,'voice-settings-status');move(live,['status','stop']);
 const call=card('连续通话','拨通后连续提问，说完自动回答。');move(call,['phone']);
 const during=el('div',null,'voice-settings-actions voice-settings-during');move(during,['interrupt','mute']);call.append(during);
 const voiceprint=card('我的声纹','共录入 3 段，每段连续说话 5–10 秒。');
 const progress=el('div',null,'voice-settings-progress');progress.setAttribute('aria-label','声纹登记进度');
 const count=el('strong','待检查'),dots=el('div',null,'voice-settings-dots');
 for(let i=0;i<3;i++)dots.append(el('span',String(i+1)));progress.append(count,dots);voiceprint.append(progress);
 move(voiceprint,['voiceprint-status']);const enrollActions=el('div',null,'voice-settings-actions');move(enrollActions,['enroll','enrollment-status']);voiceprint.append(enrollActions);
 const manage=el('details',null,'voice-settings-manage');manage.append(el('summary','声纹管理'));move(manage,['forget']);voiceprint.append(manage);
 const connection=card('连接检查','遇到没有回复或播放问题时，可在这里检查。');const checks=el('div',null,'voice-settings-actions');move(checks,['check','realtime-check']);connection.append(checks);
 const advanced=el('details',null,'voice-settings-card voice-settings-advanced');advanced.append(el('summary','高级语音选项'));
 const mode=el('label','回答方式','voice-settings-mode');move(mode,['mode']);advanced.append(mode);
 advanced.append(el('p','Hello 唤醒与单次录音','voice-settings-description'));const advancedActions=el('div',null,'voice-settings-actions');move(advancedActions,['wake','start-wake','install','mic','replay','reveal']);advanced.append(advancedActions);
 const privacy=el('details',null,'voice-settings-card voice-settings-privacy');privacy.append(el('summary','数据与隐私说明'));move(privacy,['privacy']);
 tools.append(live,call,voiceprint,connection);
 const knowledge=tools.querySelector('[data-private-knowledge]');if(knowledge)tools.append(knowledge);
 tools.append(advanced,privacy);
 const paint=()=>{const samples=Number(tools.dataset.voiceprintSamples),required=Number(tools.dataset.voiceprintRequired),known=tools.dataset.voiceprintSamples!==undefined&&required>0;
  count.textContent=known?`${tools.dataset.voiceprintConfirmed==='false'?'上次确认：':''}${Math.min(samples,required)} / ${required} 段`:'待检查登记进度';
  [...dots.children].forEach((dot,i)=>{dot.classList.toggle('complete',known&&i<samples);dot.setAttribute('aria-label',`第 ${i+1} 段${!known?'状态待检查':i<samples?'已记录':'待录入'}`)});
 };
 tools.addEventListener('grace-voiceprint-state',paint);paint();
 root.addEventListener('grace-call-state',e=>{tools.dataset.callActive=String(e.detail.active)});tools.dataset.callActive='false';
}

// Exact old operation notices only. Keep the nodes and all real dialogue; no stored history is deleted.
export function legacyVoiceNotice(text=''){
 return /^(?:声纹服务暂时不可用，请稍后再试。|已删除你的声纹（\d+ 段样本特征），之后我不再按声音识别说话人。|已记录第 \d+ 段，还需要 \d+ 段。换一句话再录一次即可。)$/.test(text.trim());
}
export function tidyMobileMessages(messages,empty){
 if(!messages)return;
 for(const node of messages.querySelectorAll('.ai-message.assistant')){
  if(legacyVoiceNotice(node.textContent)){node.dataset.voiceOperationNotice='true';node.hidden=true}
 }
 for(const card of messages.querySelectorAll('.question-window')){
  const body=card.querySelector('.question-window-body'),children=[...(body?.children||[])];
  if(children.length&&children.every(n=>n.dataset.voiceOperationNotice==='true'))card.dataset.voiceOperationOnly='true';else delete card.dataset.voiceOperationOnly;
 }
 empty.hidden=!![...messages.querySelectorAll('.ai-message')].find(n=>!n.hidden&&n.textContent.trim())||!!messages.querySelector('iframe,.agent-material');
}
