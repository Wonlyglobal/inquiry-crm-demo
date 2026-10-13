const DAY = 86400000;

const PUBLIC_EVENT_METRICS = [
  ["每年","2026 预告",248,10000,"品牌 / 预计专业观众"],
  ["每两年","2024 实际",1351,94680,"BATIMAT 单展独立观众"],
  ["每年","2026 预告",500,25000,"参展品牌 / 预计行业人士"],
  ["每年","2025 预告",200,null,"同期展合计；观众未披露"],
  ["每年","2025 宣传口径",150,9000,"预计规模"],
  ["每两年","2024 实际",560,46737,"四个同期展合计"],
  ["每年","原规划资料",500,300000,"预计值，待主办方复核"],
  ["每年","2025 实际",2866,85093,"全球展商 / 全球到场人次"],
  ["每年","2026 预告",650,45000,"预计行业人士"],
  ["每年","原规划资料",320,15000,"同期多展宣传口径"],
  ["每年","2025 实际",548,33618,"东京展"],
  ["每年","原规划资料",700,18000,"待主办方复核"],
  ["每年","原规划资料",1450,120000,"单站或系列合计待复核"],
  ["每两年","2025 实际",2230,180000,"专业观众"],
  ["每年","2025 实际",1800,81000,"IBS 单展"],
  ["每年","原规划资料",900,85000,"待主办方复核"],
  ["每年","2025 实际",418,17000,"官方新闻口径"],
  ["每年","2025 实际",1300,80748,"展商为会前口径；观众为会后实际"],
  ["每年","原规划资料",null,43000,"第 49 届宣传口径"],
  ["每年","原规划资料",null,null,"约 55,000㎡；人数待官网补充"],
  ["每年","原规划资料",708,24753,"宣传口径"],
  ["每年","原规划资料",1300,"60,000–80,000","宣传区间"],
  ["每两年","原规划资料","415–550",31600,"国际品牌 / 专业观众"],
  ["2027 两期","2026 预告",1100,null,"参展企业；观众未披露"],
  ["每年","原规划资料",600,30000,"同期联动展宣传口径"],
  ["每年","原规划资料",300,12000,"参展企业 / 专业观众"],
  ["每年","原规划资料",900,34000,"宣传口径"],
  ["2027 两期","2026 预告",1100,null,"参展企业；观众未披露"],
  ["每两年","2026 实际",519,null,"41 个国家 / 地区；观众数据待会后公布"],
  ["每年","2026 实际",1180,44764,"上届实际；来自 151 个国家 / 地区"],
  ["每年","2026 实际",750,29000,"参展品牌 / 安防专业人士"],
  ["每年","2027 预告",450,18500,"全球展商 / 欧洲安防专业人士"],
  ["每年","官方未披露",null,null,"锁匠与实体安防专业展；规模待主办方公布"],
];

const EVENT_LOGOS = [
  "bex.ico","batimat.ico","acetech.png","uzstroy.png","big5-global.png","construtec.ico","acetech.png","big5-global.png","london-build.ico","melbourne-build.ico","japan-build.ico","buildings-show.ico","acetech.png","bau.ico","ibs.ico","worldbex.png","uzbuild.ico","mosbuild.ico","turkeybuild.webp","architect.png","sydney-build.ico","batimatec.png","expoconstruccion.ico","big5-global.png","hotel-show.svg","big5-global.png","archidex.png","big5-global.png",
  "security-essen.svg","intersec.svg","isc-west.ico","security-event.ico","aloa.svg",
];

const REGISTRATION_DETAILS = {
  "Intersec Global 2027":{open:true,note:"观众注册已开放；官网未公布截止日"},
  "ISC West 2027":{open:true,note:"官网已开放意向登记；未公布截止日"},
  "The Security Event Europe 2027":{open:true,note:"观众意向登记已开放；未公布截止日"},
  "ALOA Convention & Security Expo 2027":{open:false,note:"主办方预计 2027 年春季公布报名信息"},
};

