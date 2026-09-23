import {answerQuestion,classifyQuestion,knowledgeStatus} from './agent-answers.mjs?v=20260923-1';
// Public-source intelligence only. CRM context remains in this authenticated browser.
export function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
export function validateFeed(feed){
 if(feed?.schema_version!==1||!Number.isFinite(Date.parse(feed.checked_at))||!Array.isArray(feed.sources)||!Array.isArray(feed.findings))throw new Error('情报格式不正确');
 if(feed.sources.length>50||feed.findings.length>100)throw new Error('情报超过容量限制');
 for(const s of feed.sources)if(!safeSource(s.url)||!['checked','partial','failed'].includes(s.status)||typeof s.name!=='string')throw new Error('来源缺少核验状态');
 const ids=new Set();
 for(const f of feed.findings){
  if(!f.id||ids.has(f.id)||!safeSource(f.url)||!Number.isFinite(Date.parse(f.published_at))||!Number.isFinite(Date.parse(f.observed_at))||!['watch','important'].includes(f.importance))throw new Error('动态缺少来源、日期或唯一标识');
  ids.add(f.id);for(const key of ['title','fact','implication','brand','category'])if(typeof f[key]!=='string'||f[key].length>1600)throw new Error('动态字段不正确');
 }
 return feed;
}
export function feedAge(feed,now=Date.now()){
 const checked=Date.parse(feed?.checked_at),age=now-checked;
 if(!Number.isFinite(checked)||age< -300000)return '时间异常，待核验';
 return age>48*3600000?'公开情报已超过48小时未更新':'公开情报已核验';
}
const rank=(rows,key)=>{const counts=new Map();for(const row of rows){const label=String(row[key]||'未填写').trim();counts.set(label,(counts.get(label)||0)+1)}return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,n])=>`${label} ${n}条`).join('；')||'暂无可用记录'};
export function buildBrief(persona,context,feed,now=Date.now()){
 const c=context||{},created=(c.created||[]).filter(x=>!x.excluded_from_dashboard),period=c.start&&c.end?`${c.start.toLocaleDateString('zh-CN')}—${c.end.toLocaleDateString('zh-CN')}`:'统计周期未加载';
 const basis=[`CRM范围：${c.scope||'当前账号可见范围'}；${period}`,`当前新增样本：${created.length}条。数据来自当前页面已加载的权限内记录，不代表完整海外市场。`];
 const grace=[`市场观察顺序（按本周期新增询盘量）：${rank(created,'target_country')}`,`产品观察顺序：${rank(created.map(x=>({...x,product_category:/distributor|dealer|经销商|代理商/i.test(x.product_category||'')?'待核验（客户类型混入产品字段）':x.product_category})),'product_category')}`,`渠道：${(c.sources||[]).map(x=>`${x.name} ${x.count}条`).join('；')||'暂无'}`,`阶段判断：${created.length?'已有可见获客活动；仍需目标、历史成交和渠道成本共同确认拓展阶段。':'当前周期样本不足，暂不能判断海外拓展阶段。'}不能把询盘量当作市场份额或正式战略优先级。`];
 const brian=[`进行中有效商机 ${(c.active||[]).length}条；首响超时 ${(c.overdue||[]).length}条；规则识别的风险/逾期 ${(c.risky||[]).length}条。`,`行动顺序：核实超时响应 → 补齐下一步及日期 → 推进已报价商机。价格、认证、交期和客户意向必须有原始证据，不自动对客发送。`];
 const jay=[`Grace汇报：本周期新增 ${created.length}条，渠道 ${(c.sources||[]).length}类；市场分布见下方。`,`Brian汇报：成交 ${(c.won||[]).length}单；首响超时 ${(c.overdue||[]).length}条；风险/逾期 ${(c.risky||[]).length}条。`,`决策缺口：尚未核实的年度战略、利润、预算和认证不可由公开新闻填补。当前汇总为页面即时计算，不是后台已留档的经营周报。`];
 const findings=feed?.findings||[];
 const external=feed?[`${feedAge(feed,now)}；核验时间 ${feed.checked_at}`,feed.coverage,...(feed.sources||[]).map(s=>`${s.name}（${s.status==='checked'?'已核验':s.status==='partial'?'部分可读':'获取失败'}）：${s.note||'说明待补'} 来源：${s.url}`),...findings.slice(0,8).flatMap(f=>[`${f.published_at}｜${f.brand}｜${f.title}`,`事实：${f.fact}`,`判断：${f.implication}`,`来源：${f.url}`])]:['公开情报尚未加载；不能据此判断市场没有变化。'];
 const sections=persona==='Grace'?grace:persona==='Brian'?brian:[...jay,...grace,...brian];
 return [`${persona} · 自动信息简报`,...basis,'',...sections,'','公开市场与竞品',...external].join('\n');
}
export function mountIntelligence(host,{getContext,isAllowed,onQuestion}){
 const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n};
 const section=el('section',null,'world-intelligence');section.setAttribute('aria-label','智能体信息简报');
 const title=el('h2','智能体知识与分析'),note=el('p','根据已核验资料和当前权限内数据回答，事实、建议和缺口分开呈现。'),toolbar=el('div',null,'intelligence-toolbar');
 const refresh=el('button','重新读取公开情报');refresh.type='button';
 const period=el('select');period.setAttribute('aria-label','简报统计周期');for(const [value,label] of [['','当前看板周期'],['本周','本周'],['上周','上周']]){const o=el('option',label);o.value=value;period.append(o)}
 const status=el('p');status.setAttribute('role','status');
 const metrics=el('div',null,'intelligence-metrics'),suggestions=el('div',null,'intelligence-questions'),body=el('pre'),details=el('details'),summary=el('summary','查看已知资料与信息缺口'),links=el('div',null,'world-source-links');
 details.append(summary,links);toolbar.append(period,refresh);section.append(title,note,toolbar,status,metrics,suggestions,body,details);host.append(section);
 let feed=null,persona='Jay',busy=false,readError=false;const memories=new Map();
 const questions={Grace:['目前海外市场处于什么阶段？','本月渠道质量如何？','dormakaba有什么动态？','我们有哪些产品资料？'],Brian:['现在优先跟进什么？','报价前需要确认什么？','如何推进销售商机？','哪些承诺还不能给客户？'],Jay:['汇总经营优先事项','上周经营汇报','我们与Hörmann怎么比较？','目前缺哪些决策信息？']};
 function context(q=''){return getContext(/上周|上星期|本周|这周|本月|今天|今日|昨天|昨日|近\s*\d+\s*天/.test(q)?q:[period.value,q].filter(Boolean).join(' '))}
 function render(){
  if(!isAllowed()){section.hidden=true;body.textContent='';return}section.hidden=false;
  title.textContent=persona+' · 知识与分析';const c=context(),k=knowledgeStatus(c,feed);
  status.textContent=readError?'公开情报读取失败；保留原版本，未表示已完成新研究。':feed?feedAge(feed)+` · 完整可读 ${feed.sources.filter(s=>s.status==='checked').length}/${feed.sources.length} 个来源`:'公开情报尚未加载';
  metrics.replaceChildren();for(const text of [`当前样本 ${c.ready===false?'未就绪':k.sample+'条'}`,`产品待核验 ${c.ready===false?'未知':k.missingProducts+'条'}`,`公开来源 ${k.sourceCount}个`])metrics.append(el('span',text));
  const defaultQuestion=persona==='Grace'?'目前海外市场处于什么阶段？':persona==='Brian'?'现在优先跟进什么？':'汇总经营优先事项';
  body.textContent=answerQuestion({question:defaultQuestion,persona,context:c,feed}).text;
  suggestions.replaceChildren();for(const question of questions[persona]){const b=el('button',question);b.type='button';b.onclick=()=>{if(isAllowed())onQuestion?.(persona,question)};suggestions.append(b)}
  links.replaceChildren();links.append(el('p','知识缺口：正式海外战略、目标预算、型号规格、有效认证、价格和交期，仍需可核验的业务资料。'));
  for(const source of feed?.sources||[]){const block=el('div',null,'intelligence-source'),a=el('a',source.name+' · '+({checked:'已核验',partial:'部分可读',failed:'获取失败'}[source.status]));a.href=safeSource(source.url);a.target='_blank';a.rel='noopener noreferrer';block.append(a,el('p',source.note||'说明待补'));links.append(block)}
  links.append(el('p','公开资料计划每日9点研究、周一汇总，由本机Codex执行；离线可能延迟。重新读取仅获取已发布资料，不触发全网实时搜索。'));
 }
 async function refreshFeed(){if(busy||!isAllowed())return;busy=true;refresh.disabled=true;status.textContent='正在读取已发布资料…';try{const r=await fetch('./data/agent-intelligence.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);feed=validateFeed(await r.json());readError=false}catch{readError=true}finally{busy=false;refresh.disabled=false;render()}}
 period.onchange=render;refresh.onclick=refreshFeed;render();refreshFeed();
 return {select(name){if(!questions[name])return;persona=name;render()},clear(name=persona){memories.delete(name)},answer(question){
  if(!isAllowed())return null;
  if(/销售额|成交额|排名|排行|询盘编号|列出编号|进行中询盘/.test(question))return null;
  const previous=memories.get(persona),intent=classifyQuestion(question,persona,previous?.intent),effectiveQuestion=intent.followup?previous.question:question;
  const result=answerQuestion({question,persona,context:context(effectiveQuestion),feed,previous:previous?.intent});
  memories.set(persona,{intent:result.intent,question:effectiveQuestion});return result.text;
 },refresh:refreshFeed,refreshContext:render};
}
