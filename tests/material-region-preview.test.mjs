import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const file of ['index.html','grace.html']){
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const expression=source.match(/fetch\(('https:\/\/plhverjihjilnuhlhlxi\.supabase\.co\/functions\/v1\/'[^\n]+?),\{method:'POST',headers,body:body instanceof FormData/)[1];
 const resolve=new Function('location','body','URL','return '+expression);
 test(file+' regional routing preserves endpoint selection and ignores caller region injection',()=>{
  const url=q=>({href:'https://crm.foreverdoodle.com/grace.html'+q});
  assert.equal(resolve(url(''),{action:'chat',question:'材料'},URL),'https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/agent-conversation?forceFunctionRegion=ap-southeast-1');
  assert.equal(resolve(url('?material-region-preview=1'),{action:'chat',question:'材料'},URL),'https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/agent-conversation?forceFunctionRegion=ap-southeast-1');
  assert.equal(resolve(url('?material-region-preview=us-east-1'),{action:'chat'},URL),'https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/agent-conversation?forceFunctionRegion=ap-southeast-1');
  assert.equal(resolve(url('?video-preview=1&material-region-preview=1'),{action:'chat',question:'视频'},URL),'https://plhverjihjilnuhlhlxi.supabase.co/functions/v1/agent-video-preview?forceFunctionRegion=ap-southeast-1');
 });
}
