import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/202608270001_management_dashboard.sql', import.meta.url), 'utf8');

test('inquiry editor submits deal_type values accepted by the database constraint', () => {
  const constraint = migration.match(/deal_type text not null default '([^']+)' check \(deal_type in \('([^']+)','([^']+)'\)\)/);
  assert.ok(constraint, 'expected the existing deal_type database constraint');
  const allowed = new Set(constraint.slice(1));
  const select = html.match(/<select id="detail-deal-type"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const options = [...select.matchAll(/<option value="([^"]+)">/g)].map((match) => match[1]);
  assert.deepEqual(new Set(options), allowed);
  assert.match(html, /const normalizeDealType=value=>value==="repeat"\|\|value==="repeat_order"\?"repeat_order":"first_order";/);
  assert.match(html, /\$\("#detail-deal-type"\)\.value = normalizeDealType\(inquiry\.deal_type\)/);
  assert.match(html, /deal_type: normalizeDealType\(\$\("#detail-deal-type"\)\.value\)/);
});

test('legacy deal_type values remain editable without being resubmitted', () => {
  assert.match(html, /value==="repeat"\|\|value==="repeat_order"\?"repeat_order":"first_order"/);
});