export const EXHIBITION_EVENTS = [
  ["2026-09-02","2026-09-04","BEX Asia","新加坡","新加坡","亚洲","建筑与绿色建筑","https://www.bex-asia.com/",false],
  ["2026-09-28","2026-10-01","BATIMAT","巴黎","法国","欧洲","建筑与建材","https://www.batimat.com/",false],
  ["2026-10-09","2026-10-11","ACETECH Bangalore","班加罗尔","印度","亚洲","建筑与建材","https://acetechexpo.com/",false],
  ["2026-10-20","2026-10-22","UzStroyExpo","塔什干","乌兹别克斯坦","亚洲","建筑与五金","https://www.uzexpocentre.uz/en/news/international-exhibitions-uzenergyexpo-2025-and-uzstroyexpo-2025",false],
  ["2026-10-21","2026-10-23","Big 5 Construct Kenya","内罗毕","肯尼亚","中东及非洲","建筑与建材","https://www.big5constructkenya.com/home/",false],
  ["2026-11-10","2026-11-13","CONSTRUTEC + SMARTDOORS","马德里","西班牙","欧洲","建筑与门窗","https://www.ifema.es/en/construtec",false],
  ["2026-11-19","2026-11-22","ACETECH Mumbai","孟买","印度","亚洲","建筑与建材","https://acetechexpo.com/",false],
  ["2026-11-23","2026-11-26","Big 5 Global Dubai","迪拜","阿联酋","中东及非洲","建筑与建材","https://www.big5global.com/",true],
  ["2026-11-25","2026-11-26","London Build","伦敦","英国","欧洲","建筑与工程","https://www.londonbuildexpo.com/",false],
  ["2026-11-25","2026-11-26","Melbourne Build","墨尔本","澳大利亚","大洋洲","建筑与工程","https://melbournebuildexpo.com/",true],
  ["2026-12-02","2026-12-04","JAPAN BUILD Tokyo","东京","日本","亚洲","建筑与智能楼宇","https://www.japan-build.jp/hub/en-gb.html",true],
  ["2026-12-02","2026-12-04","The Buildings Show","多伦多","加拿大","北美洲","建筑与物业","https://www.thebuildingsshow.com/",false],
  ["2026-12-17","2026-12-20","ACETECH Delhi","新德里","印度","亚洲","建筑与建材","https://acetechexpo.com/",false],
  ["2027-01-11","2027-01-15","BAU Munich","慕尼黑","德国","欧洲","建筑与建材","https://bau-muenchen.com/en/",true],
  ["2027-02-02","2027-02-04","International Builders' Show","拉斯维加斯","美国","北美洲","住宅建筑","https://www.buildersshow.com/",false],
  ["2027-03-11","2027-03-14","WORLDBEX","马尼拉","菲律宾","亚洲","建筑与建材","https://worldbex.com/",false],
  ["2027-03-16","2027-03-18","UzBuild","塔什干","乌兹别克斯坦","亚洲","建筑与建材","https://buildtech.uz/",false],
  ["2027-03-30","2027-04-02","MosBuild","莫斯科","俄罗斯","欧洲","建筑与室内","https://mosbuild.com/",false],
  ["2027-04-27","2027-04-30","YAPI Turkeybuild","伊斯坦布尔","土耳其","欧洲","建筑与建材","https://yapifuari.com.tr/",true],
  ["2027-04-27","2027-05-02","Architect Expo","曼谷","泰国","亚洲","建筑与设计","https://architectexpo.com/",false],
  ["2027-04-28","2027-04-29","Sydney Build","悉尼","澳大利亚","大洋洲","建筑与工程","https://www.sydneybuildexpo.com/",true],
  ["2027-05-09","2027-05-13","BATIMATEC","阿尔及尔","阿尔及利亚","中东及非洲","建筑与建材","https://batimatecexpo.com/",false],
  ["2027-05-11","2027-05-16","EXPOCONSTRUCCIÓN & EXPODISEÑO","波哥大","哥伦比亚","拉丁美洲","建筑与设计","https://www.expoconstruccionyexpodiseno.com/",true],
  ["2027-05-24","2027-05-27","Big 5 Construct Saudi · May","利雅得","沙特阿拉伯","中东及非洲","建筑与建材","https://www.big5constructsaudi.com/event-info/",true],
  ["2027-06-01","2027-06-03","The Hotel Show Dubai","迪拜","阿联酋","中东及非洲","酒店与工程","https://www.thehotelshow.com/",true],
  ["2027-06-08","2027-06-10","Big 5 Construct South Africa","约翰内斯堡","南非","中东及非洲","建筑与建材","https://www.big5constructsouthafrica.com/",true],
  ["2027-06-30","2027-07-03","ARCHIDEX","吉隆坡","马来西亚","亚洲","建筑与设计","https://archidex.com.my/",false],
  ["2027-09-19","2027-09-22","Big 5 Construct Saudi · September","利雅得","沙特阿拉伯","中东及非洲","建筑与建材","https://www.big5constructsaudi.com/event-info/",true],
  ["2026-09-22","2026-09-25","Security Essen 2026","埃森","德国","欧洲","门锁、门禁与安防","https://www.security-essen.de/",true],
  ["2027-01-12","2027-01-14","Intersec Global 2027","迪拜","阿联酋","中东及非洲","门禁、智能锁与实体安防","https://intersecglobal.ae.messefrankfurt.com/dubai/en.html",true],
  ["2027-04-05","2027-04-09","ISC West 2027","拉斯维加斯","美国","北美洲","门禁与融合安防","https://www.discoverisc.com/west/en-us.html",true],
  ["2027-04-27","2027-04-29","The Security Event Europe 2027","伯明翰","英国","欧洲","门锁、门禁与商用安防","https://www.thesecurityevent.co.uk/",true],
  ["2027-07-11","2027-07-17","ALOA Convention & Security Expo 2027","罗斯蒙特","美国","北美洲","锁匠、锁具与实体安防","https://www.aloa.org/aloa-convention",true],
].map(([start,end,name,city,country,region,category,url,verified],index)=>{const [frequency,statsYear,exhibitors,visitors,metricsNote]=PUBLIC_EVENT_METRICS[index],registration=REGISTRATION_DETAILS[name]||{};return{id:index+1,start,end,name,city,country,region,category,url,verified,frequency,statsYear,exhibitors,visitors,metricsNote,logo:`./assets/exhibition-logos/${EVENT_LOGOS[index]}`,registrationOpen:registration.open??null,registrationDeadline:registration.deadline??null,registrationNote:registration.note||"官网未公布具体报名起止时间"}});

