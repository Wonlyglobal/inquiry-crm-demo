import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("sales daily header keeps the return action inside narrow viewports", () => {
  assert.match(html, /#daily-modal \{[^}]*min-width:0;[^}]*max-width:100%;/s);
  assert.match(html, /#daily-modal \.modal \{[^}]*min-width:0;[^}]*max-width:100%;/s);
  assert.match(html, /#daily-modal \.modal-head \{[^}]*max-width:100%;[^}]*flex-wrap:wrap;/s);
  assert.match(html, /#daily-modal \.modal-head > div \{[^}]*flex:1 1 320px;[^}]*min-width:0;/s);
  assert.match(html, /#daily-modal \.modal-head > #close-daily \{[^}]*max-width:100%;[^}]*margin-left:auto;/s);
  assert.match(html, /@media \(max-width: 850px\)[\s\S]*#daily-modal \.modal-head > #close-daily \{ margin-left:0; \}/);
});
