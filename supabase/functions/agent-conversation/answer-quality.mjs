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
