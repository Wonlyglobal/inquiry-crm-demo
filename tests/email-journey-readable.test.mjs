import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function emailJourneyView('),html.indexOf('      function emailLocalEvidenceCard('));
const [parse,render]=new Function('esc',`${source};return [emailJourneyView,renderEmailReadableBody];`)(x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
test('form tracking becomes human steps with Shanghai time, preserving the email separately',()=>{
 const body='name: Buyer\nmessage: Please quote\njourney_session: private-session\njourney_events: '+JSON.stringify([{event_name:'cta_click',event_at:'2026-10-20T03:33:23Z',page_title:'Metal Door 1.0',page_path:'/ru/products/metal-doors/1-0',cta_name:'Get Quote'},{event_name:'form_start',event_at:'2026-10-20T03:33:27Z'},{event_name:'form_submit',event_at:'2026-10-20T03:34:35Z'}]);
 const parsed=parse(body);assert.equal(parsed.events.length,3);assert.match(parsed.readableBody,/Please quote/);assert.doesNotMatch(parsed.readableBody,/journey_events|private-session/);
 const output=render(body);const visible=output.split('<details')[0];
 assert.match(visible,/<ol/);assert.match(visible,/开始填写表单/);assert.match(visible,/提交表单/);assert.match(visible,/11:34:35/);assert.match(visible,/Metal Door 1.0/);assert.doesNotMatch(visible,/event_name|page_path|journey_events|private-session/);
 assert.match(output,/<details[^>]*><summary/);assert.doesNotMatch(output,/<details[^>]* open/);
});
test('pretty JSON with brackets in quoted labels parses and hostile page titles remain escaped',()=>{
 const body='message: hello\njourney_events: '+JSON.stringify([{event_name:'form_open',page_title:'<script>attack()</script> [quoted bracket]',cta_name:'say "hello"'}],null,2)+'\nadditional: retained';
 assert.equal(parse(body).events.length,1);assert.match(parse(body).readableBody,/additional: retained/);
 const output=render(body);assert.doesNotMatch(output,/<script>/);assert.match(output,/&lt;script&gt;/);assert.match(output,/时间未记录/);
});
test('malformed tracking is disclosed without showing technical fragments in the main body',()=>{
 const body='message: quote please\njourney_events: [{invalid';const parsed=parse(body);
 assert.equal(parsed.error,true);assert.match(parsed.readableBody,/quote please/);
 const output=render(body);assert.match(output,/访问记录格式异常/);assert.doesNotMatch(output.split('<details')[0],/\[\{invalid/);
 assert.equal(parse('Ordinary email').hasJourney,false);
});