const localDate = value => new Date(`${value}T00:00:00`);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export const eventState = (event,today=new Date()) => event.end < dateKey(today) ? "past" : event.start <= dateKey(today) ? "active" : "upcoming";
export function registrationStatus(event,today=new Date()){
  const state=eventState(event,today);
  if(state==="past")return {kind:"closed",text:"本届报名已结束"};
  if(state==="active")return {kind:"active",text:"展会进行中，报名以官网为准"};
  if(event.registrationDeadline){
    const days=Math.ceil((localDate(event.registrationDeadline)-new Date(today.getFullYear(),today.getMonth(),today.getDate()))/DAY);
    if(days<0)return {kind:"closed",text:`报名已于 ${event.registrationDeadline} 截止`};
    if(days===0)return {kind:"urgent",text:"报名今天截止"};
    return {kind:days<=30?"urgent":"countdown",text:`距报名截止 ${days} 天 · ${event.registrationDeadline}`};
  }
  return {kind:event.registrationOpen?"open":"unknown",text:event.registrationNote};
}

export function filterExhibitions(events,filters={},today=new Date()){
  const keyword=(filters.keyword||"").trim().toLocaleLowerCase();
  return events.filter(event=>{
    if(filters.year&&filters.year!=="all"&&!event.start.startsWith(`${filters.year}-`))return false;
    if(filters.region&&filters.region!=="all"&&event.region!==filters.region)return false;
    const state=eventState(event,today);
    if(filters.status&&filters.status!=="all"&&state!==filters.status)return false;
    if(filters.verification==="verified"&&!event.verified)return false;
    if(filters.verification==="planned"&&event.verified)return false;
    return !keyword||[event.name,event.city,event.country,event.region,event.category].some(value=>value.toLocaleLowerCase().includes(keyword));
  }).sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name));
}

