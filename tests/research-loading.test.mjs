import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('research shows indeterminate progress and honest processing stages',()=>{
 assert.match(html,/id="research-loading"[^>]*role="status"[^>]*aria-live="polite"/);
 assert.match(html,/<progress aria-label="背调正在处理"/);
 assert.doesNotMatch(html,/<progress[^>]*value=/);
 assert.match(html,/1\/3 正在访问当前官网/);
 assert.match(html,/2\/3 正在整理公开事实/);
 assert.match(html,/3\/3 正在检查证据覆盖/);
 assert.match(html,/finally\{autonomousResearchInquiryId=null;button.disabled=false;button.textContent=originalLabel;button.removeAttribute\("aria-busy"\);loading.classList.add\("hidden"\);\}/);
});
