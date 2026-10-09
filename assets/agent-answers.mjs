// Evidence-based answers, executed only in the authenticated browser.
// No model call, persistence, business write or automatic external action.
const cleanRows=rows=>(rows||[]).filter(x=>!x.excluded_from_dashboard);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const aliases={dormakaba:['dormakaba','多玛凯拔'],Hörmann:['hormann','霍曼'], 'ASSA ABLOY':['assa abloy','assaabloy','亚萨合莱'],'Al Kuhaimi':['al kuhaimi','kuhaimi'],Asturmex:['asturmex'],WONLY:['wonly','王力','我们']};
const percent=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'暂无足够分母';
export function lastWeekRange(now=new Date()){
 const china=new Date(now.getTime()+8*3600000),day=(china.getUTCDay()+6)%7;
 const monday=Date.UTC(china.getUTCFullYear(),china.getUTCMonth(),china.getUTCDate()-day)-8*3600000;
 return {type:'last-week',start:new Date(monday-7*86400000),end:new Date(monday-1),previousStart:new Date(monday-14*86400000),previousEnd:new Date(monday-7*86400000-1)};
}
export function distribution(rows,key){
 const values=new Map();let missing=0;
 for(const row of cleanRows(rows)){
  let value=String(row[key]||'').trim();
  if(!value||key==='product_category'&&/distributor|dealer|经销商|代理商/i.test(value)){missing++;continue}
  if(key==='target_country'){
   const n=norm(value);if(/mexico|mexique|墨西哥/.test(n))value='墨西哥 / Mexico';
   else if(/saudi|沙特/.test(n))value='沙特阿拉伯 / Saudi Arabia';
   else if(/brazil|brasil|巴西/.test(n))value='巴西 / Brazil';
  }
  values.set(value,(values.get(value)||0)+1);
 }
 return {items:[...values].sort((a,b)=>b[1]-a[1]),missing};
}
export function knowledgeStatus(context,feed){
 const rows=cleanRows(context?.created),products=distribution(rows,'product_category'),countries=distribution(rows,'target_country');
 return {sample:rows.length,missingProducts:products.missing,missingCountries:countries.missing,sourceCount:feed?.sources?.length||0,findings:feed?.findings?.length||0};
}
export function classifyQuestion(question,persona,previous=null){
 const q=norm(question);
 const brands=Object.entries(aliases).filter(([,words])=>words.some(w=>q.includes(norm(w)))).map(([key])=>key);
 if(/^(为什么|然后呢|怎么办|继续|详细一点|有什么依据|怎么做)[？?。！!\s]*$/.test(question.trim())&&previous)return {...previous,followup:true};
 if(previous?.topic==='market'&&/^(工程项目|经销商|先做工程|先做经销商)[。！!\s]*$/.test(question.trim()))return {...previous,followup:true,focus:/工程/.test(question)?'project':'dealer'};
 let topic='unknown';
 if(/自动.*(发送|报价|定价|分配|删除)|绕过|忽略.{0,5}(规则|权限)|密钥|密码|token/i.test(q))topic='boundary';
 else if(/报价|价格|多少钱|折扣|便宜|交期|认证|证书|承诺|ul\b|ce\b|付款条件/.test(q))topic='commercial';
 else if(/比较|对比|区别|优势|劣势/.test(q)&&brands.length)topic='compare';
 else if(/竞品|竞争对手|动态|新品|新闻/.test(q)||brands.some(b=>b!=='WONLY'))topic='competitor';
 else if(/产品|卖什么|做什么门|供应什么/.test(q))topic='product';
 else if(/渠道|有效率|roi|投放|广告|预算/.test(q))topic='channel';
 else if(/海外|国家|市场|阶段|拓展/.test(q))topic='market';
 else if(/周报|汇报|简报|经营|决策|统筹|目标|业绩/.test(q))topic='management';
 else if(/销售|跟进|客户|商机|转化|漏斗|超时|风险|下一步/.test(q))topic='sales';
 else if(/你好|hello|你是谁|能做什么|知道什么|知识/.test(q))topic='capability';
 else if(/建议|优先|今天做什么|怎么做/.test(q))topic=persona==='Grace'?'channel':persona==='Brian'?'sales':'management';
 return {topic,brands,periodRequested:/上周|本周|这周|本月/.test(question)};
}
function namedSources(feed,brands){return (feed?.sources||[]).filter(s=>!brands.length||brands.some(b=>(aliases[b]||[b]).some(a=>norm(s.name+' '+s.url).includes(norm(a)))))}
function periodText(c){return c.start&&c.end?`${c.start.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}—${c.end.toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}`:'未加载'}
const list=items=>items.slice(0,5).map(([name,n])=>`${name} ${n}条`).join('；')||'暂无有效分类';
export function answerQuestion({question,persona='Jay',context={},feed=null,previous=null,now=Date.now()}){
 const intent=classifyQuestion(question,persona,previous),c=context,rows=cleanRows(c.created),active=cleanRows(c.active),won=cleanRows(c.won),overdue=cleanRows(c.overdue),risky=cleanRows(c.risky);
 if(c.ready===false&&['market','channel','sales','management'].includes(intent.topic))return {intent,text:`${persona}｜CRM数据尚未成功加载，当前空值不代表业务为零。请先刷新经营看板，再继续分析。`};
 let conclusion='',facts=[],advice=[],gap='',followup='';
 const countries=distribution(rows,'target_country'),products=distribution(rows,'product_category');
 switch(intent.topic){
 case 'market':
  conclusion=rows.length?'当前可确认有海外获客活动；还不能据此确定公司处于全面扩张还是市场验证阶段。':'当前周期没有可用新增样本，不能判断海外阶段。';
  facts=[`新增样本 ${rows.length}条；国家分布：${list(countries.items)}。`,`国家待补 ${countries.missing}条；产品待核验 ${products.missing}条。`];
  advice=['把国家分布作为研究顺序，结合有效率、报价推进和成交验证机会；少量询盘不代表市场份额。'];
  gap='本回答尚未取得可核验的完整海外战略、各国目标与投入计划。';followup='现阶段更优先发展经销商，还是获取工程项目？';break;
 case 'product':{
  conclusion='已收录的WONLY公开定位包括安全门与智能锁；具体型号和供货能力需要目录或已批准规格确认。';
  facts=[`CRM有效产品分类：${list(products.items)}；缺失或混入客户身份 ${products.missing}条。`,...namedSources(feed,['WONLY']).map(s=>`${s.note}\n来源：${s.url}`)];
  advice=['先区分应用场景、门体/门框/五金配置、尺寸和目标市场，再核对具体产品资料。'];
  gap='缺少已核实的型号目录、规格版本与适用认证；经销商身份不算产品需求。';followup='你要了解哪一种门或哪类智能锁？';break;}
 case 'commercial':
  conclusion='当前资料不足以给出可靠价格、折扣、交期或具体认证承诺。';
  facts=['现有公开情报不包含经批准的内部价格表、生产排期或型号级认证证据。'];
  advice=['报价前核实型号、尺寸、数量、目的国、配置和贸易条款；认证需核对证书覆盖型号、标准、有效期和项目要求。','可整理核实清单，最终报价及承诺由授权人员确认。'];
  gap='不能从竞品宣传或一般产品名称推断王力具备同样认证和价格。';followup='请先给出要核实的产品型号和目标国家。';break;
 case 'channel':{
  const assessed=rows.filter(x=>['valid','invalid'].includes(x.validity)),valid=assessed.filter(x=>x.validity==='valid');
  const quote=rows.filter(x=>x.validity==='valid'&&['quoted','sample_sent','negotiating','won'].includes(x.status));
  conclusion=assessed.length<10?'已核验样本较少，暂不据此建议大幅增减预算。':'先比较渠道质量与后续推进，再决定是否调整投入。';
  facts=[`新增 ${rows.length}条；完成人工有效性核验 ${assessed.length}条，其中有效 ${valid.length}条，有效率 ${percent(valid.length,assessed.length)}。`,`本期新增有效询盘进入报价及后续阶段 ${quote.length}条，占本期新增有效询盘 ${percent(quote.length,valid.length)}。`,`渠道量：${(c.sources||[]).map(s=>`${s.name} ${s.count}条`).join('；')||'暂无'}。`];
  advice=['逐渠道核对有效性、报价推进和归因；补齐同期成本后再计算ROI。','样本不足10条仅是本简报的谨慎提示，不是公司批准的预算阈值。'];
  gap='尚未取得可核验的渠道成本与归因成交额，不能计算ROI或声称某渠道盈利。';followup='你想先看哪个渠道的质量问题？';break;}
 case 'sales':
  conclusion=overdue.length?`先核实 ${overdue.length}条首响超时，再安排后续推进。`:risky.length?`优先核实 ${risky.length}条规则识别的风险或逾期商机。`:'当前未发现首响超时提示，建议检查活跃商机是否具备明确下一步。';
  facts=[`当前有效进行中商机 ${active.length}条；统计范围内首响超时 ${overdue.length}条；规则风险/逾期 ${risky.length}条。`];
  advice=['首响：确认是否已经线下联系，避免重复触达。','需求确认：核实用途、规格、数量、决策流程和时间。','报价后：确认技术/价格/交期异议与下次沟通时间，记录下一步。'];
  gap='汇总没有客户完整背景，不能判断具体客户真实意向；风险提示不代表必然丢单。';followup='你希望先处理首次响应，还是报价后的推进？';break;
 case 'management':
  conclusion=`先处理可验证的销售响应与数据缺口，再形成投入决策。`;
  facts=[`Grace：本周期新增 ${rows.length}条，渠道 ${(c.sources||[]).length}类；有效产品分类缺口 ${products.missing}条。`,`Brian：本周期成交 ${won.length}单；首响超时 ${overdue.length}条；当前规则风险/逾期 ${risky.length}条。`];
  advice=['优先事项：核实超时 → 补齐国家/产品/下一步 → 验证渠道质量与成本。','本次为页面即时汇总；公开动态与内部经营统计分别注明周期，不冒充已留档的定时周报。'];
  gap='本回答尚未取得可核验的经营目标、预算和利润口径，不能判断目标完成率或给出最终资源分配。';followup='这次经营决策最需要提升询盘质量、销售响应，还是成交推进？';break;
 case 'competitor':case 'compare':{
  const sources=namedSources(feed,intent.brands),findings=(feed?.findings||[]).filter(f=>(!intent.brands.length||intent.brands.some(b=>norm(f.brand).includes(norm(b))))&&(!intent.periodRequested||!c.start||Date.parse(f.published_at+'T00:00:00+08:00')>=c.start.getTime()&&Date.parse(f.published_at+'T00:00:00+08:00')<=c.end.getTime())).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
  conclusion=intent.topic==='compare'?'可以比较已公开的产品与渠道定位；目前没有同规格报价或项目结果支撑优劣排名。':findings.length?'以下为已收录来源中的相关动态，按发布日期排列。':'当前已收录资料中没有匹配的有日期动态；这不等于该品牌没有新动作。';
  facts=[...sources.map(s=>`${s.name}（${s.status==='checked'?'已核验':s.status==='partial'?'部分可读':'获取失败'}）：${s.note}\n来源：${s.url}`),...findings.slice(0,4).map(f=>`${f.published_at}｜${f.title}\n事实：${f.fact}\n推测：${f.implication.replace(/^推测[：:]\s*/,'')}\n来源：${f.url}`)];
  if(!feed)facts=['公开情报尚未加载。'];
  advice=[intent.topic==='compare'?'按同国家、同场景、同规格、认证范围、交付及服务逐项对比，缺项保持待核验。':'把行业事件与目标产品/项目需求对应后，再决定是否行动；历史事件首次发现不算新发生。'];
  gap='候选品牌不代表已在同一客户项目竞争；没有全网实时覆盖或竞品内部信息。';followup=intent.brands.length?'需要重点比较哪个产品和使用场景？':'你想先看哪个品牌，或哪个国家的门类产品？';break;}
 case 'boundary':conclusion='我可以解释信息、整理建议和核实清单；不能绕过权限或自动代替你执行业务决定。';gap='发送、价格、分配、删除等仍须进入现有授权流程。';followup='你希望我先整理哪项操作的依据？';break;
 case 'capability':conclusion={Grace:'我负责市场、产品、渠道质量与公开竞品信息。',Brian:'我负责销售响应、商机推进与跟进核实清单。',Jay:'我汇总营销和销售依据，整理优先事项与决策缺口。'}[persona];facts=[`已收录 ${feed?.sources?.length||0}个公开来源、${feed?.findings?.length||0}条有日期动态；业务数据沿用当前账号权限。`];gap='当前采用已核验资料检索和规则分析，未接通可自由推理客户机密的外部模型。';followup='你现在最想解决哪个具体问题？';break;
 default:conclusion='当前已核验的资料不足以准确回答这个问题。';gap='我不会用一份无关经营简报替代答案。';followup='可以补充具体的市场、产品、品牌或商机阶段吗？';
 }
 if(intent.focus){advice.unshift(intent.focus==='project'?'按你本次选择的工程方向，先核实项目阶段、门表、适用标准、总包/顾问关系和招采时间。':'按你本次选择的经销方向，先核实覆盖地区、现有渠道、产品匹配、售后能力和合作条件。');followup=intent.focus==='project'?'优先研究哪个国家的工程项目？':'优先在哪个国家寻找或评估经销商？';gap+=' 本次选择只用于当前对话，不自动登记为公司正式战略。';}
 if(intent.followup)advice.unshift('判断依据：'+({market:'少量可见询盘只能说明获客活动，不能代表全部市场或公司战略。',product:'客户身份、产品型号和认证范围是不同信息，必须分别核实。',commercial:'规格、数量、目的地与批准条件会影响报价，现有资料不能支持直接承诺。',channel:'有效率只使用已完成人工核验的分母；成本和归因缺失时不能评价ROI。',sales:'先核实超时和下一步可以降低遗漏，但规则信号不能替代客户事实。',management:'先处理有证据的异常，再以目标和预算决定资源；不能把缺失目标当成未达标。',competitor:'来源证明事件本身，业务影响仍是需要验证的推测。',compare:'没有同规格、同市场和同服务条件，就无法得出公平的价格或能力排名。'}[intent.topic]||'当前只使用已核实资料，缺口仍需补证。'));
 const checked=Date.parse(feed?.checked_at),fresh=!Number.isFinite(checked)?'公开情报未加载':now-checked>48*3600000?'公开情报已过期，动态需重新核验':checked>now+300000?'公开情报时间异常':'最近公开资料核验：'+feed.checked_at;
 const text=[`${persona}｜${conclusion}`,c.refreshFailed?'注意：最近一次业务数据更新失败，以下仅为上次已加载数据。':'',`范围：${c.scope||'当前账号可见范围'}；统计周期：${periodText(c)}`,facts.length?'\n依据\n'+facts.map(x=>'• '+x).join('\n'):'',advice.length?'\n建议（待人工判断）\n'+advice.map(x=>'• '+x).join('\n'):'','\n信息缺口：'+gap,followup?'\n需要确认：'+followup:'', ['competitor','compare','product','capability'].includes(intent.topic)?'\n'+fresh:''].filter(Boolean).join('\n');
 return {text,intent};
}
