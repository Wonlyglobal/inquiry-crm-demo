import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {ImapFlow} from 'npm:imapflow@1.7.6';
import {simpleParser} from 'npm:mailparser@3.9.20';
import {withReadOnlyGuard} from '../_shared/read-only.ts';
import {processHistoryChunk} from './history.mjs';
const headers={'Access-Control-Allow-Origin':'https://crm.foreverdoodle.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const key=(group,legacy)=>{try{return JSON.parse(Deno.env.get(group)||'{}').default||Deno.env.get(legacy)||''}catch{return Deno.env.get(legacy)||''}};
const userHandler=withReadOnlyGuard(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!=='https://crm.foreverdoodle.com')return json({error:'origin_denied'},403);
 const authorization=request.headers.get('Authorization')||'';
 const userClient=createClient(Deno.env.get('SUPABASE_URL'),key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await userClient.auth.getUser();if(auth.error||!auth.data?.user)return json({error:'authentication_required'},401);
 const actor=await userClient.from('profiles').select('id,role,active,is_test_data,data_environment').eq('id',auth.data.user.id).single();
 if(actor.error||!actor.data?.active||actor.data.is_test_data||(actor.data.data_environment||'production')!=='production'||!['owner','sales_manager','sales'].includes(actor.data.role))return json({error:'scope_denied'},403);
 try{
  const text=await request.text();if(text.length>8192)return json({error:'request_too_large'},413);const input=JSON.parse(text);const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const admin=createClient(Deno.env.get('SUPABASE_URL'),key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  if(input.action==='start'){
   if(!uuid(input.inquiry_id)||!uuid(input.request_id)||input.days!==90)return json({error:'invalid_request'},400);
   const inquiry=await userClient.from('inquiries').select('id,owner_id').eq('id',input.inquiry_id).single();if(inquiry.error||!inquiry.data?.owner_id)return json({error:'inquiry_scope_denied'},403);
   const started=await admin.rpc('start_inquiry_mail_history',{actor_id:actor.data.id,target_id:inquiry.data.id,request_key:input.request_id});
   if(started.error)return json({error:'history_start_unavailable'},409);
   return json({request_id:started.data,days:90});
  }
  if(input.action!=='continue'||!uuid(input.request_id))return json({error:'invalid_request'},400);
  const result=await processHistoryChunk({admin,userClient,actorId:actor.data.id,requestId:input.request_id,ImapFlow,simpleParser});
  return json({ok:true,...result});
 }catch{return json({error:'history_temporarily_unavailable'},503)}
});

// Cron has no user JWT. A server-held worker token can only continue already
// authorized requests, never create one. User requests still call getUser().
Deno.serve(async request=>{
 if(request.method==='POST'&&request.headers.has('x-mail-sync-token')){
  const token=Deno.env.get('MAIL_SYNC_WORKER_TOKEN')||'';
  if(!token||request.headers.get('x-mail-sync-token')!==token)return json({error:'unauthorized'},401);
  try{
   const admin=createClient(Deno.env.get('SUPABASE_URL'),key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   const next=await admin.rpc('next_inquiry_mail_history_request');if(next.error)throw Error('queue_unavailable');
   if(!next.data?.request_id)return json({ok:true,idle:true});
   const result=await processHistoryChunk({admin,userClient:admin,actorId:next.data.actor_id,requestId:next.data.request_id,ImapFlow,simpleParser});
   return json({ok:true,...result});
  }catch{return json({error:'history_worker_unavailable'},503)}
 }
 return userHandler(request);
});
