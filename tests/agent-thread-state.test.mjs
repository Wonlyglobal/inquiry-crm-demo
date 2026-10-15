import test from 'node:test';import assert from 'node:assert/strict';
import {currentQuestionWindow,openQuestionWindow} from '../assets/agent-question-windows.mjs';
test('a detached prior-persona card never receives the next reply',()=>{const old={querySelector:()=>({scrollTop:0})},fresh={};let attached=true;const host={contains:c=>attached&&c===old,querySelector:()=>null,lastElementChild:fresh,querySelectorAll:()=>[old],parentElement:{querySelector:()=>null},scrollTop:0};assert.equal(openQuestionWindow(host,old),true);assert.equal(currentQuestionWindow(host),old);attached=false;assert.equal(currentQuestionWindow(host),fresh)});

test('viewing a historical card never changes the destination of an in-flight reply',()=>{
 const writer={querySelector:()=>({scrollTop:0})},history={querySelector:()=>({scrollTop:0})};const cards=[writer,history];const host={contains:c=>cards.includes(c),querySelector:()=>history,lastElementChild:history,querySelectorAll:()=>cards,parentElement:{querySelector:()=>null},scrollTop:0};
 openQuestionWindow(host,writer);assert.equal(currentQuestionWindow(host),writer);openQuestionWindow(host,history,{viewOnly:true});assert.equal(currentQuestionWindow(host),writer);assert.equal(history.open,true);
});
