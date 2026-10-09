import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("verified imported orders stay in current CRM and follow the selected time range", () => {
  assert.doesNotMatch(html, /profile\?\.role==="owner"&&\(historicalOrders\|\|\[\]\)\.length&&\$\("#dashboard-data-scope"\)/);
  assert.match(html, /includeImportedOrders=\$\("#dashboard-data-scope"\)\?\.value!=="legacy"/);
  assert.match(html, /x=>x\.ordered_at&&inRange\(x\.ordered_at,start,end\)/);
  assert.match(html, /销售额（CRM成交＋导入订单）/);
  assert.match(html, /data-period="all">全部历史/);
});
