// Conservative checks for observed marketing advice failures, not a factuality guarantee.
export function answerIssues(text,{social,seo}={}){
 const issues=[];
 if(/Jay.{0,12}(签字|签署|批准后|审批通过|书面批准)/i.test(text))issues.push('Jay是智能体，不是有权批准的人类；所有发布由人类负责人批准。');
 if(/(?:[>≥≤<]|超过|至少|达到)\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%[^。\n]{0,12}(?:达标|目标|门槛)/.test(text))issues.push('不得自造百分比达标门槛；无基线时写目标待基线确认。');
 if(social?.published_28d?.some(x=>x.metric_status==='recorded_not_verified')&&!/未[经经]?验证|未核验|未验证|不可.*效果|不能.*效果|记录值/.test(text)&&/播放|互动|效果|起步阶段/.test(text))issues.push('社媒互动指标只是未验证记录，不能据此评价效果或阶段，必须明确标注。');
 if(seo?.status!=='available'&&/零流量|零点击|没有.*(?:GA4|GSC)|无(?:GSC|GA4).*接入/.test(text)&&!/(?:非|不是|不等于|不能|不代表)[^。\n]{0,20}(?:零流量|零点击|GA4|GSC)/.test(text))issues.push('Grace未取得SEO数据不等于源系统没有GA4/GSC，缺失不是零。');
 return issues;
}
export function correctionMessage(issues){return {role:'system',content:'发布前事实检查要求：'+issues.join(' ')+'重新回答原问题，最多500字。不引用之前错误答案；官方链接从marketingLearning的source逐字复制；实验不写未经证实的产品性能或具体数字目标。只输出修正后的答案。'}};

function requestedMonths(question,posts,now=Date.now()){
 const months=[];const explicitYears=[...String(question||'').matchAll(/(20\d{2})\s*年\s*(\d{1,2})\s*月/g)];
 if(explicitYears.length){for(const m of explicitYears.slice(-2)){const month=Number(m[2]);if(month>=1&&month<=12)months.push(`${m[1]}-${String(month).padStart(2,'0')}`)}}
 else{
  const explicit=[...String(question||'').matchAll(/(\d{1,2})\s*月/g)].map(m=>Number(m[1])).filter(m=>m>=1&&m<=12);
  if(explicit.length>=2){for(const month of explicit.slice(0,2)){const year=month>new Date(now).getMonth()+1?new Date(now).getFullYear()-1:new Date(now).getFullYear();months.push(`${year}-${String(month).padStart(2,'0')}`)}}
  else months.push(...[...new Set(posts.map(p=>/^\d{4}-\d{2}/.exec(String(p.published_at||''))?.[0]).filter(Boolean))].sort().slice(-2));
 }
 return [...new Set(months)].slice(0,2);
}
function socialLibraryAnalysis({socialLibrary,question,social}={}){
 if(socialLibrary?.status!=='available'&&socialLibrary?.status!=='partial')return null;
 const posts=Array.isArray(socialLibrary.posts)?socialLibrary.posts:[],months=requestedMonths(question,posts),lines=['可核对的数据分析（仅限 CRM 已入库内容，不代表平台全量）'];
 lines.push(`内容库读取 ${socialLibrary.records_read??posts.length}/${socialLibrary.total_records??'未知'} 条，${socialLibrary.status==='partial'?'本次读取不完整。':'已读完当前已入库范围。'}`);
 const validPosts=posts.map(p=>({...p,_date:Date.parse(p.published_at||'')})).filter(p=>Number.isFinite(p._date));
 if(months.length){
  const totals=months.map(month=>({month,rows:validPosts.filter(p=>new Date(p._date).toISOString().slice(0,7)===month)}));
  for(const item of totals){const platforms={};for(const p of item.rows){const key=['youtube','tiktok','instagram','facebook','linkedin'].includes(String(p.platform||'').toLowerCase())?String(p.platform).toLowerCase():'其他';platforms[key]=(platforms[key]||0)+1}const distribution=Object.entries(platforms).map(([k,v])=>`${k} ${v}条`).join('、')||'无可按发布时间归档的记录';lines.push(`${item.month}：${item.rows.length} 条已入库发布记录${distribution?`（${distribution}）`:''}。`)}
  if(totals.length===2){const [newer,older]=totals,change=newer.rows.length-older.rows.length,delta=older.rows.length?`，较${older.month}${change>=0?'增加':'减少'} ${Math.abs(change)} 条（${Math.round(change/older.rows.length*100)}%）`:change?`，较${older.month}的 0 条增加 ${change} 条（基数为0，不计算百分比）`:`，与${older.month}持平`;
   lines.push(`${newer.month}发布量${delta}；这只说明内容发布频次变化，不等于互动、流量或询盘效果变化。`)}
 }else lines.push('已入库记录缺少可解析的发布时间，暂不能做月度发布量比较。');
 const titles=validPosts.filter(p=>months.length?months.includes(new Date(p._date).toISOString().slice(0,7)):true).map(p=>String(p.title||'').trim()).filter(Boolean).slice(0,4);
 if(titles.length)lines.push(`本次记录中的标题样本：${titles.map(t=>`“${t.slice(0,90)}”`).join('；')}。这是样本，不代表完整主题分布。`);
 const recorded=social?.published_28d?.some(x=>x.metric_status==='recorded_not_verified')||posts.some(p=>p.metric_status==='recorded_not_verified');
 lines.push(recorded?'效果指标限制：互动数是无单帖同步日期的登记累计值且标记未核验；不能据此比较9月/8月互动增长或推断转化。曝光、触达、观看留存、点击、广告归因与询盘关联未取得。':'效果指标限制：本次未取得可比的单帖效果数据、曝光/触达/留存及归因，不能判断互动质量或转化。');
 lines.push('建议：先补齐按月的单帖同步快照及GA4/UTM归因，再用同平台、同口径比较互动率、有效访问和询盘；在数据补齐前，只把发布量和内容样本作为观察项。');
 return lines.join('\n');
}

