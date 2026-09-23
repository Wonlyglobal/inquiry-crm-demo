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

export function safeMarketingFallback({social,seo}={}){
 const socialLine=social?.status==='available'?'社媒只读摘要已接通；其中未核验的互动记录不能作为效果结论。':'本次未取得可用社媒摘要，不能判断当前表现。';
 const seoLine=seo?.status==='available'?'SEO摘要已取得，请以各来源截止日期为准。':'本次未取得可用SEO摘要；这不代表网站流量为零或源系统没有GA4/GSC。';
 return `本次模型方案未通过事实检查，以下是系统提供的保守参考模板，不是模型分析结论。\n\n${socialLine}\n${seoLine}\n\n可供讨论的内容实验：选择一个已核验的产品事实，用实拍展示，比较两种开场表达；保持语言、受众和发布条件尽量一致。先收集观看留存、合格访问与询盘基线，目标待基线确认，不预设达标线。\n\n工作流：核对产品资料 → 生成草稿 → 人类负责人审核事实、版权和承诺 → 在原系统人工批准发布 → 按同口径复盘。尚未执行或启用定时任务。\n\nTikTok官方学习入口：https://ads.tiktok.com/business/en/academy（2026-09-23核验课程介绍，未完成认证）。`;
}
