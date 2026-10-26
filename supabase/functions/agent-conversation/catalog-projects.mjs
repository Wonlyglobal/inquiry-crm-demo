// Search the complete private catalogue page index; never hard-code company projects.
// Geography is a search aid, not proof that an adjacent project belongs to a country.
const AFRICA=[
 ['非洲','Africa'],['埃及','Egypt'],['阿尔及利亚','Algeria'],['安哥拉','Angola'],['贝宁','Benin'],['博茨瓦纳','Botswana'],['布基纳法索','Burkina Faso'],['布隆迪','Burundi'],['佛得角','Cabo Verde','Cape Verde'],['喀麦隆','Cameroon'],['中非','Central African Republic'],['乍得','Chad'],['科摩罗','Comoros'],['刚果','Congo'],['科特迪瓦','Ivory Coast',"Cote d'Ivoire"],['吉布提','Djibouti'],['赤道几内亚','Equatorial Guinea'],['厄立特里亚','Eritrea'],['斯威士兰','Eswatini','Swaziland'],['埃塞俄比亚','Ethiopia'],['加蓬','Gabon'],['冈比亚','Gambia'],['加纳','Ghana'],['几内亚','Guinea'],['几内亚比绍','Guinea-Bissau'],['肯尼亚','Kenya'],['莱索托','Lesotho'],['利比里亚','Liberia'],['利比亚','Libya'],['马达加斯加','Madagascar'],['马拉维','Malawi'],['马里','Mali'],['毛里塔尼亚','Mauritania'],['毛里求斯','Mauritius'],['摩洛哥','Morocco'],['莫桑比克','Mozambique'],['纳米比亚','Namibia'],['尼日尔','Niger'],['尼日利亚','Nigeria'],['卢旺达','Rwanda'],['圣多美和普林西比','Sao Tome'],['塞内加尔','Senegal'],['塞舌尔','Seychelles'],['塞拉利昂','Sierra Leone'],['索马里','Somalia'],['南非','South Africa'],['南苏丹','South Sudan'],['苏丹','Sudan'],['坦桑尼亚','Tanzania'],['多哥','Togo'],['突尼斯','Tunisia'],['乌干达','Uganda'],['赞比亚','Zambia'],['津巴布韦','Zimbabwe']
];
const REGIONS=[
 {names:['非洲','Africa'],countries:AFRICA.slice(1)},
 {names:['欧洲','Europe'],countries:[['法国','France'],['德国','Germany'],['英国','United Kingdom','Britain'],['意大利','Italy'],['西班牙','Spain'],['葡萄牙','Portugal'],['荷兰','Netherlands'],['比利时','Belgium'],['波兰','Poland'],['希腊','Greece'],['瑞士','Switzerland'],['奥地利','Austria'],['瑞典','Sweden'],['挪威','Norway'],['芬兰','Finland'],['丹麦','Denmark'],['爱尔兰','Ireland'],['罗马尼亚','Romania'],['塞尔维亚','Serbia'],['乌克兰','Ukraine'],['白俄罗斯','Belarus']]},
 {names:['中东','Middle East'],countries:[['阿联酋','United Arab Emirates','UAE','Dubai','迪拜'],['沙特','Saudi Arabia'],['卡塔尔','Qatar'],['科威特','Kuwait'],['阿曼','Oman'],['巴林','Bahrain'],['约旦','Jordan'],['伊拉克','Iraq'],['伊朗','Iran'],['黎巴嫩','Lebanon'],['以色列','Israel'],['巴勒斯坦','Palestine'],['叙利亚','Syria'],['也门','Yemen']]},
 {names:['亚洲','Asia'],countries:[['中国','China'],['新加坡','Singapore'],['马来西亚','Malaysia'],['印度尼西亚','Indonesia'],['泰国','Thailand'],['越南','Vietnam'],['菲律宾','Philippines'],['柬埔寨','Cambodia'],['缅甸','Myanmar'],['老挝','Laos'],['印度','India'],['巴基斯坦','Pakistan'],['孟加拉','Bangladesh'],['斯里兰卡','Sri Lanka'],['尼泊尔','Nepal'],['日本','Japan'],['韩国','South Korea'],['蒙古','Mongolia'],['哈萨克斯坦','Kazakhstan'],['乌兹别克斯坦','Uzbekistan']]},
 {names:['北美','North America'],countries:[['美国','United States','USA'],['加拿大','Canada'],['墨西哥','Mexico']]},
 {names:['南美','South America'],countries:[['巴西','Brazil'],['阿根廷','Argentina'],['智利','Chile'],['秘鲁','Peru'],['哥伦比亚','Colombia'],['厄瓜多尔','Ecuador'],['玻利维亚','Bolivia'],['乌拉圭','Uruguay'],['委内瑞拉','Venezuela']]},
 {names:['大洋洲','Oceania'],countries:[['澳大利亚','Australia'],['新西兰','New Zealand'],['斐济','Fiji'],['巴布亚新几内亚','Papua New Guinea']]}
];
const PROJECT=/标杆|地标|案例|项目业绩|工程业绩|项目案例|工程案例|(?:哪些|什么|举|列|介绍|查询|查看).{0,16}项目|\b(?:landmarks?|reference projects?|project cases?|benchmark projects?)\b/i;
const PAGE_PROJECT=/项目案例|案例项目|标杆|地标|工程业绩|\b(?:projects|landmarks?|references|case studies)\b/i;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const has=(s,w)=>new RegExp(/[A-Za-z]/.test(w)?`(?<![A-Za-z])${escape(w)}(?![A-Za-z])`:escape(w),'i').test(s);
export function projectQuestion(question){
 const q=String(question||'').normalize('NFKC').slice(0,500);
 if(/选型|适合|推荐/.test(q)&&!/标杆|地标|案例|项目业绩|工程业绩/.test(q))return false;
 if(/代码|编程|算法|诉讼|医学/.test(q)&&!/王力|我司|wonly|画册/i.test(q))return false;
 return PROJECT.test(q)&&!(/客户|询盘|商机|合同|报价|我的项目|竞品|对手/.test(q)&&! /画册/.test(q));
}
export function projectTurn(question,history=[]){
 const q=String(question||'').trim(),prior=String(history.at(-1)||'');
 if(projectQuestion(q))return q;
 if(projectQuestion(prior)&&q.length<=80&&/^(那|还有|非洲|埃及|来源|出处|页码|展开|详细)/.test(q)){
  if(/非洲|Africa/i.test(q))return `画册 非洲标杆项目 ${q}`;
  return `${prior} ${q}`.slice(0,500);
 }
 return null;
}
export function projectIntent(question){
 if(!projectQuestion(question))return null;
 const q=String(question).slice(0,500),regions=REGIONS.filter(r=>r.names.some(w=>has(q,w)));
 const countries=REGIONS.flatMap(r=>r.countries).filter(words=>words.some(w=>has(q,w)));
 const requested=[...regions.flatMap(r=>[r.names,...r.countries]),...countries];
 return {kind:'projects',geography:regions.length?regions.map(r=>r.names[0]).join('、'):countries.map(r=>r[0]).join('、'),terms:[...new Set(requested.flat())]};
}
export function projectEvidence(intent,catalog){
 const sourceIds=new Set((catalog?.sources||[]).map(s=>s.id));
 const rows=(catalog?.pages||[]).filter(p=>sourceIds.has(p.catalog)&&Number.isInteger(p.page)&&p.page>0&&typeof p.text==='string');
 const facts=(catalog?.facts||[]).filter(f=>f.topic==='landmarks'&&sourceIds.has(f.catalog)&&Number.isInteger(f.page)&&typeof f.text==='string');
 const all=[...rows,...facts];const seen=new Set(),hits=[];
 for(const p of all){
  const text=p.text.slice(0,40000),fact=facts.includes(p),projectPage=fact||PAGE_PROJECT.test(text)||facts.some(f=>f.catalog===p.catalog&&f.page===p.page);
  if(!projectPage)continue;
  const terms=intent.terms.filter(w=>has(text,w));if(intent.terms.length&&!terms.length)continue;
  // Keep whole source lines around the geography marker. Do not assign adjacent rows to it.
  const lines=text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const indexes=terms.length?lines.map((s,i)=>terms.some(w=>has(s,w))?i:-1).filter(i=>i>=0):lines.map((s,i)=>i);
  for(const i of indexes){
   const quote=lines.slice(i>0&&PAGE_PROJECT.test(lines[i-1])?i-1:i,i+1).join('\n').slice(0,1200);
   const key=p.catalog+'|'+p.page+'|'+quote;if(seen.has(key))continue;seen.add(key);
   hits.push({catalog:p.catalog,page:p.page,quote,geography:terms.filter(w=>has(lines[i],w))});
  }
 }
 return {hits,coverage:{sources:sourceIds.size,indexed_pages:new Set(rows.map(p=>p.catalog+'|'+p.page)).size,declared_pages:(catalog?.sources||[]).reduce((n,s)=>n+(Number.isInteger(s.pages)?s.pages:0),0),matched_excerpts:hits.length}};
}
export function projectAnswer(intent,catalog,{ref,head,note}){
 if(!catalog)return '本次未能读取公司私有画册索引，尚未完成项目证据检索，不能判断有无相关项目。';
 const {hits,coverage}=projectEvidence(intent,catalog);
 const c=`检索范围：已扫描全部 ${coverage.sources} 本已授权画册索引、${coverage.indexed_pages} 个已索引页面（原册登记 ${coverage.declared_pages||'未标注'} 页）；索引覆盖不等于全部原页均已解析。`;
 const body=hits.length?hits.slice(0,12).map(p=>`- ${ref(p.catalog,p.page)}\n原页文字线索：\n${p.quote}`).join('\n\n'):'本次已索引文字没有检出对应项目证据。这是检索缺口，不能据此说公司没有这些项目；图片文字、未索引页或其他版本仍需核对。';
 return [head(catalog),c,`按${intent.geography||'项目'}查得 ${hits.length} 条原页线索${hits.length>12?'，本次展示前12条':''}：`,body,'项目名称与国家/地区的对应关系须对照同页版式核实；相邻文字不能自动视为同一项目。画册记录不证明当前履约状态或获准对外引用。',note].join('\n\n');
}