export function groupExhibitionsByMonth(events){
  return events.reduce((groups,event)=>{const key=event.start.slice(0,7);(groups[key]??=[]).push(event);return groups},{});
}

const fmtMonth = key => {const [year,month]=key.split("-");return `${year} 年 ${Number(month)} 月`};
export const formatEventRange = event => {
  const start=event.start.split("-"),end=event.end.split("-");
  const first=`${start[0]}.${start[1]}.${start[2]}`;
  return `${first}—${start[0]===end[0]?`${start[1]===end[1]?"":`${end[1]}.`}${end[2]}`:`${end[0]}.${end[1]}.${end[2]}`}`;
};

export const exhibitionEventKey = event => `${event.start}-${event.name}`.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
export const PARTICIPATION_STATUS_LABELS={researching:"调研中",planned:"拟参展",registered:"已报名",attending:"已确认参展",declined:"本届不参展"};
export const TARGET_CUSTOMER_OPTIONS={segments:["经销商","批发商","进口商","工程承包商","地产开发商","建筑设计机构","门窗制造商","安防集成商","酒店与物业","零售连锁"],regions:["本地市场","东亚","东南亚","南亚","中东","欧洲","北美","拉丁美洲","非洲","大洋洲"],buyerRoles:["企业老板","采购负责人","工程项目负责人","产品经理","技术负责人","渠道负责人","设计师/建筑师","锁匠/安装商"]};

