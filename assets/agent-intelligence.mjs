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
 const grace=[`市场观察顺序（按本周期新增询盘量）：${rank(created,'target_country')}`,`产品观察顺序：${rank(created,'product_category')}`,`渠道：${(c.sources||[]).map(x=>`${x.name} ${x.count}条`).join('；')||'暂无'}`,`阶段判断：${created.length?'已有可见获客活动；仍需目标、历史成交和渠道成本共同确认拓展阶段。':'当前周期样本不足，暂不能判断海外拓展阶段。'}不能把询盘量当作市场份额或正式战略优先级。`];
 const brian=[`进行中有效商机 ${(c.active||[]).length}条；首响超时 ${(c.overdue||[]).length}条；规则识别的风险/逾期 ${(c.risky||[]).length}条。`,`行动顺序：核实超时响应 → 补齐下一步及日期 → 推进已报价商机。价格、认证、交期和客户意向必须有原始证据，不自动对客发送。`];
 const jay=[`Grace汇报：本周期新增 ${created.length}条，渠道 ${(c.sources||[]).length}类；市场分布见下方。`,`Brian汇报：成交 ${(c.won||[]).length}单；首响超时 ${(c.overdue||[]).length}条；风险/逾期 ${(c.risky||[]).length}条。`,`决策缺口：尚未核实的年度战略、利润、预算和认证不可由公开新闻填补。当前汇总为页面即时计算，不是后台已留档的经营周报。`];
 const findings=feed?.findings||[];
 const external=feed?[`${feedAge(feed,now)}；核验时间 ${feed.checked_at}`,feed.coverage,...findings.slice(0,8).flatMap(f=>[`${f.published_at}｜${f.brand}｜${f.title}`,`事实：${f.fact}`,`判断：${f.implication}`,`来源：${f.url}`])]:['公开情报尚未加载；不能据此判断市场没有变化。'];
 const sections=persona==='Grace'?grace:persona==='Brian'?brian:[...jay,...grace,...brian];
 return [`${persona} · 自动信息简报`,...basis,'',...sections,'','公开市场与竞品',...external].join('\n');
}
export function mountIntelligence(host,{getContext,isAllowed}){
 const section=document.createElement('section');section.className='world-intelligence';section.setAttribute('aria-label','智能体信息简报');
 const title=document.createElement('h2');title.textContent='自动信息简报';
 const note=document.createElement('p');note.textContent='公开信息每日计划更新；重大变化提醒，周一由 Jay 汇总。调度由本机 Codex 执行，离线时可能延迟；CRM 内部数据按页面已加载范围即时分析。';
 const refresh=document.createElement('button');refresh.textContent='刷新信息';refresh.type='button';
 const status=document.createElement('p');status.setAttribute('role','status');
 const body=document.createElement('pre'),links=document.createElement('div');links.className='world-source-links';
 section.append(title,note,refresh,status,body,links);host.append(section);
 let feed=null,persona='Jay',busy=false;
 function render(){if(!isAllowed()){section.hidden=true;return}section.hidden=false;body.textContent=buildBrief(persona,getContext(),feed);links.replaceChildren();for(const s of feed?.sources||[]){const a=document.createElement('a');a.href=safeSource(s.url);a.textContent=`${s.name} · ${s.status==='checked'?'已核验':s.status==='partial'?'部分可读':'获取失败'}`;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}for(const f of feed?.findings||[]){const a=document.createElement('a');a.href=safeSource(f.url);a.textContent=f.title+' · 原文';a.target='_blank';a.rel='noopener noreferrer';links.append(a)}}
 async function refreshFeed(){if(busy||!isAllowed())return;busy=true;refresh.disabled=true;status.textContent='正在读取最近公开情报…';try{const r=await fetch('./data/agent-intelligence.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);feed=validateFeed(await r.json());status.textContent=feedAge(feed)}catch{status.textContent='公开情报读取失败；保留上次结果与原核验时间，不表示市场没有变化。'}finally{busy=false;refresh.disabled=false;render()}}
 refresh.onclick=refreshFeed;render();refreshFeed();
 return {select(name){persona=name;render()},answer(question){if(!isAllowed())return null;if(!/市场|竞品|海外|情报|简报|汇报|周报|增长|产品|策略|战略|dormakaba|Hörmann|ASSA ABLOY/.test(question))return null;return buildBrief(persona,getContext(question),feed)},refresh:refreshFeed};
}
