// Versioned code-derived help only. No customer data, provider calls or permission changes.
export const CRM_GUIDE_VERSION='2026-10-13';
export const CRM_MODULES=[
 ['经营看板','dashboard','查看权限范围内的经营指标、渠道与统计周期'],
 ['今日工作台','sales-today','查看今天需要处理的销售工作'],
 ['跟进日历','follow-calendar','查看跟进安排'],
 ['市场任务中心','marketing-center','查看市场任务'],
 ['询盘商机','inquiries','查找询盘，打开详情核对阶段与跟进记录'],
 ['客户管理','customers','查看公司、联系人及关联商机'],
 ['我的邮箱','mailbox','查看本人邮箱的来信与邮件线程'],
 ['客户沟通记录','communications','查看权限范围内的沟通记录'],
 ['待分配池','assignment','处理待分配询盘；具体分配资格由服务端校验'],
 ['市场培育池','nurture','查看待培育线索'],
 ['客户公海','public-pool','查看公海入口及当前可用操作'],
 ['客户背调','research','查询已有研究记录；不代表实时信用核验'],
 ['报价管理','quotes','查看报价入口及对应审批流程'],
 ['履约跟踪','fulfillment','查看履约跟踪入口'],
 ['销售知识库','knowledge','查看销售知识资料'],
 ['我的模板','templates','查看本人可用模板'],
 ['邮件分拣','email','查看邮件分拣入口'],
 ['WhatsApp Business','whatsapp','查看 WhatsApp 入口；实际连接状态需另行核验'],
 ['历史工程','legacy-projects','查看历史工程入口'],
 ['销售日报','daily','查看日报入口'],
 ['360 评分中心','performance-360','查看被授权的评价任务；不通过 Grace 提交评价'],
 ['风险审查中心','risk-review','查看权限内风险和审查状态'],
 ['系统设置','settings','查看当前角色可用的设置'],
 ['角色操作指南','sop','查看角色相关操作说明'],
 ['AI 智能体','ai-advisor','打开智能体入口，选择 Grace、Brian 或 Jay']
];
const HOW=/介绍|怎么|如何|在哪|入口|使用|操作|功能|模块|指南|教程|了解|会什么|能做什么/;
export function crmGuideIntent(question){
 const q=String(question||'').normalize('NFKC').slice(0,500);
 if(/本月|上月|多少|统计|表现|趋势|分析|排名|客户名称/.test(q))return null;
 if(!HOW.test(q))return null;
 const modules=CRM_MODULES.filter(([name])=>q.includes(name));
 const crm=/CRM|crm|我们的系统|询盘系统|客户管理系统/.test(q);
 if(!crm&&!modules.length)return null;
 return {modules};
}
export function crmGuideAnswer(intent){
 const modules=intent.modules.length?intent.modules:CRM_MODULES;
 return `王力 CRM 系统使用说明（代码核对版本 ${CRM_GUIDE_VERSION}）\n系统围绕询盘、客户、沟通、报价与履约开展工作。以下是当前代码中的功能入口，不代表所有角色均可使用或各外部连接已验收。\n\n`+modules.map(([name,,purpose],i)=>`${i+1}. ${name}：${purpose}。入口：返回 CRM 主界面 → 左侧“${name}”。`).join('\n')+'\n\n权限说明：仅查看当前账号获授权的数据。菜单未显示时先查角色操作指南，不通过 Grace 绕过权限。导出、客户转移和风险解除仍按既有业务审批执行；语音不能代替登录权限。\n\n建议下一步：告诉我你要完成的操作，例如“如何查看询盘商机”或“我的邮箱在哪里”。本说明不会替你修改客户、发信或提交审批。';
}
