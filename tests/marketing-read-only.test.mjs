import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {withReadOnlyGuard} from '../supabase/functions/_shared/read-only.ts';

test('edge guard checks verified metadata before side effects and fails closed', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name]}};
  let calls=0;
  const handler=withReadOnlyGuard(async()=>{calls++;return new Response('ok')});
  const request=()=>new Request('https://example.test/send',{method:'POST',headers:{Authorization:'Bearer user'}});
  try {
    globalThis.fetch=async()=>Response.json({role:'crm_marketing_readonly',app_metadata:{}});
    assert.equal((await handler(request())).status,403);assert.equal(calls,0);
    globalThis.fetch=async()=>Response.json({role:'authenticated',app_metadata:{crm_read_only:true}});
    assert.equal((await handler(request())).status,403);assert.equal(calls,0);
    globalThis.fetch=async()=>Response.json({role:'authenticated',app_metadata:{},user_metadata:{crm_read_only:true}});
    assert.equal((await handler(request())).status,200);assert.equal(calls,1);
    globalThis.fetch=async()=>new Response('invalid',{status:401});
    assert.equal((await handler(request())).status,401);assert.equal(calls,1);
    globalThis.fetch=async()=>{throw new Error('offline')};
    assert.equal((await handler(request())).status,503);assert.equal(calls,1);
    assert.equal((await handler(new Request('https://example.test',{headers:{Authorization:'Bearer service'}}))).status,200);
    assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS'}))).status,200);
  } finally {globalThis.fetch=originalFetch;delete globalThis.Deno;}
});

test('browser read-only boundary retains viewing and password change but rejects mutations',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('      function readOnlyRequestAllowed'),html.indexOf('      function readOnlyMutationControl'));
  const context=vm.createContext({URL,location:{href:'https://crm.example.test'}});
  vm.runInContext(source,context);
  const allowed=(path,method)=>context.readOnlyRequestAllowed('https://api.example.test'+path,method);
  assert.equal(allowed('/rest/v1/inquiries?select=*','GET'),true);
  assert.equal(allowed('/rest/v1/inquiries','PATCH'),false);
  assert.equal(allowed('/rest/v1/rpc/triage_email_intakes','POST'),false);
  assert.equal(allowed('/graphql/v1','POST'),false);
  assert.equal(allowed('/storage/v1/object/avatars/test','POST'),false);
  assert.equal(allowed('/functions/v1/mailbox-send','POST'),false);
  assert.equal(allowed('/functions/v1/mailbox-send','GET'),false);
  assert.equal(allowed('/rest/v1/rpc/get_shared_inquiry_mailbox_status','POST'),true);
  assert.equal(allowed('/rest/v1/rpc/finish_initial_password_change','POST'),true);
  assert.equal(allowed('/rest/v1/rpc/finish_readonly_initial_password_change','POST'),true);
  assert.equal(allowed('/storage/v1/object/sign/customer-documents/test','POST'),true);
  assert.equal(allowed('/storage/v1/object/upload/sign/customer-documents/test','POST'),false);
  assert.equal(allowed('/auth/v1/user','PUT'),true);
});
