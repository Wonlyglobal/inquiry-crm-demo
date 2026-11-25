// Customer-facing language is separate from the internal evidence and workflow notes.
// Only server-loaded facts are used; no model call or external transmission.
import {writingPrimaryTask} from './writing-request.mjs';
const fact=(c,t)=>(c?.facts||[]).find(f=>f.topic===t&&f.catalog==='c2')||(c?.facts||[]).find(f=>f.topic===t);
export function customerPurpose(q){
 q=writingPrimaryTask(q);
 if(/(?:不要|不用|先不).{0,5}(?:写|生成).{0,8}(?:介绍|文案)/.test(q))return 'review';
 // A request to keep evidence notes out of customer copy is still a writing request.
 const customerDraft=/(?:写|起草|生成|准备).{0,35}(?:介绍|正文|文案).{0,12}(?:发客户|给客户)|(?:给客户|客户正文|直接发).{0,18}(?:写|介绍|文案)/.test(q);
 const reviewed=q.replace(/(?:避免|不要|不用|不必|别)提.{0,30}(?:内部核对|核验|查证|审查)(?:过程|说明)?/g,'');
 if(/(?:^(?:请|先)?(?:仅|只)?内部|(?:仅|只)做内部).{0,5}(?:核对|核验|查证|审查)/.test(reviewed)||
  !customerDraft&&/(?:内部|仅|只).{0,5}(?:核对|核验|查证|审查)/.test(reviewed))return 'review';
 return /核对|核验|查证|审查/.test(q)&&!/给客户|客户正文|直接发|写|改写|文案/.test(q)?'review':'customer';
}
function portfolio(c){
 const available=new Set((c?.products||[]).map(p=>p.category));const text=String(fact(c,'capacity')?.text||'');
 const list=[['security_door',/steel doors|security doors/i,'security doors','puertas de seguridad','防盗门'],['smart_lock',/smart locks/i,'smart locks','cerraduras inteligentes','智能锁'],['wooden_door',/wooden doors/i,'wooden doors','puertas de madera','木门']].filter(([k,re])=>available.has(k)||re.test(text));
 return {en:list.length?list.map(p=>p[2]).join(', '):'doors and locks',es:list.length?list.map(p=>p[3]).join(', '):'puertas y cerraduras',zh:list.length?list.map(p=>p[4]).join('、'):'门锁产品'};
}
function bases(c){const f=fact(c,'bases');const text=String(f?.text||'');const n=['Yongkang','Wuyi','Sichuan','Hangzhou','Hubei'].filter(x=>text.toLowerCase().includes(x.toLowerCase())).length;return n===5?5:null}
const englishWords=text=>text.match(/\b[A-Za-z][A-Za-z’'-]*\b/g)?.length||0;
function fitEnglishDraft(groups,budget){
 // Choose whole EN/ES paragraph pairs. Both languages use the same selection.
 let choices=new Map([[0,[]]]);
 for(const group of groups){
  const next=new Map();
  for(const [size,chosen] of choices)for(const pair of group){
   const count=size+(pair?englishWords(pair[0]):0);
   if(count<=budget&&!next.has(count))next.set(count,pair?[...chosen,pair]:chosen);
  }
  choices=next;
 }
 return choices.get(Math.max(...choices.keys()))||[];
}
export function customerCompanyAnswer(c,s,d){
 if(!d.y||!d.listingYear||!d.code)return {text:'本次未能核对公司介绍所需的成立与上市资料，暂时不能生成可对外使用的介绍。',topics:[],customerFacing:false};
 const p=portfolio(c),base=bases(c),remote=!!fact(c,'remote_sensing');
 if(s.l==='zh'){
 if(s.n<=80)return {text:`王力成立于${d.y}年，${d.listingYear}年在上交所主板上市，产品涵盖${p.zh}。欢迎交流您的使用场景和产品需求。`,topics:['founding','listing','capacity'],customerFacing:true};
 const lines=[`王力成立于${d.y}年，${d.listingYear}年在上海证券交易所主板上市，股票代码${d.code}，产品涵盖${p.zh}。`,
 '我们的优势来自持续积累的制造经验、研发资源和多品类产品组合。对经销商而言，不同品类可以围绕客户需求形成相互补充的产品布局；对项目客户而言，也能从使用位置、设计风格和功能需求出发，选择适合进一步了解的产品。',
 !(s.o&2)&&d.investment&&d.team?`王力每年研发投入超过${Number(d.investment)*100}万元，拥有${d.team}人的研发团队，为产品开发提供持续的技术资源。`:'',
 !(s.o&1)&&base?`我们在中国布局${base}个生产基地，将研发与多品类制造资源相结合。`:'',
 remote?'部分智能锁型号提供远感识别功能，为关注日常通行便利的客户增加选择。':'',
 '我们重视从您的实际需求开始沟通：了解产品的使用场景、安装条件、功能重点以及当地市场偏好，再介绍相关产品和可选择的配置。无论您正在拓展经销业务，还是为具体项目寻找产品，都欢迎与我们交流。让我们从您的客户和项目需求出发，探讨合适的产品方向与合作机会。'].filter(Boolean);
 return {text:(s.n<=120?lines.slice(0,2):lines).join('\n\n'),topics:['founding','listing','capacity',...(!(s.o&2)&&d.investment&&d.team?['rnd']:[]),...(!(s.o&1)&&base?['bases']:[]),...(remote?['remote_sensing']:[])],customerFacing:true};
 }
 const intro=s.t?'Thank you for meeting with us. Let me give you a brief introduction to WONLY.':'Thank you for the opportunity to introduce WONLY.';
 const esIntro=s.t?'Gracias por reunirse con nosotros. Permítame presentarles brevemente WONLY.':'Gracias por la oportunidad de presentar WONLY.';
 const pairs=[
 [intro+` Founded in ${d.y}, WONLY is a Chinese door and lock manufacturer with an established manufacturing background. The company was listed on the main board of the Shanghai Stock Exchange in ${d.listingYear}, under stock code ${d.code}.`,` ${esIntro} Fundada en ${d.y}, WONLY es una empresa china fabricante de puertas y cerraduras con una trayectoria consolidada en fabricación. La empresa comenzó a cotizar en el mercado principal de la Bolsa de Shanghái en ${d.listingYear}, con el código bursátil ${d.code}.`.trim(),['founding','listing']],
 [`Our product portfolio includes ${p.en}. This range gives distributors opportunities to build a complementary product offering under one brand. It also gives project teams different categories to explore for entrances and interior spaces, according to the needs of each application. By bringing these categories together, we can make the initial product conversation easier to structure and help you focus on the features and product combinations that matter to your business.${remote?' Selected smart-lock models offer remote-sensing recognition, adding an option for customers who value convenient access in their daily routines.':''}`,`Nuestra gama de productos incluye ${p.es}. Esta variedad permite a los distribuidores desarrollar una oferta de productos complementarios bajo una misma marca. También ofrece a los equipos de proyecto distintas categorías para entradas y espacios interiores, según las necesidades de cada aplicación. Al reunir estas categorías, podemos estructurar mejor la conversación inicial y centrarnos en las características y combinaciones de productos más relevantes para su negocio.${remote?' Determinados modelos de cerraduras inteligentes ofrecen reconocimiento por detección a distancia, una opción para quienes valoran la comodidad de acceso en su día a día.':''}`,['capacity',...(remote?['remote_sensing']:[])]],
 ];
 if(!(s.o&2)&&d.investment&&d.team)pairs.push([`Research and development is central to our business. Annual R&D investment exceeds RMB ${d.investment} million, supported by a team of ${d.team} people. These resources bring engineering expertise to product development and connect our experience in door manufacturing with the development of smart-lock products.`,`La investigación y el desarrollo ocupan un lugar central en nuestra actividad. La inversión anual en I+D supera los ${d.investment} millones de yuanes, con un equipo de ${d.team} personas. Estos recursos aportan conocimientos de ingeniería al desarrollo de productos y vinculan nuestra experiencia en la fabricación de puertas con el desarrollo de cerraduras inteligentes.`,['rnd']]);
 if(!(s.o&1)&&base)pairs.push([`Our manufacturing network includes ${base} production bases across China. Together with our development resources and product range, this footprint forms an important part of the WONLY business. For potential partners, it provides a foundation for discussions about product selection and the development of a suitable market offering.`,`Nuestra red de fabricación cuenta con ${base} bases de producción en China. Junto con nuestros recursos de desarrollo y nuestra gama de productos, esta estructura constituye una parte importante de WONLY. Para los posibles socios, ofrece una base para conversar sobre la selección de productos y una oferta adecuada para su mercado.`,['bases']]);
 pairs.push(['We start by understanding your customers or project: where the product will be used, the design you prefer, the installation conditions, and the functions that matter most. We can then introduce relevant products and discuss the available configurations, keeping the conversation focused on your priorities.','Comenzamos por conocer a sus clientes o su proyecto: dónde se utilizará el producto, el diseño que prefiere, las condiciones de instalación y las funciones más importantes. A partir de ahí, podemos presentar productos relevantes y conversar sobre las configuraciones disponibles, centrándonos en sus prioridades.',[]]);
 pairs.push(['Whether you are expanding a distribution business or exploring products for a specific project, we welcome the opportunity to learn more about your needs. Tell us about your market and application, and let us explore the product categories and cooperation opportunities most relevant to you.','Tanto si está ampliando un negocio de distribución como si busca productos para un proyecto concreto, nos gustaría conocer sus necesidades. Cuéntenos acerca de su mercado y aplicación para explorar las categorías de productos y las oportunidades de colaboración más relevantes para usted.',[]]);
 const briefPortfolio=[`We offer ${p.en} for distributors and project teams.`,`Ofrecemos ${p.es} para distribuidores y equipos de proyecto.`,['capacity']];
 const briefIntro=[`Founded in ${d.y}, WONLY is a Chinese door and lock manufacturer. We listed on the Shanghai Stock Exchange in ${d.listingYear}, under stock code ${d.code}.`,`Fundada en ${d.y}, WONLY es un fabricante chino de puertas y cerraduras. Cotizamos en la Bolsa de Shanghái desde ${d.listingYear}, con el código bursátil ${d.code}.`,['founding','listing']];
 const briefClose=['We welcome the opportunity to discuss your market and product needs and to identify suitable options for your customers or projects.','Nos gustaría conocer su mercado y sus necesidades para identificar opciones adecuadas para sus clientes o proyectos.',[]];
 const shown=s.b?fitEnglishDraft([[pairs[0],briefIntro],[pairs[1],briefPortfolio],...pairs.slice(2,-1).map(pair=>[pair,null]),[pairs.at(-1),briefClose,null]],s.b):s.n<=120?pairs.slice(0,2):s.n<=220?pairs.slice(0,4):pairs;
 return {text:shown.map(p=>p[s.l==='es'?1:0]).join('\n\n'),topics:[...new Set(shown.flatMap(p=>p[2]))],customerFacing:true};
}