export function safeMarketingFallback({social,seo,socialPosts,socialLibrary,question}={}){
 const analysis=socialLibraryAnalysis({socialLibrary,question,social});
 if(analysis)return analysis;
 if(socialPosts?.status==='available')return '模型分析未通过事实检查。以下为系统直接整理的已发布内容记录，不是效果分析。\n\n'+`社媒第${socialPosts.page}页，本页${socialPosts.posts.length}条；已入库发布记录共${socialPosts.total_records}条；${socialPosts.has_more?'还有下一页':'没有下一页'}。仅代表当前系统已入库范围。\n\n`+socialPosts.posts.map((p,i)=>`${i+1}. ${p.platform}｜${p.title||'标题缺失'}\n${p.url||'公开链接缺失'}\n发布时间：${p.published_at||'未知'}\n正文摘录：${p.content?.slice(0,400)||'未取得正文'}${p.content?.length>400?'（仅展示摘录）':''}\n登记累计指标（未核验）：播放${p.metrics.views??'未知'}、赞${p.metrics.likes??'未知'}、评论${p.metrics.comments??'未知'}、分享${p.metrics.shares??'未知'}、收藏${p.metrics.saves??'未知'}。`).join('\n\n')+'\n\n单帖同步时间未知；曝光、触达、观看时长、留存、点击、受众地区、广告归因、视频转写与画面分析尚未取得。正文不是视频转写，登记值不能直接作为效果结论。';
 const socialLine=social?.status==='available'?'社媒只读摘要已接通；其中未核验的互动记录不能作为效果结论。':'本次未取得可用社媒摘要，不能判断当前表现。';
 const seoLine=seo?.status==='available'?'SEO摘要已取得，请以各来源截止日期为准。':'本次未取得可用SEO摘要；这不代表网站流量为零或源系统没有GA4/GSC。';
 return `本次模型方案未通过事实检查，以下是系统提供的保守参考模板，不是模型分析结论。\n\n${socialLine}\n${seoLine}\n\n可供讨论的内容实验：选择一个已核验的产品事实，用实拍展示，比较两种开场表达；保持语言、受众和发布条件尽量一致。先收集观看留存、合格访问与询盘基线，目标待基线确认，不预设达标线。\n\n工作流：核对产品资料 → 生成草稿 → 人类负责人审核事实、版权和承诺 → 在原系统人工批准发布 → 按同口径复盘。尚未执行或启用定时任务。\n\nTikTok官方学习入口：https://ads.tiktok.com/business/en/academy（2026-09-23核验课程介绍，未完成认证）。`;
}
