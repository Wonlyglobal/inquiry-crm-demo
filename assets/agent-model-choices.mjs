export function modelChoices(values){return [...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9 _./-]{1,59}$/.test(v)).map(v=>v.trim()))].slice(0,8)}
export function modelChoiceButtons(values,onSelect,doc=document){
 const choices=modelChoices(values);if(!choices.length)return null;
 const group=doc.createElement('div');group.className='model-choices';group.setAttribute('role','group');group.setAttribute('aria-label','选择产品型号');
 for(const model of choices){const b=doc.createElement('button');b.type='button';b.textContent=model;b.setAttribute('aria-pressed','false');b.onclick=async()=>{for(const child of group.children){child.disabled=true;child.setAttribute('aria-pressed',String(child===b))}try{await onSelect(model)}finally{for(const child of group.children)child.disabled=false}};group.append(b)}return group;
}

// Only an explicit clarification block becomes choices, never ordinary numbered advice.
export function clarificationChoices(answer){
 const text=String(answer||'');const marker='请选择你想表达的意思：';const at=text.indexOf(marker);if(at<0)return [];
 const section=text.slice(at+marker.length).split(/\n\s*\n/)[0];
 return [...new Set(section.split('\n').map(line=>line.match(/^\s*[1-3][.、)]\s*(.{1,80})\s*$/)?.[1]?.trim()).filter(v=>v&&!/[<>\u0000-\u001f]|https?:\/\//.test(v)))].slice(0,3);
}
export function clarificationButtons(answer,onSelect,doc=document){
 const choices=clarificationChoices(answer);if(choices.length<2)return null;
 const group=doc.createElement('div');group.className='model-choices';group.setAttribute('role','group');group.setAttribute('aria-label','澄清问题意思');
 for(const choice of choices){const b=doc.createElement('button');b.type='button';b.textContent=choice;b.onclick=async()=>{for(const c of group.children)c.disabled=true;try{await onSelect(choice)}finally{for(const c of group.children)c.disabled=false}};group.append(b)}return group;
}
