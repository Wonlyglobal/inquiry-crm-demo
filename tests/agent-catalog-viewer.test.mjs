import test from 'node:test';import assert from 'node:assert/strict';
import {safeImageUrl,clampPage,viewerDocument,openCatalogViewer} from '../assets/agent-catalog-viewer.mjs';
test('viewer only loads https images and clamps pages',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'),null);assert.equal(safeImageUrl('http://x.test/a.jpg'),null);assert.equal(safeImageUrl('https://u:p@x.test/a.jpg'),null);
 assert.equal(safeImageUrl('https://x.test/a.jpg?token=t'),'https://x.test/a.jpg?token=t');
 assert.equal(clampPage(0,10),1);assert.equal(clampPage(99,10),10);assert.equal(clampPage('3',10),3);assert.equal(clampPage(5,0),1);
});
test('separate-window document escapes the title and drops unsafe links',()=>{
 const d=viewerDocument('零售</script><b>',['https://x.test/1.jpg','javascript:1'],2);
 assert.doesNotMatch(d,/javascript:1/);assert.doesNotMatch(d,/<\/script><b>/);assert.match(d,/let k=2/);assert.match(d,/\/ 2</);
});
// Minimal DOM stub: enough to drive the in-page overlay.
function fakeDoc(){const listeners={};const mk=tag=>{const n={tag,children:[],attrs:{},textContent:'',value:'',disabled:false,style:{},className:'',id:'',
 append(...c){this.children.push(...c)},remove(){n.removed=true},setAttribute(k,v){this.attrs[k]=v}};return n};
 const body=mk('body'),head=mk('head');
 return {body,head,createElement:mk,createTextNode:t=>({text:t}),getElementById:()=>null,querySelector:()=>null,addEventListener:(t,f)=>{listeners[t]=f},removeEventListener:t=>{delete listeners[t]},listeners};}
test('in-page viewer flips pages with buttons and keys, and closes on Esc',()=>{
 const doc=fakeDoc();const win={Image:function(){},open:()=>null};
 const urls=Array.from({length:5},(_,i)=>`https://x.test/p${i+1}.jpg`);
 const v=openCatalogViewer({title:'零售画册',urls,start:4,doc,win});
 assert.equal(v.page(),4);v.go(9);assert.equal(v.page(),5);
 doc.listeners.keydown({key:'ArrowLeft'});assert.equal(v.page(),4);
 doc.listeners.keydown({key:'Escape'});assert.equal(doc.listeners.keydown,undefined);
 assert.throws(()=>openCatalogViewer({title:'x',urls:[],doc,win}),/打不开/);
});
