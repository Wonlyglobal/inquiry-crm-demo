import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("owner dashboard opens the verified historical orders in the combined yearly view", () => {
  assert.match(html, /profile\?\.role==="owner"&&\(historicalOrders\|\|\[\]\)\.length/);
  assert.match(html, /#dashboard-data-scope"\)\.value="combined"/);
  assert.match(html, /#dashboard-period"\)\.value="year"/);
  assert.match(html, /button\.dataset\.period==="year"/);
});
