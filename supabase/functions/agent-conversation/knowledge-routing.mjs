import {generalMind} from './grace-mind.mjs';
import {analysisIntent} from './deep-analysis.mjs';
// Deterministic, auditable routing; no model-selected URLs or arbitrary tools.
export function knowledgeRoute(question,history=[]){
 const q=String(question),previous=history.filter(x=>x.role==='user').at(-1)?.content||'';
 const followup=/^(那|继续|展开|详细|为什么|怎么做|再|它|他们|这个|上面)/.test(q)&&q.length<80;
 const topic=followup?q+' '+previous:q;
 const productInternal=/(我们|我司|王力|wonly)/i.test(topic)&&/产品|型号|材质|规格|尺寸|认证|防火|隔音|质保|安装|参数/i.test(topic);
 const modelQuestion=/\b[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\b/.test(topic)&&/参数|尺寸|材质|型号|规格|防火|隔音|安装|认证|质保/.test(topic);
 const materials=productInternal||modelQuestion||/物料|资料库|产品系列|系列目录|产品线|产品知识|知识覆盖|解析进度|产品手册|宣传册|安装视频|公司动态|公司资料|找.{0,12}(资料|文件|视频|图片)/.test(topic)
  ||/(有没有|找|发|给我|要|调出|调取).{0,16}(PPT|ppt|案例|检测报告|测试报告|报告|证书|彩页|样本|手册|视频|图片|演示|方案书)/.test(topic);
 const business=/我们|王力|wonly|CRM|询盘|线索|商机|客户|复盘|背调|网站|SEO|GSC|GA4|社媒|帖子|粉丝|转化率|销售阶段/i.test(topic)
  ||/防盗门|防火门|木门|智能锁|门锁|画册|产品|型号|业绩|销售|报价|成交|渠道|投放|广告|google ?ads|meta ?ads|营销|推广|官网|搜索词|关键词|案例|PPT|检测报告|证书|市场机会|营销计划|竞品|对手|展会|经销商|代理商|出口|订单|物料/i.test(topic);
 const fresh=/最新|最近|今天|目前|当前|实时|新闻|动态|联网|搜索|查一下|竞品|政策|天气|汇率|now|latest|today/i.test(topic);
 const combined=analysisIntent(topic)&&/综合|整体|全渠道|营销|增长/.test(topic);
 const social=/社媒|帖子|粉丝|社交|tiktok|instagram|facebook|youtube|linkedin/i.test(topic);
 const seo=/网站|官网|页面|SEO|GSC|GA4|流量|搜索排名|搜索词|关键词|点击率|CTR|收录/i.test(topic);
 const crm=/CRM|询盘|线索|商机|销售|转化|经营|业绩|报价|成交|渠道|投放|广告|google ?ads|meta ?ads|营销计划|ROI/i.test(topic);
 const research=/背调|市场|国家|产品|竞品|机会|对手|准入/i.test(topic);
 // A mixed/private question may only produce fixed public topic tokens, never free text.
 const tokens=[];for(const [re,label] of [[/门|锁/,'doors smart locks'],[/tiktok/i,'TikTok'],[/instagram/i,'Instagram'],[/facebook/i,'Facebook'],[/youtube/i,'YouTube'],[/linkedin/i,'LinkedIn'],[/墨西哥/,'Mexico'],[/美国/,'United States'],[/英国/,'United Kingdom'],[/中东/,'Middle East'],[/竞品/,'industry competitors'],[/营销|市场/,'marketing market']])if(re.test(q))tokens.push(label);
 const sensitive=/我们|我司|内部|客户|报价|合同|预算|订单|员工|联系人|机密|隐私|CRM|线索|询盘|营收|利润|成本|密码|密钥|[\d]{7,}|https?:\/\/|@/i.test(q);
 const sourceStatus=/读取|接通|连接|摘要|数据截止|来源状态/.test(q)&&/状态|成功|是否|核对|检查/.test(q)&&!/竞品|联网|搜索/.test(q);
 const publicQuery=fresh&&!sourceStatus?(business||sensitive?(tokens.length?tokens.join(' ')+' official latest news':''):q.slice(0,500)):'';
 return {materials,mode:business?'business':fresh?'research':'general',social:business&&(social||combined),seo:business&&(seo||combined),crm:business&&(crm||combined),research:business&&(research||combined),knowledge:business||research,search:!!publicQuery,publicQuery};
}
export function generalSystem(persona){return generalMind(persona)}
