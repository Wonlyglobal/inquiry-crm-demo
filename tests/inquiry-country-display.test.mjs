import test from 'node:test';import assert from 'node:assert/strict';
import {claimedInquiryCountry,inquiryCountryText} from '../assets/inquiry-country-display.mjs';
const aliases={'saudi arabia':['沙特阿拉伯','Saudi Arabia'],沙特阿拉伯:['沙特阿拉伯','Saudi Arabia'],gabon:['加蓬','Gabon'],india:['印度','India'],china:['中国','China']};
test('empty country displays explicit subject geography as a claim without mutating record',()=>{
 const row={title:'Middle East / Saudi Arabia Distributor & Agency Partnership - MSB Company (Riyadh)',target_country:null};const before=JSON.stringify(row);
 assert.equal(inquiryCountryText(row,aliases),'沙特阿拉伯 / Saudi Arabia（客户自述）');assert.equal(JSON.stringify(row),before);
 assert.equal(inquiryCountryText({title:'Steel doors, Mouila, Gabon'},aliases),'加蓬 / Gabon（客户自述）');
});
test('saved country wins; ambiguous or absent country is not guessed; boundary prevents Indiana matching India',()=>{
 assert.equal(inquiryCountryText({title:'Saudi Arabia',target_country:'Mexico'},aliases,v=>'已登记：'+v),'已登记：Mexico');
 for(const title of ['Indiana locks','Riyadh Company','Saudi Arabia / China','No location'])assert.equal(claimedInquiryCountry({title},aliases),null);
 assert.equal(claimedInquiryCountry({title:'沙特阿拉伯 Saudi Arabia'},aliases).country,'Saudi Arabia');
});

test('already loaded original supplies an explicit location, without deriving country from email or city alone',()=>{
 assert.equal(inquiryCountryText({original_message:'Company: MSB Company\nCountry: Saudi Arabia'},aliases),'沙特阿拉伯 / Saudi Arabia（客户自述）');
 assert.equal(inquiryCountryText({original_message:'From: user@india.com'},aliases),'—');
});
