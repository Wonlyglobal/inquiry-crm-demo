import test from 'node:test';
import assert from 'node:assert/strict';
import {mailCompanyIdentity,identitySummary} from '../assets/mail-company-identity.mjs';
test('body claims identify MSB in Riyadh without requiring a website',()=>{
 const c=mailCompanyIdentity('Greetings from MSB Company in Riyadh, Saudi Arabia.\nWe are MSB Company, an established Saudi entity based in Riyadh, Kingdom of Saudi Arabia, actively seeking partnerships.');
 assert.equal(c.company,'MSB Company');assert.match(c.location,/Riyadh/);assert.match(c.location,/Saudi Arabia/);assert.equal(c.verification,'customer_claim');
 const summary=identitySummary(c,{status:'completed',candidates:[{}]});assert.match(summary,/已独立验证事实：本次尚无/);assert.match(summary,/客户自述/);
});
test('provider and sender never identify customer; conflicts never auto select',()=>{
 assert.equal(mailCompanyIdentity('Company: Web3Forms\nFrom: notify@web3forms.com').company,'');
 assert.equal(mailCompanyIdentity('Company: A Trading\nCompany: B Trading').status,'company_match_required');
 assert.equal(mailCompanyIdentity('From: purchase@company.com').company,'');
 assert.equal(mailCompanyIdentity('公司名称：测试有限公司\n所在地：沙特利雅得').company,'测试有限公司');
});

test('line-wrapped country claims normalize before public search validation',()=>{
 const c=mailCompanyIdentity('Greetings from MSB Company in Riyadh, Saudi Arabia.\nWe are MSB Company, an established Saudi entity based in Riyadh, Kingdom of\nSaudi Arabia, actively seeking partnerships.');
 assert.equal(c.company,'MSB Company');assert.doesNotMatch(c.location,/[\n\r]/);assert.match(c.location,/Kingdom of Saudi Arabia/);
});
