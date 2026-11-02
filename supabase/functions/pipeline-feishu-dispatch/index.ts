import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {pipelineHandler} from '../_shared/pipeline-feishu-handler.mjs';
Deno.serve(pipelineHandler({env:(key:string)=>Deno.env.get(key),createDb:()=>{
 let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key}catch{}
 return createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});
}}));
