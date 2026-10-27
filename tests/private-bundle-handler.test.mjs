import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPrivateIntelligence} from '../assets/agent-private-intelligence.mjs';

// In-memory DOM and synthetic bundles only; no browser, network or private payloads.
const marker='SYNTHETIC_PRIVATE_BODY_MUST_NOT_BE_ECHOED';
const bundle={schema:'grace-private-intelligence-bundle-v1',documents:[{kind:'product',synthetic:marker}]};
const raw=JSON.stringify(bundle);
const receipt={id:'11111111-1111-4111-8111-111111111111',digest:'a'.repeat(64),key:'product-'+'b'.repeat(64)};

class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this._value='';this.textContent='';this.disabled=false;}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(name,value){this.attributes[name]=String(value)}
 replaceChildren(...nodes){this.children=[...nodes]}
 get value(){return this._value}
 set value(value){this._value=String(value);if(this.type==='file'&&this._value==='')this.files=[]}
}
function find(root,predicate){
 if(predicate(root))return root;
 for(const child of root.children){const found=find(child,predicate);if(found)return found}
 return null;
}
async function withUI({invoke,isAllowed=()=>true},run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});
 try{
  const box=mountPrivateIntelligence(new Element('host'),{invoke,isAllowed});
  const labelled=label=>find(box,n=>n.attributes['aria-label']===label);
  const button=label=>find(box,n=>n.tagName==='button'&&n.textContent===label);
  const ui={box,input:labelled('选择内部知识包'),paste:labelled('粘贴内部知识包'),submit:button('同步并回读验证'),refresh:button('回读已同步知识'),social:button('同步社媒逐帖并回读'),status:find(box,n=>n.attributes.role==='status'),receipts:labelled('私有知识同步回执')};
  assert.ok(Object.values(ui).every(Boolean));
  return await run(ui);
 }finally{
  if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;
 }
}
function assertBusy(ui,value){
 assert.equal(ui.box.attributes['aria-busy'],String(value));
 for(const control of [ui.input,ui.paste,ui.submit,ui.refresh,ui.social])assert.equal(control.disabled,value);
}
function assertSafeFailure(ui){
 assert.match(ui.status.textContent,/未完成/);assert.doesNotMatch(ui.status.textContent,new RegExp(marker));assertBusy(ui,false);
}

test('import RPC errors never echo their body and preserve pasted input',async()=>{
 let calls=0,ui;
 await withUI({invoke:async request=>{calls++;assert.equal(request.action,'private-intelligence-import');assertBusy(ui,true);throw Error(marker)}},async current=>{
  ui=current;assert.equal(ui.input.files,undefined);ui.paste.value=raw;
  await ui.submit.onclick();
  assert.equal(calls,1);assertSafeFailure(ui);assert.equal(ui.paste.value,raw);assert.equal(ui.receipts.children.length,0);
 });
});

test('File.text errors never echo their body, never invoke import and preserve the selected file',async()=>{
 let calls=0;
 await withUI({invoke:async()=>{calls++;throw Error('must not invoke')}},async ui=>{
  const file={size:100,text:async()=>{assertBusy(ui,true);throw Error(marker)}};
  ui.input.value='synthetic-bundle.json';ui.input.files=[file];
  await ui.submit.onclick();
  assert.equal(calls,0);assertSafeFailure(ui);assert.equal(ui.input.value,'synthetic-bundle.json');assert.equal(ui.input.files[0],file);
 });
});

test('receipt RPC errors after import never echo their body or clear the retry input',async()=>{
 const calls=[];
 await withUI({invoke:async request=>{
  calls.push(request.action);
  if(request.action==='private-intelligence-import')return {receipts:[receipt]};
  throw Error(marker);
 }},async ui=>{
  ui.paste.value=raw;await ui.submit.onclick();
  assert.deepEqual(calls,['private-intelligence-import','private-intelligence-receipt']);assertSafeFailure(ui);
  assert.equal(ui.paste.value,raw);assert.equal(ui.receipts.children.length,0);
 });
});

test('list/readback RPC errors never echo their body or change an unsubmitted bundle',async()=>{
 const calls=[];
 await withUI({invoke:async request=>{calls.push(request.action);throw Error(marker)}},async ui=>{
  ui.paste.value=raw;await ui.refresh.onclick();
  assert.deepEqual(calls,['private-intelligence-list']);assertSafeFailure(ui);assert.equal(ui.paste.value,raw);
 });
});

for(const mode of ['paste','file'])test('successful '+mode+' import clears both inputs only after receipt verification',async()=>{
 const calls=[];let ui;
 await withUI({invoke:async request=>{
  calls.push(request.action);assertBusy(ui,true);
  if(request.action==='private-intelligence-import'){
   assert.deepEqual(request.documents,bundle.documents);
   if(mode==='paste')assert.equal(ui.paste.value,raw);else assert.equal(ui.input.value,'synthetic-bundle.json');
   return {receipts:[receipt]};
  }
  assert.equal(request.id,receipt.id);
  if(mode==='paste')assert.equal(ui.paste.value,raw);else assert.equal(ui.input.value,'synthetic-bundle.json');
  return {receipt};
 }},async current=>{
  ui=current;
  if(mode==='paste')ui.paste.value=raw;else{ui.input.value='synthetic-bundle.json';ui.input.files=[{size:new TextEncoder().encode(raw).length,text:async()=>raw}]}
  await ui.submit.onclick();
  assert.deepEqual(calls,['private-intelligence-import','private-intelligence-receipt']);
  assert.equal(ui.input.value,'');assert.equal(ui.paste.value,'');assertBusy(ui,false);
  assert.equal(ui.receipts.children.length,1);assert.match(ui.status.textContent,/已同步并回读验证 1 份/);
 });
});

test('authorization revoked while File.text is pending prevents every import/write request',async()=>{
 let allowed=true,calls=0,resolveRead,reading=false;
 const pending=new Promise(resolve=>{resolveRead=resolve});
 await withUI({isAllowed:()=>allowed,invoke:async()=>{calls++;throw Error('must not invoke')}},async ui=>{
  const file={size:100,text:()=>{reading=true;return pending}};
  ui.input.value='synthetic-bundle.json';ui.input.files=[file];
  const completion=ui.submit.onclick();assert.equal(reading,true);assertBusy(ui,true);
  allowed=false;resolveRead(raw);await completion;
  assert.equal(calls,0);assertSafeFailure(ui);assert.equal(ui.input.value,'synthetic-bundle.json');assert.equal(ui.input.files[0],file);
 });
});

test('an unauthorized submit or readback never invokes the private endpoint',async()=>{
 let calls=0;
 await withUI({isAllowed:()=>false,invoke:async()=>{calls++;throw Error('must not invoke')}},async ui=>{
  ui.paste.value=raw;await ui.submit.onclick();await ui.refresh.onclick();
  assert.equal(calls,0);assert.equal(ui.paste.value,raw);assert.equal(ui.receipts.children.length,0);
 });
});
