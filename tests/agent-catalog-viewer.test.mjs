import test from 'node:test';import assert from 'node:assert/strict';
import {safeImageUrl,clampPage,openCatalogViewer} from '../assets/agent-catalog-viewer.mjs';
import {revealInPanel} from '../assets/agent-panel-scroll.mjs';
test('revealing a page changes only its panel vertical offset, including tall pages',()=>{
 const panel={scrollTop:10,scrollLeft:27,getBoundingClientRect:()=>({top:100,bottom:300,height:200})};
 revealInPanel({getBoundingClientRect:()=>({top:250,bottom:350,height:100})},panel);assert.equal(panel.scrollTop,60);assert.equal(panel.scrollLeft,27);
 revealInPanel({getBoundingClientRect:()=>({top:150,bottom:600,height:450})},panel);assert.equal(panel.scrollTop,110);assert.equal(panel.scrollLeft,27);
 revealInPanel({getBoundingClientRect:()=>({top:120,bottom:160,height:40})},panel);assert.equal(panel.scrollTop,110);
});
test('viewer only loads https links and clamps pages',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'),null);assert.equal(safeImageUrl('http://x.test/a.jpg'),null);assert.equal(safeImageUrl('https://u:p@x.test/a.jpg'),null);
 assert.equal(safeImageUrl('https://x.test/a.jpg?token=t'),'https://x.test/a.jpg?token=t');
 assert.equal(clampPage(0,10),1);assert.equal(clampPage(99,10),10);assert.equal(clampPage('3',10),3);assert.equal(clampPage(5,0),1);
});
// Minimal DOM stub: enough to drive the inline viewer.
function fakeDoc(){let doc;const mk=tag=>{const cls=new Set(),listeners={};const n={tag,children:[],parentNode:null,attrs:{},textContent:'',value:'',disabled:false,className:'',id:'',href:'',
 classList:{add:c=>cls.add(c),toggle:(c,on)=>{on?cls.add(c):cls.delete(c)},contains:c=>cls.has(c)},listeners,addEventListener:(t,f)=>{listeners[t]=f},
 append(...nodes){for(const node of nodes){node.remove?.();node.parentNode=this;node.removed=false;this.children.push(node)}},
 before(node){if(!this.parentNode)return;node.remove?.();node.parentNode=this.parentNode;node.parentNode.children.splice(node.parentNode.children.indexOf(this),0,node)},
 replaceWith(node){this.before(node);this.remove()},remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null}this.removed=true},
 get isConnected(){for(let p=this;p;p=p.parentNode)if(p===doc.documentElement)return true;return false},focus(options){doc.activeElement=this;this.focusOptions=options},
 setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};return n};
 const all=[];doc={body:mk('body'),head:mk('head'),documentElement:mk('html'),createElement:t=>{const n=mk(t);all.push(n);return n},createTextNode:t=>({text:t}),getElementById:()=>null,all};doc.documentElement.append(doc.head,doc.body);return doc;}
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
test('compact viewer exposes reading mode and paging without a duplicate close control',()=>{
 const doc=fakeDoc(),container=doc.createElement('div');const win={Image:function(){}};
 const urls=Array.from({length:3},(_,i)=>`https://x.test/p${i+1}.jpg`);
 const v=openCatalogViewer({title:'零售画册',urls,pdf:'https://x.test/c2.pdf',container,compact:true,doc,win});
 const bar=v.root.children[0];const labels=bar.children.map(n=>n.textContent).filter(Boolean);
 assert.deepEqual(labels,['零售画册','上一页','下一页','放大阅读','下载 PDF']);assert.equal(v.root.classList.contains('acv-compact'),true);
});
test('PDF download goes to the material library when the original is found there',async()=>{
 const doc=fakeDoc(),container=doc.createElement('div');const got=[];
 const v=openCatalogViewer({title:'零售画册',urls:['https://x.test/p1.jpg'],pdf:'https://x.test/c2.pdf',material:{id:'m1',name:'Retail.pdf'},onMaterialDownload:async a=>got.push(a.id),container,compact:true,doc,win:{Image:function(){}}});
 const btn=doc.all.find(n=>n.tag==='button'&&n.textContent==='下载 PDF');assert.ok(btn);assert.equal(doc.all.filter(n=>n.tag==='a').length,0);
 await btn.onclick();assert.deepEqual(got,['m1']);assert.match(v.root.children[2].textContent,/物料库/);
});
test('native reading layer keeps paging state and returns from Escape even in the page input',()=>{
 const doc=fakeDoc(),container=doc.createElement('div');doc.body.append(container);
 const v=openCatalogViewer({title:'合成',urls:['https://x.test/1.jpg','https://x.test/2.jpg'],container,compact:true,doc,win:{Image:function(){}}});
 let shown=0,hidden=0;v.root.showPopover=()=>shown++;v.root.hidePopover=()=>hidden++;
 v.toggle(true);v.go(2);assert.equal(shown,1);assert.equal(v.root.attrs.popover,'manual');assert.equal(v.root.parentNode,container);assert.deepEqual(v.root.focusOptions,{preventScroll:true});
 const num=doc.all.find(x=>x.tag==='input');num.value='1';v.root.listeners.keydown({target:num,key:'Enter',preventDefault(){}});assert.equal(v.page(),1);v.go(2);v.root.listeners.keydown({target:num,key:'Escape'});
 assert.equal(hidden,1);assert.equal(v.page(),2);assert.equal(v.root.attrs.popover,undefined);assert.equal(v.root.classList.contains('acv-big'),false);
});
test('fallback reader restores its original position and removes private images when its owner unmounts',()=>{
 const doc=fakeDoc(),container=doc.createElement('div');doc.body.append(container);let observe;
 const win={Image:function(){},MutationObserver:class{constructor(cb){observe=cb}observe(){}disconnect(){}}};
 const v=openCatalogViewer({title:'合成',urls:['https://x.test/1.jpg'],container,compact:true,doc,win});
 v.toggle(true);assert.equal(v.root.parentNode,doc.body);v.toggle(false);assert.equal(v.root.parentNode,container);
 v.toggle(true);container.remove();observe();assert.equal(v.root.isConnected,false);assert.equal(v.root.classList.contains('acv-big'),false);
});
