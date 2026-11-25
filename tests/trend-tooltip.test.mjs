import test from 'node:test';import assert from 'node:assert/strict';import {trendPointText} from '../assets/trend-tooltip.mjs';
test('tooltip identifies period and value including response denominator and no-data',()=>{
 const b={key:'2026-11',fast:2,assigned:4};assert.equal(trendPointText({title:'新增询盘',unit:'条',format:v=>v+' 条'},b,9),'2026-11\n新增询盘：9 条');
 const c={title:'首次响应率',unit:'%',format:v=>v.toFixed(1)+'%'};assert.match(trendPointText(c,b,50),/50.0%.*\n30分钟内首次联系：2 条 \/ 已分配有效询盘：4 条/);assert.match(trendPointText(c,{...b,assigned:0},0),/无已分配询盘/);
 assert.match(trendPointText({title:'成交额',unit:'CNY',format:v=>'¥'+v},b,123),/人民币/);
});

import {bindTrendTooltips} from '../assets/trend-tooltip.mjs';
test('hover highlights exactly the selected point and guide; leave and Escape reset them',()=>{
 const node=()=>{const classes=new Set(),attrs={};return {classes,attrs,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},setAttribute:(k,v)=>attrs[k]=v}};
 const dots=[node(),node()],guides=[node(),node()],tip={hidden:true},hits=[0,1].map(i=>({dataset:{trendIndex:String(i),trendTip:'period '+i},events:{},addEventListener(k,f){this.events[k]=f}}));
 const card={querySelector:()=>tip,querySelectorAll:s=>s==='.trend-dot'?dots:s==='.trend-guide'?guides:hits};bindTrendTooltips({querySelectorAll:()=>[card]});
 hits[0].events.pointerenter();assert.equal(dots[0].attrs.r,'5');assert.ok(guides[0].classes.has('active'));assert.equal(tip.textContent,'period 0');
 hits[1].events.focus();assert.equal(dots[0].attrs.r,'3');assert.equal(dots[1].attrs.r,'5');assert.equal(guides[0].classes.has('active'),false);
 hits[1].events.keydown({key:'Escape'});assert.equal(tip.hidden,true);assert.equal(dots[1].attrs.r,'3');assert.equal(guides[1].classes.has('active'),false);
 hits[0].events.click();hits[0].events.pointerleave();assert.equal(tip.hidden,true);assert.equal(dots[0].attrs.r,'3');
});
