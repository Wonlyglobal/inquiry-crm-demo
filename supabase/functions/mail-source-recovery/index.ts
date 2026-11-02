import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow@1.7.6";
import { simpleParser } from "npm:mailparser@3.9.20";
import { recoverNextMailbox } from "./recovery.mjs";
const token = Deno.env.get("MAIL_SYNC_WORKER_TOKEN") || "";
const json = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async request => {
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 if(!token||request.headers.get("x-mail-sync-token")!==token)return json({error:"unauthorized"},401);
 try {
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  return json(await recoverNextMailbox({db,createImap:options=>new ImapFlow(options),parseMail:simpleParser,deadline:Date.now()+95_000}));
 }catch(error){console.error(`mail source recovery failed: ${error instanceof Error?error.name:'Error'}`);return json({ok:false,error:"recovery_failed"},500)}
});
