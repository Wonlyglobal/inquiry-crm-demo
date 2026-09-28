import test from 'node:test';import assert from 'node:assert/strict';
import {safeImageUrl,clampPage,openCatalogViewer} from '../assets/agent-catalog-viewer.mjs';
test('viewer only loads https links and clamps pages',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'),null);assert.equal(safeImageUrl('http://x.test/a.jpg'),null);assert.equal(safeImageUrl('https://u:p@x.test/a.jpg'),null);
 assert.equal(safeImageUrl('https://x.test/a.jpg?token=t'),'https://x.test/a.jpg?token=t');
 assert.equal(clampPage(0,10),1);assert.equal(clampPage(99,10),10);assert.equal(clampPage('3',10),3);assert.equal(clampPage(5,0),1);
});
// Minimal DOM stub: enough to drive the inline viewer.
function fakeDoc(){const mk=tag=>{const cls=new Set(),listeners={};const n={tag,children:[],attrs:{},textContent:'',value:'',disabled:false,className:'',id:'',href:'',
 classList:{toggle:(c,on)=>{on?cls.add(c):cls.delete(c)},contains:c=>cls.has(c)},listeners,addEventListener:(t,f)=>{listeners[t]=f},
 append(...c){this.children.push(...c)},remove(){n.removed=true},setAttribute(k,v){this.attrs[k]=v}};return n};
 const all=[];return {body:mk('body'),head:mk('head'),createElement:t=>{const n=mk(t);all.push(n);return n},createTextNode:t=>({text:t}),getElementById:()=>null,all};}
test('inline viewer stays inside the conversation, flips pages, enlarges in place and offers the PDF',()=>{
 const doc=fakeDoc(),container=doc.createElement('div');const win={Image:function(){},open:()=>{throw Error('must not open a window')}};
 const urls=Array.from({length:5},(_,i)=>`https://x.test/p${i+1}.jpg`);
 const v=openCatalogViewer({title:'零售画册',urls,start:4,pdf:'https://x.test/c2.pdf?token=t',container,doc,win});
 assert.equal(container.children[0],v.root);assert.equal(v.page(),4);v.go(9);assert.equal(v.page(),5);
 v.root.listeners.keydown({key:'ArrowLeft',target:v.root,preventDefault(){}});assert.equal(v.page(),4);
 v.toggle();assert.equal(v.root.classList.contains('acv-big'),true);v.root.listeners.keydown({key:'Escape',target:v.root});assert.equal(v.root.classList.contains('acv-big'),false);
 const a=doc.all.find(n=>n.tag==='a');assert.equal(a.href,'https://x.test/c2.pdf?token=t');assert.equal(a.textContent,'下载 PDF');
 const noPdf=openCatalogViewer({title:'x',urls,pdf:'javascript:1',container,doc,win});assert.equal(noPdf.root.children.length,3);
 assert.equal(doc.all.filter(n=>n.tag==='a').length,1);
 assert.throws(()=>openCatalogViewer({title:'x',urls:[],container,doc,win}),/打不开/);
 assert.throws(()=>openCatalogViewer({title:'x',urls,doc,win}),/显示位置/);
});
