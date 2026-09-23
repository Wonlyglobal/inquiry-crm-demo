import {boundedBytes} from './bailian.mjs';
export const SOCIAL_URL='https://grogrigybgimvuuunxef.supabase.co/functions/v1/social-summary';
export async function loadSocial(authorization,fetcher=fetch){
 try{const r=await fetcher(SOCIAL_URL,{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('unavailable');const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,128*1024)));if(data.schema_version!=='1.0'||data.site!=='socialwonly.foreverdoodle.com'||!Array.isArray(data.accounts)||!Array.isArray(data.competitors))throw Error('invalid');return data}catch{return {status:'unavailable',limits:'社媒只读来源暂不可用，不能声称已掌握自有或竞品当前表现。'}}
}
