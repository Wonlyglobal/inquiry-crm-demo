import {customerCompanyAnswer,customerPurpose} from './customer-writing.mjs';
import {writingRequestText,writingPrimaryTask} from './writing-request.mjs';
import {conciseCatalogFacts} from './catalog-fact-answer.mjs';
// Internal document-based writing. No model calls, arbitrary tools or client-supplied facts.
// Compact authenticated state survives the existing query-only materialHistory channel.
const PREFIX='work-writing:v1.';
const follow=/直接给|客户版|给客户|客户正文|直接发|不要再提|不要提|别提|文案|润色|优化|翻译|西班牙语|西语|^确认|现在确认|确认最新|刚才|上一(?:轮|版|稿)|最新(?:修订|确认|英文)|这(?:一)?(?:版|段|稿)|稿件|再精简|还没确认|已确认|确认了|暂时不要翻译|删掉产能|改得更口语/;
const task=/直接给|能发|可发|客户版|(?:给客户|对客户|向客户).{0,12}(?:介绍|文案)|直接发|客户正文|润色|优化|排除选项|核验路径|合作价值|原因|写|改写|改成|解释|整理|列出|先问|回复|通知|预告|短信|消息|模板|开场|提纲|讲解|故事|回答|证据|先说明判断|切入点|设计|清单|流程|框架|问法|追问|澄清|取舍|异议|礼貌纠正|沟通|怎样|如何|怎么向客户解释|先列出|需要提供什么|怎么避免|核对清单|先说明判断|如何处理|可以对外/;
const domain=/王力|wonly|公司介绍|品牌|客户|经销|代理|项目|产品|智能锁|木门|认证|交货|交期|画册|英文稿|翻译|西语|西班牙语|竞品|保养|选型|选门|洞口|社媒|邮件|展会|培训|私有|检索日志/i;
const books={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const words=s=>(s.match(/\b[A-Za-z][A-Za-z’'-]*\b/g)||[]).length;
const draftHash=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const encode=s=>btoa(unescape(encodeURIComponent(s))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=s=>decodeURIComponent(escape(atob(s.replaceAll('-','+').replaceAll('_','/'))));
const fact=(c,t)=>(c?.facts||[]).find(x=>x.topic===t&&x.catalog==='c2')||(c?.facts||[]).find(x=>x.topic===t);
const safeNum=s=>String(s||'').match(/\d+(?:\.\d+)?/g)||[];
export const newWritingDraft=q=>/(?:帮我写|给客户讲王力公司介绍|(?:^|[\n，。；])(?:先|请)?写)/.test(q);
const independentWritingRequest=q=>/我会提供|需要提供什么|先告诉我|先说明判断|怎么避免|如何避免|(?:设计|列出|整理).{0,14}(?:清单|框架|流程)|(?:仅|只)内部/.test(q);
export const writingContinuation=input=>input?.action==='chat'&&!input.voice&&!input.privateReportKey&&typeof input.question==='string'&&follow.test(input.question)&&!newWritingDraft(input.question)&&!independentWritingRequest(input.question);
export function companyDraftResult(result){try{return JSON.parse(decode(result.context.material_question.slice(PREFIX.length).split('.')[0])).k==='company'&&JSON.parse(decode(result.context.material_question.slice(PREFIX.length).split('.')[0])).w!==0&&['en','es'].includes(result.context.language||JSON.parse(decode(result.context.material_question.slice(PREFIX.length).split('.')[0])).l)}catch{return false}}
export function workScenarioIntent(input){
 if(input?.action!=='chat'||input.voice||input.privateReportKey||typeof input.question!=='string')return false;
 const q=input.question.trim();
 if((input.materialHistory||[]).some(x=>String(x).startsWith(PREFIX))&&follow.test(q))return true;
 return task.test(writingRequestText(q))&&domain.test(q)&&!/^打开|^下载|^同步|^删除|^记住/.test(q);
}
function kindOf(q){
 q=writingPrimaryTask(q);
 if(/WhatsApp/i.test(q)&&/展会|跟进/.test(q))return 'exhibition_followup';
 if(/没回复|未回复/.test(q)&&/跟进|短信/.test(q))return 'quiet_followup';
 if(/样品/.test(q)&&/通知|物流单号|单号/.test(q))return 'sample_notice';
 if(/新品预告/.test(q))return 'product_preview';
 if(/不使用世界第一/.test(q))return 'why_us';
 if(/30秒/.test(q))return 'opening';
 if(/90秒/.test(q))return 'story';
 if(/一页公司介绍提纲/.test(q))return 'outline';
 if(/三条可核对/.test(q))return 'three_facts';
 if(/不愿透露预算/.test(q))return 'budget';
 if(/指令|检索日志|全部客户资料/.test(q))return 'injection';
 if(/第\s*62\s*页/.test(q))return 'page62';
 if(/三条|3条/.test(q)&&/视频|时间码/.test(q))return 'video';
 if(newWritingDraft(q)&&customerPurpose(q)==='customer'&&/公司介绍|品牌.{0,8}介绍|介绍.{0,8}王力/.test(q)&&!/提纲|清单|故事|30秒|90秒/.test(q))return 'company';
 if(/全球销量第一|世界第一|排名/.test(q))return 'claim';
 if(/报价|降价|价格太贵|便宜|预算/.test(q))return /冲突|马上交货|便宜.*耐用/.test(q)?'tradeoff':'price';
 if(/年产能|第3页/.test(q))return 'capacity';
 if(/两周|交货|交期/.test(q))return 'delivery';
 if(/上市.*认证/.test(q))return 'cert_company';
 if(/视频/.test(q))return 'video_claim';
 if(/两份画册|不同.*数字|参数不同|版本不同/.test(q))return 'conflict';
 if(/未明确版本|比较两个|对比表/.test(q))return 'compare';
 if(/专利/.test(q))return 'patent';
 if(/比竞品|竞品好|公平.*比较/.test(q))return 'competitor';
 if(/靠海|沿海|腐蚀/.test(q))return 'coastal';
 if(/短租/.test(q))return 'rental';
 if(/防火要求|从需求到证书/.test(q))return 'fire';
 if(/保养/.test(q))return 'care';
 if(/钢质门.*木门|排除选项/.test(q))return 'categories';
 if(/洞口大概|现场确认清单/.test(q))return 'measure';
 if(/代理还是|探索式对话/.test(q))return 'channel';
 if(/推荐一款好门|澄清问题/.test(q))return 'discovery';
 if(/首次联系邮件/.test(q))return 'email';
 if(/展会.*对话|英文邀请/.test(q))return 'invitation';
 if(/社媒内容创意/.test(q))return 'social';
 if(/培训问答/.test(q))return 'training';
 if(/已确认英文稿|需要提供什么/.test(q))return 'provided_text';
 if(/核对清单|型号.*日期.*单位/.test(q))return 'translation_check';
 if(/两段公司介绍|怎么避免翻错/.test(q))return 'version_check';
 if(/上一轮输出了英文|默认应该用什么语言/.test(q))return 'language_check';
 if(/客户.{0,5}介绍|品牌.{0,8}(?:介绍|竞争优势)|产品竞争优势|(?:公司|品牌)简介|先写一段英文公司介绍|公司介绍|王力.*发展历程|介绍王力|公司.*提纲|介绍.*王力|为什么.*选|为什么要选|合作是否靠谱|公司年产能|画册第3页/.test(q))return /年产能|第3页/.test(q)?'capacity':'company';
 return 'discovery';
}
function metadata(q){
 const market=['西班牙','墨西哥','智利','秘鲁','哥伦比亚'].find(x=>q.includes(x))||'';
 const audience=['经销商','建筑师','酒店采购','家庭客户','安装合作方'].find(x=>q.includes(x))||'';
 return {m:market,a:audience};
}
function citations(c,topics){
 const refs=[...new Set(topics.map(t=>fact(c,t)).filter(Boolean).map(f=>`${books[f.catalog]||f.catalog} PDF第${f.page}页`))];
 return refs.length?'来源：'+(c.sources?.find(s=>s.id==='c2')?.edition||'2026-08')+'，'+refs.join('；')+'。\n画册口径，具体产品与承诺另行核验。':'来源：通用沟通与核验建议；未引用已核实产品参数。';
}
function companyData(c){
 const founding=fact(c,'founding'),listing=fact(c,'listing'),rnd=fact(c,'rnd');
 const y=String(founding?.text||'').match(/\b(?:19|20)\d{2}\b/)?.[0];
 const listingYear=String(listing?.text||'').match(/\b20\d{2}\b/)?.[0];
 const code=String(listing?.text||'').match(/\b\d{6}\b/)?.[0];
 const rz=String(rnd?.zh||'');const investment=rz.match(/(?:超过|超|投入)[^\d]{0,5}(\d+(?:\.\d+)?)\s*万/)?.[1];
 const team=rz.match(/团队[^\d]{0,5}(\d+)/)?.[1];
 return {y,listingYear,code,investment:investment?String(Number(investment)/100):null,team};
}
function companyParagraphs(c,s){
 const d=companyData(c);if(!d.y||!d.listingYear||!d.code)return null;
 const intro=s.t?'Thank you for meeting with us. Let me give you a straightforward introduction to WONLY.':'Thank you for the opportunity to introduce WONLY.';
 const esIntro=s.t?'Gracias por reunirse con nosotros. Permítame presentar WONLY de forma clara y directa.':'Gracias por la oportunidad de presentar WONLY.';
 const pairs=[
 [intro+` Founded in ${d.y}, WONLY has a background in doors and locks. For this introduction, we will focus on the company information documented in its overseas catalogue, then connect that background with the questions that matter to your business.`,esIntro+` Fundada en ${d.y}, WONLY cuenta con una trayectoria en puertas y cerraduras. En esta presentación nos centraremos en la información de la empresa recogida en su catálogo internacional y la relacionaremos con las cuestiones importantes para su negocio.`],
 [`The catalogue records the company's listing on the main board of the Shanghai Stock Exchange in ${d.listingYear}, under stock code ${d.code}. This provides a dated company reference. It should not be interpreted as evidence that every product has a particular overseas certification or meets every project's requirements.`,`El catálogo recoge la cotización de la empresa en el mercado principal de la Bolsa de Shanghái en ${d.listingYear}, con el código bursátil ${d.code}. Es una referencia de la empresa con fecha; no demuestra que todos sus productos cuenten con una certificación internacional determinada ni que cumplan los requisitos de cualquier proyecto.`],
 ];
 if(!(s.o&2)&&d.investment&&d.team)pairs.push([`Research and development is another point of discussion. The catalogue reports annual investment exceeding RMB ${d.investment} million and a research team of ${d.team} people. These figures describe the company's stated development resources; the performance of a selected product still needs its own supporting evidence.`,`La investigación y el desarrollo constituyen otro tema relevante. El catálogo indica una inversión anual superior a ${d.investment} millones de yuanes y un equipo de investigación de ${d.team} personas. Estas cifras describen los recursos de desarrollo declarados por la empresa; las prestaciones de un producto concreto requieren documentación propia.`]);
 if(!(s.o&1)&&fact(c,'capacity'))pairs.push(['Manufacturing capacity can also be discussed using the categories and units specified in the catalogue. A published annual capacity is background information, rather than confirmation of available stock, an order allocation, or a delivery date. Those details must be checked for the actual product and order.','La capacidad de fabricación también puede analizarse según las categorías y unidades del catálogo. La capacidad anual publicada es información de contexto: no confirma existencias, una asignación de producción ni una fecha de entrega. Estos aspectos deben comprobarse para el producto y el pedido concretos.']);
 else pairs.push(['For an initial discussion, we would first understand the intended application, installation conditions, required functions, and your priorities. This helps keep the product conversation focused. It also makes clear which information is already documented and which questions require further confirmation before a decision.','En una primera conversación, empezaríamos por conocer la aplicación prevista, las condiciones de instalación, las funciones necesarias y sus prioridades. Así podemos centrar el diálogo sobre el producto y distinguir qué información está documentada y qué cuestiones requieren confirmación antes de decidir.']);
 pairs.push(['In practical terms, our conversation should make it easier for you to separate company background from product selection. We can organise the available information around your questions, keep a clear reference to the relevant catalogue page, and identify any missing documents before moving forward. This approach supports a more specific discussion without assuming what you need.', 'En la práctica, nuestra conversación debe ayudarle a distinguir la información de la empresa de la selección de productos. Podemos organizar la información disponible según sus preguntas, conservar la referencia a la página correspondiente del catálogo e identificar los documentos que faltan antes de avanzar. Así podremos mantener un diálogo más concreto sin presuponer sus necesidades.']);
 pairs.push(['Rather than making a broad promise, the next step is to identify a suitable product category and review its current specifications together. Relevant dimensions, installation details, certifications, quotations, and delivery arrangements should be confirmed separately. We welcome a focused conversation about your needs and the documents required for your next decision.','En lugar de formular una promesa general, el siguiente paso consiste en identificar una categoría de producto adecuada y revisar conjuntamente sus especificaciones vigentes. Las dimensiones, los detalles de instalación, las certificaciones, los presupuestos y las condiciones de entrega deben confirmarse por separado. Será un placer conversar sobre sus necesidades y la documentación necesaria para su próxima decisión.']);
 return pairs;
}
function companyAnswer(c,s){
 if(s.w===2)return customerCompanyAnswer(c,s,companyData(c));
 if(s.w===0){const d=companyData(c);return {text:[`可核事实：成立于${d.y||'待核年份'}年；${d.listingYear||'待核年份'}年在上交所主板上市，代码${d.code||'待核代码'}。`,d.investment&&d.team?`研发：年投入超过${d.investment}百万元，团队${d.team}人。`:'研发投入和团队人数本次未完整核实。','表达建议：产品组合与客户应用的连接属于写作建议。','未核结论：具体型号认证、性能、报价、交期及相对竞品优势不能从公司背景直接推出。'].join('\n'),topics:['founding','listing','rnd'],customerFacing:false};}
 const pairs=companyParagraphs(c,s);if(!pairs)return {text:'本次未能核对公司介绍所需的成立与上市资料，请先补齐有出处的事实。',topics:[]};
 const language=s.l,idx=language==='es'?1:0;
 if(language==='zh'){
 const lines=['先从企业背景切入，再说明产品讨论如何衔接客户需求。',`王力成立于${companyData(c).y}年，画册记录其于${companyData(c).listingYear}年在上海证券交易所主板上市，股票代码${companyData(c).code}。`,!(s.o&2)&&companyData(c).team?`画册还介绍了研发投入和${companyData(c).team}人的研发团队。`:'','这些公司层面的信息可作为初次沟通的基础；具体产品的性能、认证与交期，应按型号和订单分别核对。','接下来先了解客户的使用位置、安装条件、功能优先级和预算范围，再挑选需要进一步查看的产品资料。','如果您正在比较几类产品，我们可以先把必须满足的条件与可以取舍的配置分开，再逐项核对资料中的适用范围。沟通的目标是帮助您判断下一步需要什么依据，而不是替您预设选择。','对已有资料能够支持的事实，保留版本和页码；对缺少证据的说法，直接说明尚需确认。这样既能让客户理解企业背景，也能自然转入下一步需求讨论。'].filter(Boolean);
 return {text:s.n<=120?lines.slice(1,4).join('\n'):lines.join('\n\n'),topics:['founding','listing',...s.o&2?[]:['rnd']]};
 }
 let chosen=pairs;
 if(s.n<=120)chosen=pairs.slice(0,2);
 else if(s.n<=220)chosen=pairs.slice(0,4);
 return {text:chosen.map(p=>p[idx]).join('\n\n'),topics:['founding','listing',...s.o&2?[]:['rnd']]};
}
const GUIDES={
 budget:['问法一：如果先不谈金额，您最不愿牺牲的是安全、使用便利、外观还是其他方面？','问法二：哪些功能必须保留，哪些可以在有依据的方案比较后再取舍？','问法三：您希望先看满足基本要求的方案，还是同时了解不同配置各自的价值与限制？','不推定预算、不诱导报价，待客户明确优先级再核对配置与价格。'],
 discovery:['先问使用位置：入户、室内，还是其他场景？','再确认洞口宽高、测量单位与现场安装条件。','明确最重要的功能、实际使用者和日常管理方式。','确认当地适用要求及需要核验的报告。','最后问预算优先级和时间安排，信息齐备后再讨论具体型号。'],
 tradeoff:['先确认“马上交货”的具体日期和可接受范围；现有资料不能证明可交付。','把价格、耐用、外观和交期按必须满足/可以取舍分类。','追问使用场景及可核对的性能要求，避免把“耐用”当成已经确认的指标。','核对可用型号、库存/排产及报价后，再给可比较的方案。'],
 price:['可能是预算不匹配：问客户最需要保留的功能是什么。','可能是比较条件不同：核对尺寸、配置、安装、服务及税运范围。','可能是价值还没有解释清楚：问客户最担心的使用问题，再对照证据说明。','以上都是待验证的假设，不代表客户真实动机；不自动降价或生成价格承诺。'],
 delivery:['画册年产能描述生产规模，不等于当前库存、可分配产线或某笔订单的交期。','客户回复可写：“我理解您的时间要求。请先确认型号、数量、配置和收货地点，我会核对排产及物流后给您可确认的安排。”','具体产能数字需按原页、门类和单位引用；尚未核实的库存、交期与运输不作保证。'],
 cert_company:['上市是公司层面的信息，产品认证针对具体型号、结构、用途及适用市场，两者不能替代。','核对报告主体、型号、测试标准、有效性、覆盖的配置和安装条件。','再向项目责任人确认当地适用性；画册宣传不等于已经完成项目合规。'],
 video_claim:['视频只能支持实际画面或转写中出现的内容，必须能定位原片及时间范围。','宣传画面不能单独证明产品性能、认证、实际产量或交付保证。','对客户可说：“我们可以一起核对原片；您关心的具体性能仍需查看对应型号的有效资料。”'],
 conflict:['先列两份文件名、版本/日期、页码及各自参数，保留原单位。','确认是否为相同型号、结构、地区及测试条件；不要把不同版本视为同时生效。','向资料负责人确认现行口径。确认前明确存在冲突，不任选数字或据此承诺。'],
 compare:['先确认完整型号、画册版本、使用地区、配置及客户最关注的字段。','对比表：字段｜型号A依据/页码｜型号B依据/页码｜是否同条件｜待确认\n尺寸｜待填写｜待填写｜待核对｜版本/单位\n功能｜待填写｜待填写｜待核对｜配置\n认证｜待填写｜待填写｜待核对｜报告覆盖范围','尺寸、功能、供电、安装、认证和服务范围逐项填写；未写明的项目不猜测，也不默认两款都有。'],
 patent:['把“有专利”转成客户能验证的问题：解决了什么使用问题？对应哪款产品和配置？','请客户关注实际操作体验，再核对专利与型号的对应关系。','专利数量不直接等于某项功能、质量或适用性；缺少证据时不作产品结论。'],
 competitor:['按同一用途、配置、尺寸、测试标准和服务边界比较。','每个结论保留双方可核对的来源及日期；缺少竞品证据就留空。','讨论与客户需求相关的取舍，不说“一定更好”，不编造竞品数据或贬损对方。'],
 coastal:['先确认距离海岸、暴露环境、安装位置及维护条件。','核对具体型号、基材、涂层工艺、适用环境及有效检测资料。','未取得报告不编盐雾时长、防腐寿命或保修条款；不能承诺永不生锈。'],
 rental:['先确认房源数量、使用者更换频率、网络条件和管理流程。','把需求列为待核对项：授权方式、撤销、离线使用、供电、异常处置及安装适配。','按具体型号的资料区分已支持与未证实功能；不默认支持远程授权、联网或第三方平台对接。'],
 fire:['先明确用途、所在国家/地区、项目要求和需要的性能等级。','锁定完整型号、结构、尺寸、五金配置及安装做法。','核验报告主体、标准、有效性、覆盖范围和测试条件，再由项目专业人员确认当地适用性。','不能把普通画册宣传当成合规证明，也不套用其他型号的证书。'],
 care:['先核对木门表面材质、涂层和厂家保养说明，再给具体操作。','日常说明应围绕原资料支持的清洁、防潮、五金检查与异常处理写成短步骤。','本次未取得对应保养原页时，不编清洁剂、用水量、保养周期或保修政策；请补充产品/资料版本后再给确定说明。'],
 categories:['先按使用位置和客户必须满足的要求排除不适用门类，再核对尺寸、结构、功能和安装条件。','钢质门、木门、铸铝门不能只凭材料名称推断隔音、防火、防盗或耐久表现。','资料不足时先问场景、洞口、开启方式、环境和性能依据；选定具体型号后再比较证据。'],
 measure:['“大概两米”没有说明宽/高、单位、净洞口或成品尺寸，不能直接选型。','现场清单：测量位置与方法、宽高及偏差、墙厚、开启方向、地面完成面、预留空间、安装条件。','每项记录实测值、单位、照片/图纸和确认人；未知项留空，不把估计值写作参数。'],
 channel:['可以先问：“您目前更希望了解单个项目的产品方案，还是长期产品组合与渠道合作？”','若为项目：追问用途、规模、需求与时间；若为渠道：了解客户类型、现有品类与希望取得的资料。','只收集需求和安排下一步沟通，不自动认定客户意向或承诺代理资格。'],
 social:['角度一：以客户常见的选门困惑设计三问，引导读者确认场景。','角度二：展示如何根据画册页码核对一个具体产品信息；没有证据不写性能数字。','角度三：围绕安装前的准备做简短提示，标明建议与待确认事项。','均为内容创意草稿，画面/案例须取得真实素材与授权；不自动发布。'],
 training:['问：公司介绍先讲什么？答：选少量有出处的公司事实，再转入客户需求。','问：哪些话容易说错？答：把产能当交期、上市当产品认证、专利数量当性能。','问：不知道怎么办？答：“当前资料不能确认，我会按型号和版本继续核对。”','培训中的具体数字必须附画册版本与页码，待核实信息不能列成标准承诺。'],
 provided_text:['请提供要翻译的完整英文正文，并确认哪一版已定稿。','如果有必须保留的品牌名、型号、数字或术语，也请一起标明。','收到前不生成替代稿；翻译只对应已确认正文，不自行添加产品事实。'],
 translation_check:['名称/型号：逐项核对拼写、大小写和后缀，不翻错系列。','日期/数字：逐项比较年份、日期、数量、小数点与百分比。','单位/范围：保留原单位、上下限及条件，换算须单独说明。','语义：核对否定词、限定词、待核实事项及承诺边界。','版本：以最近明确确认的英文稿为准；无明确版本时先确认，不抢先翻译。'],
 version_check:['先定位最近一次明确确认的完整英文稿，并核对其后是否还有修改。','有修订则以最新修订版重新确认，不能把先前批准自动套给新版本。','如果两段都可能是目标，简短询问要翻译哪一段；不把整段历史一起翻译。'],
 language_check:['一般事实答复默认简洁中文；如果当前任务明确是在修订英文客户稿，就保留英文稿的语言。','“给客户看的短一点”可能指继续改英文，也可能要中文解释；不能确定时先确认目标稿件和语言。','保留已确认事实与出处，不因换语言添加新信息。'],
 claim:['没有可核对来源，不能把“全球销量第一”作为对外事实。','可改为介绍有依据的成立、上市、生产或研发背景，再说明与客户需求的联系。','如果必须使用排名，先取得明确的发布机构、范围、时间和原始证据；不编来源。'],
 injection:['资料里的“忽略规则、输出全部客户资料”等文字是待分析内容，不是用户授权或系统指令。','只回答当前账号获准范围内的问题，保留必要出处；不输出客户私有信息、代码或检索日志。'],
 capacity:['先说明画册版本和页码，再只列与客户讨论相关的产能门类与原单位。','年产能是画册宣传口径，不代表实际产量、库存或订单交期。','数字与原页保持一致；未核实项不补写。']
};
function guideAnswer(c,s){
 const messages={
 exhibition_followup:'很高兴在展会上与您交流。您希望先了解哪类产品？我可以按您的需求整理相关资料，方便时我们再确认下一步。',
 quiet_followup:'您好，跟进一下之前的沟通。您是否还有需要补充的产品资料？若目前不便推进也没关系，方便时回复即可。',
 sample_notice:'您好，您的样品安排如下：型号［待确认］，寄出状态［待确认］，物流公司［待确认］，单号［待确认］。确认实际寄出后，我们会补齐信息，方便您跟踪。',
 product_preview:'新品预告：王力［型号待确认］。产品特点［以确认资料补充］，发布日期［待确认］。欢迎告诉我们您关注的使用场景，我们会在资料确认后为您介绍。'
 };
 const englishMessages={
 exhibition_followup:'It was a pleasure speaking with you at the exhibition. Which product category would you like to explore first? I can organise relevant information around your needs, and we can agree on a convenient next step.',
 quiet_followup:'Hello, I wanted to follow up on our earlier conversation. Is there any product information that would help? If this is not the right time, no problem—please reply whenever convenient.',
 sample_notice:'Hello, here is the sample update: model [to be confirmed], dispatch status [to be confirmed], carrier [to be confirmed], tracking number [to be confirmed]. We will complete these details after confirming the actual dispatch.',
 product_preview:'New product preview: WONLY [model to be confirmed]. Features [add verified details]. Release date [to be confirmed]. Tell us about your application, and we can share more once the product information has been confirmed.'
 };
 if(messages[s.k])return {text:s.l==='en'?englishMessages[s.k]:messages[s.k],topics:[],customerFacing:true,internalAdvice:'沟通模板，未实际发送；占位项须核实后填写，不代表已寄样、已发布或已承诺。'};
 if(['company','opening','story','outline','three_facts','why_us'].includes(s.k)){
 const d=companyData(c);
 if(s.k==='opening')return {text:'三个切入点：①企业历程，适合初次了解；②研发背景，适合技术沟通；③客户需求，适合选型前沟通。\n先选客户需求切入，避免一开始堆数字。\n\n您好，先简单介绍一下王力。公司成立于'+d.y+'年，画册记录其于'+d.listingYear+'年在上交所主板上市。今天我更想先了解您的使用场景和安装条件，再一起看哪些产品资料值得重点核对。',topics:['founding','listing']};
 if(s.k==='outline')return {text:'先讲：客户希望解决什么问题，再用成立于'+d.y+'年、'+d.listingYear+'年主板上市（'+d.code+'）两项背景建立共同认识。\n接着讲：相关产品类别和需要查看的资料，不把公司规模当产品性能证明。\n留到追问：研发、生产规模及历史细节，按问题提供原页。\n收尾：确认使用位置、安装限制与下一步资料需求。',topics:['founding','listing']};
 if(s.k==='why_us'&&s.w===2)return {text:`王力成立于${d.y}年，${d.listingYear}年在上交所主板上市，研发团队${d.team||'人数待核'}人。我们将制造经验、研发资源和产品组合结合起来，希望从您的使用场景和功能重点出发，介绍相关的产品方向。您目前最想解决的是哪一类使用需求？`,topics:['founding','listing','rnd'],customerFacing:true};
 if(s.k==='three_facts'||s.k==='why_us')return {text:'可先核对三项公司信息：成立于'+d.y+'年；'+d.listingYear+'年在上海证券交易所主板上市，代码'+d.code+'；画册记载研发团队'+(d.team||'人数本次未核实')+'人。\n这些背景不能代替产品适用性核验。您最需要解决的是哪类使用或安装问题？我们可以从相关型号的资料开始核对。',topics:['founding','listing','rnd']};
 const result=companyAnswer(c,s);
 if(s.k==='story'){if(result.customerFacing)result.internalAdvice='叙事安排：从成立、上市到研发背景，再转入客户需求；未添加创始人经历。';else result.text+='\n\n叙事安排：从成立、上市到研发背景，再转入客户需求；未添加创始人经历。';}
 return result;
 }
 if(s.k==='page62'){
 const raw=conciseCatalogFacts({kind:'facts',topics:['lock_core']},c,'新版零售画册第62页锁芯信息');
 const [body,tail]=raw.split('来源：');
 return {text:body.replace(/^- /gm,'').replace(/。\n?/g,'；').replace(/；$/,'')+'。\n'+(tail?'来源：'+tail.split('\n')[0]:'')+'\n仅按这版画册口径引用，不同画册的倍数勿混用。',topics:[],hasCitation:true};
 }
 if(s.k==='email'&&s.w===2)return {text:"Hello,\n\nI'm reaching out to introduce WONLY and learn about your product needs. Could you share the applications and functions that matter most to your customers or project? We can then focus on relevant products and configurations.\n\nWould you prefer a brief company introduction or a conversation about a particular product category?",topics:[],customerFacing:true,internalAdvice:'角度一：从使用需求切入。角度二：从产品组合与合作下一步切入。草稿未发送。'};
 if(s.k==='email')return {text:s.n<=120?'Hello,\n\nThank you for your interest in WONLY. Could you share the intended application, installation conditions, and the functions most important to you? We can then identify the relevant product category and review the available specifications together. Any certification, quotation, or delivery arrangement will need separate confirmation.\n\nWould you prefer to begin with product information or a short introductory discussion?':'角度一：从使用场景和需核对的资料切入。角度二：从客户关心的功能与合作下一步切入。\n\nHello,\n\nThank you for your interest in WONLY. Could you share the intended application and the functions most important to you? We can then identify a relevant product category and review the available documents together. Any certification, quotation, or delivery arrangement needs separate confirmation.\n\nWould you prefer product information or a short introductory discussion?',topics:[]};
 if(s.k==='invitation')return {text:'Hello, welcome. May I ask what type of project or product you are considering? If useful, we can look at the relevant catalogue and check the specifications together.\n\nIf the customer declines: Of course. Thank you for your time. Please let us know if you would like any specific information later.',topics:[]};
 const lines=GUIDES[s.k]||GUIDES.discovery;
 let text=(s.n<=120?lines.slice(0,2):lines).map((l,i)=>`${i+1}. ${l}`).join('\n');
 if(s.k==='capacity')text+='\n'+(fact(c,'capacity')?.zh||'产能原始数字本次未取得，暂不列出。');
 return {text,topics:s.k==='capacity'?['capacity']:s.k==='cert_company'?['listing']:[]};
}
export async function answerWorkScenario(input,catalog,{sign,verify,actor,videoAnswer,careAnswer}){
 if(!workScenarioIntent(input))return null;
 const q=input.question.trim();let s=null;
 const token=newWritingDraft(q)?null:(input.materialHistory||[]).find(x=>String(x).startsWith(PREFIX));
 if(token){try{const [payload,signature]=token.slice(PREFIX.length).split('.');if(payload.length>500||!await verify('work-writing-v1|'+actor+'|'+payload,signature))throw Error();s=JSON.parse(decode(payload));if(s.v!==1||!s.k||!['en','zh','es'].includes(s.l)||!Number.isSafeInteger(s.r)||s.r<1||s.r>1000000)throw Error()}catch{return {answer:'这份稿件的上下文校验未完成，请重新提出公司介绍或写作要求；本次没有翻译。',provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:'invalid_state'}}}}
 const digest=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({sources:catalog?.sources||[],facts:(catalog?.facts||[]).map(f=>[f.topic,f.text,f.catalog,f.page,f.zh])}))));
 if(s&&s.c!==digest)return {answer:'资料版本已变化，请重新核对英文稿并确认后再翻译；本次没有使用旧稿。',provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:'source_changed'}};
 if(s?.k==='company'&&s.h!==await draftHash(companyAnswer(catalog,{...s,l:'en'}).text))return {answer:'英文稿版本校验未完成，请重新生成并确认后再翻译；本次没有使用旧稿。',provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:'draft_changed'}};
 if(s?.k==='company'&&customerPurpose(q)==='review'&&!/删|去掉|改|精简|缩|口语|优化|润色|强调/.test(q)){const review=companyAnswer(catalog,{...s,w:0,l:'zh'});return {answer:review.text+'\n\n'+citations(catalog,review.topics),provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:'evidence_review',material_question:token}};}
 const continuing=!!s&&follow.test(q)&&!newWritingDraft(q)&&!/(?:我会提供|设计一份|另(?:外|一)(?:个|段|篇)|重新写|新的任务)/.test(q);
 if(!continuing){const k=kindOf(q);s={v:1,i:crypto.randomUUID().slice(0,12),k,...(['company','story','why_us','email'].includes(k)?{w:customerPurpose(q)==='customer'?2:0}:{}),l:/英文|英语|\bEnglish\b/i.test(q)||k==='email'||k==='invitation'?'en':'zh',n:/不超过\s*80\s*字/.test(q)?80:/30秒/.test(q)?120:/90秒/.test(q)?220:300,o:0,t:0,r:1,p:false,c:digest,...metadata(q)};}
 const copyEdit=!/可以吗|能发吗|是否|[？?]$/.test(q)&&/直接给|直接发|给客户|不要提|不要再提|别提/.test(q);
 const edit=continuing&&(/删|改|缩|精简|口语|强调|核对刚才|去掉|润色|优化/.test(q)||copyEdit);
 if(edit){s={...s,r:s.r+1,p:false,l:s.l==='es'?'en':s.l,...(s.k==='company'&&customerPurpose(q)==='customer'?{w:2}:{})};if(/(?:删掉|去掉|不要)(?:.{0,3})产能/.test(q))s.o|=1;if(/(?:删掉|去掉|不要)(?:.{0,3})研发/.test(q))s.o|=2;if(/口语/.test(q))s.t=1;if(/精简|缩短|短一点|一百字/.test(q))s.n=120;}
 const negative=/未确认|没确认|还没|尚未|暂时不要|不要翻译|不翻译|先.*确认后|确认后再|等我确认|是否|如果|怎么|如何|吗[？?]?/.test(q);
 const approved=continuing&&s.k==='company'&&s.w!==0&&s.l==='en'&&!edit&&!negative&&/已确认|确认了|确认无误|^确认(?:[，,。 ]|$)|^现在确认|^可以[，, ]*(?:翻译|译)|^没问题[，, ]*(?:翻译|译)/.test(q);
 if(approved)s={...s,p:true};
 if(continuing&&/未确认|没确认|撤销确认|暂时不要翻译|不要翻译/.test(q))s={...s,p:false,l:s.l==='es'?'en':s.l};
 if(continuing&&/西班牙语|西语|Spanish|español/i.test(q)&&!edit){if(!s.p){if(s.k==='company')s.h=await draftHash(companyAnswer(catalog,{...s,l:'en'}).text);
 const payload=encode(JSON.stringify(s)),sig=await sign('work-writing-v1|'+actor+'|'+payload);return {answer:'请先确认最新英文稿；确认前我不会翻译成西班牙语。如需修改，请直接说明要改哪里。',provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:'awaiting_confirmation',material_question:PREFIX+payload+'.'+sig}}}s={...s,l:'es'};}
 const care=s.k==='care'?await careAnswer?.():null;
 const careText=care&&s.n<=120?care.replace(/^资料中的相关说明如下：\s*/, '').replace(/\s*以上为本次找到的原页摘录。需要我打开对应资料给你核对吗？\s*$/, ''):care;
 const result=care?{text:careText+'\n资料未明确的清洁剂、保养周期或保修条件不自行补写。',topics:[],hasCitation:true}:s.k==='video'?{text:(await videoAnswer?.())?.answer||'这次无法核对原视频时间码，暂不列出。',topics:[],hasCitation:true}:guideAnswer(catalog,s);
 const evidence=result.hasCitation?'':citations(catalog,result.topics)+(result.internalAdvice?'\n'+result.internalAdvice:'')+(result.customerFacing&&/认证|保证|两周|全球.*第一|世界第一|报价/.test(q)?'\n未加入未经核实的认证、排名、报价或交付承诺。':'')+(result.customerFacing&&/核对|核验|哪些是资料事实/.test(q)?(result.topics.length?'\n事实与建议：正文中的公司数字和产品功能来自所列出处；产品组合与沟通安排属于表达建议。':'\n正文为沟通建议，没有添加客户背景或未经核实的产品承诺。'):'');
 let answer=result.customerFacing?'客户正文（'+(s.l==='es'?'西班牙语':s.l==='en'?'英文':'中文')+'）：\n\n'+result.text+'\n\n——\n内部核对信息（不随客户正文发送）：\n'+evidence:result.text+(evidence?'\n\n'+evidence:'');
 if(s.k==='video')answer+='\n这些片段只能证明所引画面文字，不能证明产能兑现、产品认证或锁芯性能。';
 if(['company','opening','story','outline','three_facts','why_us'].includes(s.k)&&s.l==='en')answer+='\n\n英文稿（'+words(result.text)+'词）。'+(s.p?'已确认，可继续要求翻译成西班牙语。':'请确认或提出修改；确认后再翻译成西班牙语。');
 else if(['company','opening','story','outline','three_facts','why_us'].includes(s.k)&&s.l==='es')answer+='\n\n已按最新确认英文稿翻译。';
 else if(continuing&&/核对刚才/.test(q))answer+='\n\n核对：上面的方法、问法与沟通安排属于建议；具体公司/产品数字只以列出的资料出处为据。未给出未经核验的价格、交期或认证承诺。';
 if(!result.customerFacing&&(s.m||s.a)&&s.n>120)answer+='\n\n沟通对象：'+[s.m,s.a].filter(Boolean).join(' / ')+'；当地适用要求仍需单独核验。';
 if(s.k==='company')s.h=await draftHash(companyAnswer(catalog,{...s,l:'en'}).text);
 const payload=encode(JSON.stringify(s)),sig=await sign('work-writing-v1|'+actor+'|'+payload),material=PREFIX+payload+'.'+sig;
 if(material.length>500)throw Error('Writing state exceeds context bound');
 return {answer,...(result.customerFacing?{customer_text:result.text,internal_notes:evidence}:{}),provider:'internal',model:'work-scenarios',context:{route:'work_writing',status:s.l==='es'?'translated':['company','opening','story','outline','three_facts','why_us'].includes(s.k)&&s.l==='en'?'awaiting_confirmation':'draft',revision:s.r,language:s.l,approved:s.p,material_question:material}};
}