export function mountExhibitionCalendar(root,{today=()=>new Date(),loadParticipation=async()=>({plans:[],owners:[],can_edit:false,can_view_budget:false}),saveParticipation=null,saveBudget=null,saveAudience=null,saveHistory=null,notify=()=>{}}={}){
  if(!root)return {render(){}};
  let participation={plans:[],owners:[],can_edit:false,can_view_budget:false},loading=false;
  const keyword=root.querySelector("#exhibition-search"),year=root.querySelector("#exhibition-year"),region=root.querySelector("#exhibition-region"),status=root.querySelector("#exhibition-status"),verification=root.querySelector("#exhibition-verification"),list=root.querySelector("#exhibition-months"),empty=root.querySelector("#exhibition-empty");
  year.value="all";
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
  const metricValue=value=>value===null||value===undefined?"待补充":typeof value==="number"?value.toLocaleString("zh-CN"):String(value);
  function render(){
    const now=today(),visible=filterExhibitions(EXHIBITION_EVENTS,{keyword:keyword.value,year:year.value,region:region.value,status:status.value,verification:verification.value},now),future=EXHIBITION_EVENTS.filter(event=>eventState(event,now)!=="past"),in90=future.filter(event=>(localDate(event.start)-now)/DAY<=90),countries=new Set(future.map(event=>event.country));
    root.querySelector("[data-exhibition-stat=upcoming]").textContent=future.length;
    root.querySelector("[data-exhibition-stat=soon]").textContent=in90.length;
    root.querySelector("[data-exhibition-stat=verified]").textContent=future.filter(event=>event.verified).length;
    root.querySelector("[data-exhibition-stat=countries]").textContent=countries.size;
    list.replaceChildren();empty.classList.toggle("hidden",visible.length>0);
    Object.entries(groupExhibitionsByMonth(visible)).forEach(([month,events])=>{
      const section=make("section","exhibition-month"),label=make("div","exhibition-month-label"),cards=make("div","exhibition-events");
      label.append(make("b","",fmtMonth(month)),make("span","",`${events.length} 场展会`));
      events.forEach(event=>{
        const key=exhibitionEventKey(event),plan=participation.plans.find(item=>item.event_key===key),registrationInfo=registrationStatus(event,now),card=make("article","exhibition-event"),date=make("div","exhibition-date"),body=make("div","exhibition-event-body"),head=make("div","exhibition-event-head"),brand=make("div","exhibition-brand"),logoWrap=make("span","exhibition-logo"),logo=document.createElement("img"),title=make("h3","",event.name),badge=make("span",`exhibition-badge ${event.verified?"verified":"planned"}`,event.verified?"官网已确认":"规划日期"),range=make("div","exhibition-range",formatEventRange(event)),meta=make("div","exhibition-meta"),metrics=make("div","exhibition-metrics"),note=make("small","exhibition-metrics-note",`${event.statsYear} · ${event.metricsNote}`),registration=make("div",`exhibition-registration ${registrationInfo.kind}`,`报名：${registrationInfo.text}`),companyPlan=make("div","exhibition-company-plan"),planSummary=make("div","exhibition-plan-summary"),link=make("a","exhibition-link","查看主办方官网 ↗");
        logo.src=event.logo;logo.alt=`${event.name} Logo`;logo.loading="lazy";logo.addEventListener("error",()=>{logoWrap.textContent=event.name.slice(0,2).toUpperCase();logoWrap.classList.add("fallback")},{once:true});logoWrap.append(logo);brand.append(logoWrap,title);
        date.append(make("strong","",String(Number(event.start.slice(8,10))).padStart(2,"0")),make("span","",`${Number(event.start.slice(5,7))} 月`));
        head.append(brand,badge);meta.append(make("span","",`${event.country} · ${event.city}`),make("span","",event.category));
        link.href=event.url;link.target="_blank";link.rel="noopener noreferrer";
        [["举办频率",event.frequency],["参展商 / 品牌",metricValue(event.exhibitors)],["观众 / 人次",metricValue(event.visitors)]].forEach(([label,value])=>{const item=make("div","exhibition-metric");item.append(make("small","",label),make("b","",value));metrics.append(item)});
        const money=(amount,currency)=>amount?`${currency||""} ${Number(amount).toLocaleString("zh-CN",{maximumFractionDigits:2})}`:"未录入",unitLabels={sqm:"/㎡",standard_booth:"/标准展位",package:"/套餐"};
        planSummary.append(make("b","","公司参展"),make("span",plan?`${PARTICIPATION_STATUS_LABELS[plan.status]||plan.status} · 负责人：${plan.owner_name||"待指定"}`:"未设置参展计划"));companyPlan.append(planSummary);
        const finance=make("div","exhibition-finance");finance.append(make("span","",`公开展位价：${plan?.booth_price?`${money(plan.booth_price,plan.booth_price_currency)}${unitLabels[plan.booth_price_unit]||""}`:"主办方报价待录入"}`));if(participation.can_view_budget)finance.append(make("span","",`公司预算：${money(plan?.budget_amount,plan?.budget_currency)}`));companyPlan.append(finance);
        const audience=make("div","exhibition-audience"),audienceValues=[...(plan?.target_customer_segments||[]),...(plan?.target_buyer_roles||[])];audience.append(make("b","","目标客户"),make("span","",audienceValues.length?audienceValues.join(" · "):"待规划"));if(plan?.target_regions?.length)audience.append(make("small","",`重点区域：${plan.target_regions.join("、")}`));if(plan?.target_customer_note)audience.append(make("small","",plan.target_customer_note));companyPlan.append(audience);
        const history=make("div","exhibition-history"),hasHistory=Number.isInteger(plan?.historical_event_year);history.append(make("b","","历史效果"));if(hasHistory){history.append(make("span","",`${plan.historical_event_year} 届`));[["线索",plan.historical_leads_count],["有效",plan.historical_qualified_count],["报价",plan.historical_quoted_count],["成交",plan.historical_deals_count]].forEach(([label,value])=>{const item=make("small","",`${label} ${value}`);history.append(item)});if(plan.historical_effect_note)history.append(make("em","",plan.historical_effect_note))}else history.append(make("span","","暂无复盘数据"));companyPlan.append(history);
        if(participation.can_edit&&saveParticipation){const form=make("form","exhibition-plan-form"),statusSelect=make("select","input"),ownerSelect=make("select","input"),reason=make("input","input"),submit=make("button","primary","保存");statusSelect.name="status";ownerSelect.name="owner";reason.name="reason";reason.placeholder="变更原因（必填）";reason.required=true;Object.entries(PARTICIPATION_STATUS_LABELS).forEach(([value,label])=>statusSelect.add(new Option(label,value,value===(plan?.status||"researching"),value===(plan?.status||"researching"))));ownerSelect.add(new Option("待指定负责人",""));participation.owners.forEach(owner=>ownerSelect.add(new Option(owner.name,owner.id,owner.id===plan?.owner_id,owner.id===plan?.owner_id)));submit.type="submit";form.append(statusSelect,ownerSelect,reason,submit);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;try{await saveParticipation({event_key:key,event_name:event.name,status:statusSelect.value,owner_id:ownerSelect.value||null,reason:reason.value});await refreshParticipation();notify("参展计划已保存")}catch(error){notify(`保存失败：${error.message}`)}finally{submit.disabled=false}});companyPlan.append(form)}
        if(participation.can_edit&&saveBudget){const details=make("details","exhibition-budget-details"),summary=make("summary","","维护预算与展位价"),form=make("form","exhibition-budget-form"),budgetAmount=make("input","input"),budgetCurrency=make("input","input"),boothPrice=make("input","input"),boothCurrency=make("input","input"),boothUnit=make("select","input"),source=make("input","input"),checked=make("input","input"),reason=make("input","input"),submit=make("button","primary","保存预算与价格");budgetAmount.type=boothPrice.type="number";budgetAmount.min=boothPrice.min="0.01";budgetAmount.step=boothPrice.step="0.01";budgetAmount.name="budget_amount";budgetCurrency.name="budget_currency";boothPrice.name="booth_price";boothCurrency.name="booth_currency";boothUnit.name="booth_unit";source.name="source_url";checked.name="checked_on";reason.name="reason";budgetAmount.placeholder="公司预算金额";budgetCurrency.placeholder="预算币种，如 CNY";boothPrice.placeholder="公开展位价格";boothCurrency.placeholder="报价币种，如 USD";source.type="url";source.placeholder="主办方 HTTPS 报价来源";checked.type="date";reason.placeholder="变更原因（必填）";reason.required=true;budgetAmount.value=plan?.budget_amount||"";budgetCurrency.value=plan?.budget_currency||"CNY";boothPrice.value=plan?.booth_price||"";boothCurrency.value=plan?.booth_price_currency||"USD";[["sqm","每平方米"],["standard_booth","标准展位"],["package","展位套餐"]].forEach(([value,label])=>boothUnit.add(new Option(label,value,value===(plan?.booth_price_unit||"sqm"),value===(plan?.booth_price_unit||"sqm"))));source.value=plan?.booth_price_source_url||"";checked.value=plan?.booth_price_checked_on||"";submit.type="submit";form.append(budgetAmount,budgetCurrency,boothPrice,boothCurrency,boothUnit,source,checked,reason,submit);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;try{await saveBudget({event_key:key,budget_amount:budgetAmount.value||null,budget_currency:budgetCurrency.value,booth_price:boothPrice.value||null,booth_price_currency:boothCurrency.value,booth_price_unit:boothUnit.value,source_url:source.value,checked_on:checked.value||null,reason:reason.value});await refreshParticipation();notify("预算与展位价格已保存")}catch(error){notify(`保存失败：${error.message}`)}finally{submit.disabled=false}});details.append(summary,form);companyPlan.append(details)}
        if(participation.can_edit&&saveAudience){const details=make("details","exhibition-audience-details"),summary=make("summary","","规划目标客户构成"),form=make("form","exhibition-audience-form"),noteInput=make("textarea","input"),reasonInput=make("input","input"),submit=make("button","primary","保存目标客户");const selected={segments:new Set(plan?.target_customer_segments||[]),regions:new Set(plan?.target_regions||[]),buyerRoles:new Set(plan?.target_buyer_roles||[])};[["客户类型","segments",TARGET_CUSTOMER_OPTIONS.segments],["重点区域","regions",TARGET_CUSTOMER_OPTIONS.regions],["采购角色","buyerRoles",TARGET_CUSTOMER_OPTIONS.buyerRoles]].forEach(([title,field,options])=>{const group=make("fieldset","exhibition-choice-group"),legend=make("legend","",title);group.append(legend);options.forEach(value=>{const label=make("label","exhibition-choice"),input=make("input");input.type="checkbox";input.name=field;input.value=value;input.checked=selected[field].has(value);label.append(input,document.createTextNode(value));group.append(label)});form.append(group)});noteInput.name="target_customer_note";noteInput.maxLength=500;noteInput.placeholder="补充客户画像、采购需求或产品方向（可选）";noteInput.value=plan?.target_customer_note||"";reasonInput.name="reason";reasonInput.placeholder="变更原因（必填）";reasonInput.required=true;submit.type="submit";form.append(noteInput,reasonInput,submit);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;const values=name=>[...form.querySelectorAll(`input[name=${name}]:checked`)].map(input=>input.value);try{await saveAudience({event_key:key,customer_segments:values("segments"),regions:values("regions"),buyer_roles:values("buyerRoles"),note:noteInput.value,reason:reasonInput.value});await refreshParticipation();notify("目标客户构成已保存")}catch(error){notify(`保存失败：${error.message}`)}finally{submit.disabled=false}});details.append(summary,form);companyPlan.append(details)}
        if(participation.can_edit&&saveHistory){const details=make("details","exhibition-history-details"),summary=make("summary","","维护历史效果"),form=make("form","exhibition-history-form"),fields=[["event_year","上届年份",plan?.historical_event_year],["leads_count","线索数",plan?.historical_leads_count],["qualified_count","有效客户数",plan?.historical_qualified_count],["quoted_count","报价客户数",plan?.historical_quoted_count],["deals_count","成交客户数",plan?.historical_deals_count]],inputs={};fields.forEach(([name,placeholder,value])=>{const input=make("input","input");input.type="number";input.name=name;input.placeholder=placeholder;input.min=name==="event_year"?"2000":"0";input.max=name==="event_year"?"2100":"999999";input.step="1";input.value=value??"";inputs[name]=input;form.append(input)});const noteInput=make("textarea","input"),reasonInput=make("input","input"),submit=make("button","primary","保存历史效果");noteInput.name="effect_note";noteInput.maxLength=500;noteInput.placeholder="复盘说明（可选）";noteInput.value=plan?.historical_effect_note||"";reasonInput.name="reason";reasonInput.placeholder="变更原因（必填）";reasonInput.required=true;submit.type="submit";form.append(noteInput,reasonInput,submit);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;const numberOrNull=input=>input.value===""?null:Number(input.value);try{await saveHistory({event_key:key,event_year:numberOrNull(inputs.event_year),leads_count:numberOrNull(inputs.leads_count),qualified_count:numberOrNull(inputs.qualified_count),quoted_count:numberOrNull(inputs.quoted_count),deals_count:numberOrNull(inputs.deals_count),note:noteInput.value,reason:reasonInput.value});await refreshParticipation();notify("历史效果已保存")}catch(error){notify(`保存失败：${error.message}`)}finally{submit.disabled=false}});details.append(summary,form);companyPlan.append(details)}
        body.append(head,range,meta,metrics,note,registration,companyPlan,link);card.append(date,body);cards.append(card);
      });section.append(label,cards);list.append(section);
    });
  }
  async function refreshParticipation(){if(loading)return;loading=true;try{participation=await loadParticipation()||participation;render()}catch(error){console.warn("参展计划加载失败",error)}finally{loading=false}}
  [keyword,year,region,status,verification].forEach(control=>control.addEventListener(control===keyword?"input":"change",render));render();refreshParticipation();return {render,refreshParticipation};
}
