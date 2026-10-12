import test from 'node:test';import assert from 'node:assert/strict';
import {modelChoices,modelChoiceButtons} from '../assets/agent-model-choices.mjs';
test('only bounded plain model names become choices',()=>{assert.deepEqual(modelChoices(['X60 Pro','X60 Max','X60 Pro','<script>','',null]),['X60 Pro','X60 Max']);assert.equal(modelChoices(Array.from({length:20},(_,i)=>`X${i}`)).length,8)});
test('one click passes the exact chosen model and prevents duplicate clicks while pending',async()=>{const doc={createElement(){return {children:[],setAttribute(k,v){this[k]=v},append(c){this.children.push(c)}}}};let release;let selected;const group=modelChoiceButtons(['X60 Pro','X60 Max'],model=>{selected=model;return new Promise(r=>release=r)},doc);const pending=group.children[0].onclick();assert.equal(selected,'X60 Pro');assert.ok(group.children.every(b=>b.disabled));release();await pending;assert.ok(group.children.every(b=>!b.disabled));assert.equal(group.children[0]['aria-pressed'],'true')});
import {clarificationChoices} from '../assets/agent-model-choices.mjs';
test('clarification options require an explicit block and exclude normal advice',()=>{
 assert.deepEqual(clarificationChoices('我需要先确认。\n请选择你想表达的意思：\n1. 官网搜索优化\n2. 社媒内容优化\n\n再继续回答。'),['官网搜索优化','社媒内容优化']);
 assert.deepEqual(clarificationChoices('建议：\n1. 官网搜索优化\n2. 社媒内容优化'),[]);
 assert.deepEqual(clarificationChoices('请选择你想表达的意思：\n1. <script>\n2. https://test.com'),[]);
});
