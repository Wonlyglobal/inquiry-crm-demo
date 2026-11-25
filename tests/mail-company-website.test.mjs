import test from 'node:test';
import assert from 'node:assert/strict';
import {mailCompanyWebsite as extract} from '../assets/mail-company-website.mjs';
test('email domains never become websites',()=>{
 for(const body of ['buyer@real-company.ae','Email: buyer@gmail.com','Website: buyer@real-company.ae','buyer@www.real-company.ae'])assert.equal(extract(body).domain,'');
});
test('body website fields and signature URLs supply candidates',()=>{
 assert.equal(extract('Email: buyer@mail.ru\nWebsite: https://www.customer.ae/about').domain,'customer.ae');
 assert.equal(extract('Regards\nSales\nwww.customer.ae').domain,'customer.ae');
 assert.equal(extract('官网：https://customer.cn').domain,'customer.cn');
 assert.equal(extract('Website: customer.ae\nhttps://other.ae').domain,'customer.ae');
});
test('providers and ambiguous links do not become company websites',()=>{
 for(const body of ['https://app.web3forms.com','https://mail.ru','https://wonlyglobal.com','https://linkedin.com/company/a','Website: http://127.0.0.1','Website: https://user:pass@customer.ae'])assert.equal(extract(body).domain,'');
 assert.equal(extract('https://first.ae https://second.ae').status,'conflict');
 assert.equal(extract('Website: first.ae\nWebsite: second.ae').domain,'');
});
test('multiple candidates select unique highest company match, never break ties arbitrarily',()=>{
 assert.equal(extract('https://acme.ae https://unrelated.ae','Acme LLC').domain,'acme.ae');
 assert.equal(extract('Website: acme.ae\nWebsite: unrelated.ae','Acme LLC').domain,'acme.ae');
 assert.equal(extract('https://acme.ae https://acme.com','Acme LLC').domain,'');
 assert.equal(extract('https://first.ae https://second.ae','Trading LLC').domain,'');
});

import {researchWebsiteCandidate} from '../assets/mail-company-website.mjs';
test('saved research fills a uniquely name-matched candidate, retaining provenance',()=>{
 const result=researchWebsiteCandidate('No website supplied','MSB Company',[{url:'https://www.msbholding.com.sa/'},{url:'https://www.msbholding.com.sa/copy-of-our-companies'},{url:'https://sa.linkedin.com/company/msb-holding'}]);
 assert.equal(result.domain,'msbholding.com.sa');
 assert.equal(result.source,'saved_research_evidence');
 assert.equal(result.status,'candidate');
 assert.equal(researchWebsiteCandidate('Website: supplied.sa','MSB Company',[{url:'https://msbholding.com.sa'}]).domain,'supplied.sa');
 for(const sources of [[{url:'https://fincen.gov'}],[{url:'https://msbholding.com.sa'},{url:'https://msb.com'}]])assert.equal(researchWebsiteCandidate('','MSB Company',sources).domain,'');
});
