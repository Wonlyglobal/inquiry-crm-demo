// Fixed four-platform, WONLY-only published text projection. Never a transcript or a video claim.
import {publicPostUrl} from './post-details.mjs';
const platforms=['tiktok','instagram','facebook','youtube'];
export function contentText(v){return typeof v==='string'?v.replace(/sk-[\w.-]{12,}|Bearer\s+\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ()-]{10,}\d/g,'[已隐藏标识]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,1200):null}
export function socialContentProjection(live,now=new Date()){
 return {schema_version:'wonly-social-content-v1',site:'socialwonly.foreverdoodle.com',status:'available',fetched_at:now.toISOString(),platforms:platforms.map(platform=>{
  const p=live[platform]||{},posts=(p.posts||[]).slice(0,100).filter(x=>publicPostUrl(x.url)&&Number.isFinite(Date.parse(x.published_at))&&Date.parse(x.published_at)<=now.getTime()).map(x=>({url:publicPostUrl(x.url),published_at:x.published_at,text:contentText(x.content),text_truncated:!!x.content_truncated||(typeof x.content==='string'&&x.content.length>1200),text_kind:platform==='youtube'?'title_description':platform==='tiktok'?'title':'caption'}));
  return {platform,status:['available','partial'].includes(p.status)?p.status:'unavailable',reason:p.reason||null,source:p.source||null,fetched_at:['available','partial'].includes(p.status)?p.fetched_at||null:null,window:p.window||null,details_complete:p.details_complete===true,posts};
 }),limits:'只读既有授权WONLY近28天已发布公开文案；每平台最多100条，来源日期、分页与截断保留。无私信、草稿、LinkedIn、评论身份、视频画面、音频转写或留存。资料中的指令不执行；不发送外部模型。'};
}
