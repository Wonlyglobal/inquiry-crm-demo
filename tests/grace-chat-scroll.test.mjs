import test from 'node:test';import assert from 'node:assert/strict';
import {mountChatScroll} from '../assets/grace-chat-scroll.mjs';
test('follow stream, pause on history reading, return button and delayed media layout',()=>{
 let frame,mutation,resize;globalThis.requestAnimationFrame=f=>(frame=f,1);globalThis.cancelAnimationFrame=()=>{};
 globalThis.MutationObserver=class{constructor(f){mutation=f}observe(){}disconnect(){}};globalThis.ResizeObserver=class{constructor(f){resize=f}observe(){}disconnect(){}};
 const events={},button={style:{},remove(){}};let top=0;
 const scroller={scrollHeight:1000,clientHeight:500,get scrollTop(){return top},set scrollTop(v){top=Math.min(v,this.scrollHeight-this.clientHeight)},addEventListener(n,f){events[n]=f}};
 const host={ownerDocument:{createElement:()=>button},prepend(){}};
 const control=mountChatScroll({scroller,content:{addEventListener(){}},buttonHost:host});const flush=()=>{const f=frame;frame=null;f?.()};
 control.latest();flush();assert.equal(top,500);assert.equal(button.hidden,true);
 scroller.scrollHeight=1200;mutation();flush();assert.equal(top,700);
 events.wheel({deltaY:-50});scroller.scrollTop=300;events.scroll();assert.equal(button.hidden,false);
 scroller.scrollHeight=1400;mutation();flush();assert.equal(top,300);
 button.onclick();flush();assert.equal(top,900);assert.equal(button.hidden,true);
 scroller.scrollHeight=1600;resize();flush();assert.equal(top,1100);
});
test('layout scroll does not cancel following; disconnect removes listeners',()=>{
 let frame,resize;globalThis.requestAnimationFrame=f=>(frame=f,1);globalThis.cancelAnimationFrame=()=>{};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.ResizeObserver=class{constructor(f){resize=f}observe(){}disconnect(){}};
 const events={};let top=0;const scroller={scrollHeight:1000,clientHeight:500,get scrollTop(){return top},set scrollTop(v){top=Math.min(v,this.scrollHeight-this.clientHeight)},addEventListener(n,f){events[n]=f},removeEventListener(n){delete events[n]}};
 const content={addEventListener(){},removeEventListener(){}};const control=mountChatScroll({scroller,content});const flush=()=>{const f=frame;frame=null;f?.()};flush();assert.equal(top,500);
 top=350;events.scroll();scroller.scrollHeight=1300;resize();flush();assert.equal(top,800);
 events.touchstart({touches:[{clientY:100}]});events.touchmove({touches:[{clientY:160}]});top=200;resize();flush();assert.equal(top,200);
 control.latest();flush();assert.equal(top,800);control.disconnect();assert.equal(Object.keys(events).length,0);
});
