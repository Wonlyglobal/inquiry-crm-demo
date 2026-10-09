import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function inferExternalResearchDomain('),html.indexOf('      function persistAutonomousResearch('));
const context=vm.createContext({});vm.runInContext(source,context);
const infer=value=>context.inferExternalResearchDomain(value);
test('internal test sender and its subdomains do not identify the buyer',()=>{
  for(const input of ['chloelee@wonlyglobal.com','WONLYGLOBAL.COM','https://www.wonlyglobal.com/','mail@sub.wonlyglobal.com'])assert.equal(infer(input),'');
});
test('external customer domains remain available and lookalikes are not internal',()=>{
  assert.equal(infer('buyer@customer.example'),'customer.example');
  assert.equal(infer('https://www.customer.example/path'),'customer.example');
  assert.equal(infer('buyer@notwonlyglobal.com'),'notwonlyglobal.com');
  assert.equal(infer('buyer@wonlyglobal.com.example'),'wonlyglobal.com.example');
  assert.equal(infer(''),'');
});
