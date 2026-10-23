// Private company reports: deterministic retrieval only. Never add these documents to model memory.
import {formatPrivateSection} from './private-report-format.mjs';
export const PRIVATE_SCHEMA='grace-private-intelligence-v1';
export function privateIntelligenceIntent(q=''){
 const text=typeof q==='string'?q.normalize('NFKC'):'';
 // Explicit saved-source questions stay in the private snapshot even when they name
 // individual counters instead of saying "指标", or put the platform first.
 const savedSocial=/(?:已同步|已保存|私有)/.test(text)&&/(?:TikTok|Instagram|Facebook|YouTube|社媒)/i.test(text)&&/(?:指标|帖子|逐帖|观看|播放|点击|点赞|评论|分享|收藏|触达|曝光|来源日期|缺口)/.test(text);
 return savedSocial||/周报|日报|私有知识|私有证据|新增证据|内部简报|同步的报告|同步.*证据/i.test(text);
}
export function privateIntelligenceQuery(q='',now=Date.now()){
 q=typeof q==='string'?q.normalize('NFKC'):'';
 const id=q.match(/\b(?:weekly|daily|evidence|tiktok|instagram|facebook|youtube)-20\d{2}-\d{2}-\d{2}(?:-20\d{2}-\d{2}-\d{2})?\b/)?.[0]||null;
 const kind=id?id.split('-')[0]:/tiktok/i.test(q)?'tiktok':/instagram/i.test(q)?'instagram':/facebook/i.test(q)?'facebook':/youtube/i.test(q)?'youtube':/周报/.test(q)?'weekly':/日报/.test(q)?'daily':/证据/.test(q)?'evidence':null;
 const dates=q.match(/20\d{2}-\d{2}-\d{2}/g)||[];
 let from=dates[0]||null,to=dates[1]||null;
 if(!from&&/上周|本周|这周/.test(q)){
  const d=new Date(now+8*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)-(/上周/.test(q)?7:0));
  from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);to=d.toISOString().slice(0,10);
 }
 if(!from&&/今天|今日|昨天|昨日/.test(q)){const d=new Date(now+8*3600000);if(/昨天|昨日/.test(q))d.setUTCDate(d.getUTCDate()-1);from=d.toISOString().slice(0,10);to=from}
 if(from&&!to&&kind!=='weekly')to=from;
 // A bare week-start date does not authorize selecting a later week's report.
 if(from&&!to&&kind==='weekly'){const d=new Date(from+'T00:00:00Z');if(Number.isFinite(d.getTime())){d.setUTCDate(d.getUTCDate()+6);to=d.toISOString().slice(0,10)}}
 return {p_kind:kind,p_from:from,p_to:to,p_key:id,p_limit:kind?1:5};
}
export function privateIntelligenceAnswer(result,question=''){
 const rows=Array.isArray(result?.documents)?result.documents:[];
 if(!rows.length)return '私有知识库没有查到对应日期的已同步报告或证据。这不表示该期间没有业务或市场变化；请先导入对应报告。';
 const out=['以下来自公司私有知识库；报告与证据未发送给外部模型。'];
 for(const row of rows){const d=row.document;
  out.push(`\n${d.title}`,`报告期间：${d.period.from}—${d.period.to}；来源生成：${d.generated_at}`,'状态：自动汇总，未经人工事实核验；导入时间不等于源数据更新时间。');
  const follow=question.split('，').at(-1)||'',focused=/查看私有知识 (?:weekly|daily|evidence|tiktok|instagram|facebook|youtube)-/.test(question);
  const filter=focused&&/风险|下一步|优先|建议动作/.test(follow)?/风险|动作|口径|限制|边界/:focused&&/数据日期/.test(follow)?/日期|口径|限制|边界/:null;
  const selected=filter?d.sections.filter(s=>filter.test(s.title)):d.sections;
  for(const s of selected.length?selected:d.sections)out.push(`\n${s.title}\n${formatPrivateSection(s.body)}`);
  const sources=d.kind==='evidence'||/证据|来源|缺口/.test(question);
  if(sources)for(const e of d.evidence)out.push(`\n证据 ${e.id}｜${e.title}\n事实/状态：${e.fact}\n推测：${e.inference||'无新增推测'}\n来源：${e.url}\n来源日期：${e.published_at||'未知'}；发现/检查：${e.observed_at}\n缺口：${e.gap||'仍需结合原来源核对'}`);
  else out.push(`\n附有 ${d.evidence.length} 项来源核验记录；可点“查看来源与缺口”展开，失败或部分可读不表示没有变化。`);
  out.push(`\n知识编号：${row.id}；版本校验：${row.digest}`);
 }
 return out.join('\n');
}
export async function readPrivateIntelligence(client,q,now=Date.now()){
 const {data,error}=await client.rpc('read_agent_private_intelligence',privateIntelligenceQuery(q,now));
 if(error)throw Error('私有知识读取未完成，请稍后重试');
 return {answer:privateIntelligenceAnswer(data,q),receipts:(data?.documents||[]).map(r=>({id:r.id,digest:r.digest,key:r.document.key,imported_at:r.imported_at}))};
}
