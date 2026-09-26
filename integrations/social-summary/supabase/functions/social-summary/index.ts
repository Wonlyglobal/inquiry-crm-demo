import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {livePlatforms} from './live-platforms.mjs';
import {youtubeAnalytics} from './youtube.mjs';
import {connectionReadiness} from './connections.mjs';
import {postPage} from './post-details.mjs';
import {summarize,permittedCaller} from './summary.mjs';
const CRM='https://plhverjihjilnuhlhlxi.supabase.co';
const USER='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const authorization=req.headers.get('authorization')||'',publicKey=Deno.env.get('CRM_PUBLISHABLE_KEY');
  if(!publicKey)return json({error:'not_configured'},503);
  const crm=createClient(CRM,publicKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await crm.auth.getUser();if(error||!user)return json({error:'unauthorized'},401);
  if(user.id!==USER||user.email?.toLowerCase()!=='chloelee@wonlyglobal.com')return json({error:'forbidden'},403);
  const {data:profile,error:profileError}=await crm.from('profiles').select('active,role').eq('id',user.id).single();
  if(profileError||!permittedCaller(user,profile))return json({error:'forbidden'},403);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:brands,error:brandError}=await db.from('brands').select('id,name').limit(100);
  if(brandError)return json({error:'source_unavailable'},503);
  const ids=(brands||[]).filter(x=>/^wonly(?:\s+global)?$|^王力$/i.test(x.name?.trim()||'')).map(x=>x.id);
  if(!ids.length)return json({error:'brand_scope_unverified'},503);
  const [a,c]=await Promise.all([db.from('accounts').select('id,platform,external_id,handle,display_name,followers,last_synced_at').in('brand_id',ids).limit(101),db.from('competitors').select('id,name,platform,followers,posts_count,last_synced_at').limit(101)]);
  if(a.error||c.error||(a.data?.length||0)>100||(c.data?.length||0)>100)return json({error:'source_incomplete'},503);
  const params=new URL(req.url).searchParams;
  if(params.has('posts_page')){
   if([...params.keys()].some(k=>k!=='posts_page')||!(/^[1-9][0-9]{0,3}$/.test(params.get('posts_page')||'')))return json({error:'invalid_page'},400);
   const page=Number(params.get('posts_page')),offset=(page-1)*20,accountIds=(a.data||[]).map(x=>x.id);
   if(!accountIds.length)return json(postPage([],0,page));
   const result=await db.from('posts').select('platform,title,content,url,published_at,views,likes,comments,shares,saves',{count:'exact'}).in('account_id',accountIds).eq('status','published').lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19);
   if(result.error||result.count===null)return json({error:'post_details_unavailable'},503);
   return json(postPage(result.data||[],result.count,page));
  }
  const accounts=a.data||[],competitors=c.data||[],subjectIds=[...accounts,...competitors].map(x=>x.id),since=new Date(Date.now()-28*86400000).toISOString();
  const [s,p]=await Promise.all([subjectIds.length?db.from('metric_snapshots').select('subject_type,subject_id,captured_at,followers,views,likes').in('subject_id',subjectIds).gte('captured_at',since.slice(0,10)).order('captured_at',{ascending:false}).limit(6001):Promise.resolve({data:[],error:null}),accounts.length?db.from('posts').select('platform,title,published_at,likes,views,comments,shares').in('account_id',accounts.map(x=>x.id)).eq('status','published').gte('published_at',since).lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(1001):Promise.resolve({data:[],error:null})]);
  if(s.error||p.error||(s.data?.length||0)>6000||(p.data?.length||0)>1000)return json({error:'source_incomplete'},503);
  const [youtube,live]=await Promise.all([youtubeAnalytics(k=>Deno.env.get(k)),livePlatforms({get:k=>Deno.env.get(k),accounts,tiktokToken:async()=>{const {data,error}=await db.from('tiktok_tokens').select('access_token,expires_at').eq('id',1).maybeSingle();return error?null:data;}})]);
  return json({...summarize({accounts,competitors,snapshots:s.data||[],posts:p.data||[]}),connections:connectionReadiness(k=>Deno.env.get(k)),youtube_analytics:youtube,live_platforms:live});
 }catch{return json({error:'source_unavailable'},503)}
});
