import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {crmStatsChart} from '../supabase/functions/agent-conversation/data-charts.mjs';

// Execute the actual request-local setup, chart assignment and response gate.
// Pure chart unit tests never ran this integration path, so an undeclared
// assignment could previously break all model questions before the model call.
const source=readFileSync(new URL('../supabase/functions/agent-conversation/index.ts',import.meta.url),'utf8');
const start=source.indexOf('  let speakerCheck:');
const setup=stripTypeScriptTypes(source.slice(start,source.indexOf("  if(input.action==='chat'){",start)));
const assignment=source.match(/^\s*crmForChart=crm;$/m)?.[0];
const responseGate=source.match(/^\s*const dataChart=input\.action==='chat'[^\n]+/m)?.[0];
assert.ok(assignment&&responseGate,'request chart integration remains identifiable');
const request=new Function('input','crm','crmStatsChart',`"use strict";const CHAT_URL="https://example.invalid";${setup}\nif(input.action==='chat'){${assignment}}\n${responseGate}\nreturn dataChart;`);

test('general question reaches response chart gate without ReferenceError',()=>{
 assert.equal(request({action:'chat',question:'月亮为什么有阴晴圆缺'},{status:'not_requested'},crmStatsChart),null);
});
test('each request uses only its own permitted aggregate snapshot',()=>{
 const stats=n=>({status:'available',lead_count:n,channels:[{label:'website',count:n}]});
 assert.equal(request({action:'chat',question:'渠道分布'},stats(6),crmStatsChart).chart.bars[0].value,6);
 assert.equal(request({action:'chat',question:'渠道分布'},stats(9),crmStatsChart).chart.bars[0].value,9);
 assert.equal(request({action:'chat',question:'渠道分布'},{status:'unavailable'},crmStatsChart),null);
});
test('speech/transcription paths do not inherit or generate CRM charts',()=>{
 assert.equal(request({action:'transcribe'},undefined,()=>{throw Error('must not be called')}),null);
});
