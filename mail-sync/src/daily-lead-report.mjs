const labels={website:'官网表单',email:'企业邮箱',google_ads:'Google Ads',meta_ads:'Meta Ads',organic_search:'SEO自然搜索',social_media:'社媒',linkedin:'LinkedIn',whatsapp:'WhatsApp',wechat:'微信',phone:'电话',exhibition:'展会',offline_visit:'线下拜访',outbound:'销售自主开发',self_developed:'销售自主开发',dealer_referral:'经销商转介绍',customer_referral:'客户转介绍',internal_referral:'部门/团队转介绍',referral:'转介绍',manual:'手工登记',other:'其他'};
export function reportWindow(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=type=>parts.find(x=>x.type===type)?.value;
  const date=`${get('year')}-${get('month')}-${get('day')}`;
  return {date,hour:Number(get('hour')),cutoff:`${get('hour')}:${get('minute')}`,start:`${date}T00:00:00+08:00`,end:now.toISOString()};
}
export function summarizeLeads(rows,salesIds=new Set()){
  const channels={},validity={valid:0,pending:0,invalid:0,unknown:0};
  let salesCreated=0,selfDeveloped=0;
  const unique=new Map(rows.map(row=>[row.id,row]));
  for(const row of unique.values()){
    const channel=labels[row.source]||'其他/待补充';channels[channel]=(channels[channel]||0)+1;
    validity[Object.hasOwn(validity,row.validity)?row.validity:'unknown']++;
    if(salesIds.has(row.created_by))salesCreated++;
    if(row.source==='outbound'||row.primary_source==='self_developed'||row.primary_source==='outbound')selfDeveloped++;
  }
  return {total:unique.size,channels,validity,salesCreated,selfDeveloped};
}
export function renderLeadReport({window,summary,pendingToday,pendingTotal,legacy=false}){
  const channelText=Object.entries(summary.channels).sort((a,b)=>b[1]-a[1]).map(([name,count])=>`${name} ${count}条`).join('；')||'今日暂无新增登记';
  return [
    `【全渠道询盘日报】${window.date}`,
    `统计截止：北京时间 ${window.cutoff}`,
    ...(legacy?['口径更正：本版包含官网、邮箱及人工登记，替代此前仅业务员新建的统计。']:[]),
    '',`今日新增登记：${summary.total} 条（全渠道）`,
    `有效 ${summary.validity.valid}｜待确认 ${summary.validity.pending}｜无效 ${summary.validity.invalid}${summary.validity.unknown?`｜状态待核实 ${summary.validity.unknown}`:''}`,
    `来源渠道：${channelText}`,
    `销售自主开发（明确归因）：${summary.selfDeveloped} 条`,
    `业务员本人登记：${summary.salesCreated} 条（已包含在全渠道总数中）`,
    '',`今日收到且仍待分拣：${pendingToday} 封`,
    `当前待分拣积压：${pendingTotal} 封（含历史邮件；不与新增询盘相加）`,
    '',
    '口径：询盘按 CRM 记录日期 created_at 统计；历史补录如保留原收件日期，则归原日期。待分拣按邮件收件时间统计。',
    '已排除看板排除记录、已归档询盘及垃圾箱/养号邮件。有效性以人工确认为准；日报截止后的新增不在本次快照内。',
    '客户公司、联系人及联系方式不在群内展示。CRM：https://crm.foreverdoodle.com/'
  ].join('\n');
}
async function readAll(query){
  const rows=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await query().range(offset,offset+499);
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('日报数据不可用');
    rows.push(...data);if(data.length<500)return rows;
  }
}
export async function deliverDailyLeadReport({db,feishuWebhook='',dingtalkWebhook='',reportHour=18,now=new Date(),fetchImpl=fetch}){
  if(!feishuWebhook&&!dingtalkWebhook)return {skipped:'no_destination'};
  const window=reportWindow(now);if(window.hour<reportHour)return {skipped:'before_report_hour'};
  const {data:sent,error:sentError}=await db.from('audit_logs').select('after_data').eq('action','daily_lead_feishu_report').gte('created_at',window.start).lte('created_at',window.end);
  if(sentError)throw sentError;
  if(sent?.some(x=>x.after_data?.report_version===2&&x.after_data?.report_date===window.date))return {skipped:'already_sent'};
  const pending=()=>db.from('email_intake').select('id',{count:'exact',head:true}).is('inquiry_id',null).is('trashed_at',null).eq('processing_status','pending_review').or('triage_label.is.null,triage_label.eq.pending,triage_label.eq.real');
  const [rows,people,today,backlog]=await Promise.all([
    readAll(()=>db.from('inquiries').select('id,created_by,source,primary_source,validity,created_at').eq('excluded_from_dashboard',false).is('archived_at',null).gte('created_at',window.start).lte('created_at',window.end).order('created_at').order('id')),
    db.from('profiles').select('id').eq('role','sales'),
    pending().gte('received_at',window.start).lte('received_at',window.end),pending()
  ]);
  for(const result of [people,today,backlog])if(result.error)throw result.error;
  if(!Array.isArray(people.data)||!Number.isInteger(today.count)||!Number.isInteger(backlog.count))throw new Error('日报统计不可用');
  const summary=summarizeLeads(rows,new Set(people.data.map(x=>x.id)));
  const content=renderLeadReport({window,summary,pendingToday:today.count,pendingTotal:backlog.count,legacy:Boolean(sent?.length)});
  const channels=[];
  if(feishuWebhook){
    const response=await fetchImpl(feishuWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msg_type:'text',content:{text:content}}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok||result.code!==0)throw new Error('飞书日报发送失败');channels.push('feishu');
  }
  if(dingtalkWebhook){
    const response=await fetchImpl(dingtalkWebhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msgtype:'text',text:{content}}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok||Number(result.errcode)!==0)throw new Error('钉钉日报发送失败');channels.push('dingtalk');
  }
  const after_data={report_version:2,report_date:window.date,cutoff_at:window.end,lead_count:summary.total,source_counts:summary.channels,validity_counts:summary.validity,sales_created_count:summary.salesCreated,self_developed_count:summary.selfDeveloped,pending_today:today.count,pending_backlog:backlog.count,channels};
  const {error}=await db.from('audit_logs').insert({actor_id:null,entity_type:'system',entity_id:null,action:'daily_lead_feishu_report',after_data,reason:'全渠道日报；官网/邮箱/人工登记与销售自主开发分列；只发送脱敏汇总'});
  if(error)throw error;
  return after_data;
}
