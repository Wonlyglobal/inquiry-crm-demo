import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('dashboard header omits retired action buttons and subtitle',()=>{
  assert.doesNotMatch(html,/id=["']dashboard-targets["']/);
  assert.doesNotMatch(html,/id=["']dashboard-export-csv["']/);
  assert.doesNotMatch(html,/id=["']dashboard-export-pdf["']/);
  assert.doesNotMatch(html,/id=["']dashboard-subtitle["']/);
});
