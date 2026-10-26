import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('restored outreach keeps original editor fields ahead of optional research panels',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const section=html.slice(html.indexOf('data-detail-section="outreach"'),html.indexOf('data-detail-section="validity"'));
 assert.equal((section.match(/id="outreach-objective"/g)||[]).length,1);
 assert.ok(section.indexOf('id="outreach-objective"')<section.indexOf('id="outreach-advanced-materials"'));
 assert.match(section,/<details id="outreach-advanced-materials" class="quality-panel">/);
 assert.doesNotMatch(section,/<details id="outreach-public-panel"[^>]*\bopen\b/);
 assert.ok(section.includes('value="meeting"'));
 assert.ok(section.indexOf('id="outreach-recipient"')<section.indexOf('id="outreach-objective"'));
 assert.ok(section.indexOf('id="outreach-objective"')<section.indexOf('id="outreach-tone"'));
 assert.ok(section.indexOf('id="outreach-body"')<section.indexOf('id="outreach-advanced-materials"'));
 assert.equal((section.match(/data-outreach-language="/g)||[]).length,6);
});
