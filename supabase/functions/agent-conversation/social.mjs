import {boundedBytes} from './bailian.mjs';
export const SOCIAL_URL='https://grogrigybgimvuuunxef.supabase.co/functions/v1/social-summary';
export async function loadSocial(authorization,fetcher=fetch){
 try{const r=await fetcher(SOCIAL_URL,{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('unavailable');const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,128*1024)));if(data.schema_version!=='1.0'||data.site!=='socialwonly.foreverdoodle.com'||!Array.isArray(data.accounts)||!Array.isArray(data.competitors))throw Error('invalid');return data}catch{return {status:'unavailable',limits:'社媒只读来源暂不可用，不能声称已掌握自有或竞品当前表现。'}}
}

export function requestedPostPage(question=''){const m=question.match(/(?:社媒|帖子|内容).*?第\s*(\d{1,4})\s*页/);return m?Math.max(1,Number(m[1])):1;}
export async function loadSocialPosts(authorization,page=1,fetcher=fetch){
 try{const r=await fetcher(SOCIAL_URL+'?posts_page='+page,{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('unavailable');const data=JSON.parse(new TextDecoder().decode(await boundedBytes(r,512*1024)));if(data.status!=='available'||!Array.isArray(data.posts)||data.posts.length>20||data.page!==page||!Number.isInteger(data.total_records))throw Error('invalid');return data}catch{return {status:'unavailable',limits:'逐条内容接口未接通，不得将汇总主题当作完整帖子或后台数据。'}}
}
