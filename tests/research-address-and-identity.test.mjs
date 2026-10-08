import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("automatic company research never promotes a geocoder or website address to verified data", () => {
  assert.match(html, /async function completeOnlineResearchAndSave\(\)\s*\{\s*if \(!\$\("#detail-research-domain"\)\.value\.trim\(\)\)/);
  assert.match(html, /async function completeOnlineResearchAndSave\(\)[\s\S]*?await loadCompanyImages\(\);/);
  assert.doesNotMatch(html, /Promise\.allSettled\(\[loadCompanyImages\(\),\s*locateCompanyAutomatically\(\)\]\)/);
  assert.doesNotMatch(html, /addressInput\.value = officialAddress/);
  assert.doesNotMatch(html, /select\.selectedIndex = 0; applyMapCandidate/);
  assert.match(html, /id="clear-company-address"/);
});

test("alternate domains are separately persisted and never replace the scalar primary domain", () => {
  assert.match(html, /id="detail-research-domain-aliases"/);
  assert.match(html, /domain_aliases:/);
  assert.match(html, /savedResearchBrief\.domain_aliases/);
});

test("WhatsApp identity-verification requests are not represented as procurement intent", () => {
  assert.match(html, /isWhatsAppIdentityCheck/);
  assert.match(html, /不是采购需求/);
  assert.match(html, /未核验前不披露员工信息/);
  assert.match(html, /company_match_required/);
});
