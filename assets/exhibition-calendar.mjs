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
];

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
].map(([start,end,name,city,country,region,category,url,verified],index)=>{const [frequency,statsYear,exhibitors,visitors,metricsNote]=PUBLIC_EVENT_METRICS[index];return{id:index+1,start,end,name,city,country,region,category,url,verified,frequency,statsYear,exhibitors,visitors,metricsNote}});

const localDate = value => new Date(`${value}T00:00:00`);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export const eventState = (event,today=new Date()) => event.end < dateKey(today) ? "past" : event.start <= dateKey(today) ? "active" : "upcoming";

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

export function mountExhibitionCalendar(root,{today=()=>new Date()}={}){
  if(!root)return {render(){}};
  const keyword=root.querySelector("#exhibition-search"),year=root.querySelector("#exhibition-year"),region=root.querySelector("#exhibition-region"),status=root.querySelector("#exhibition-status"),verification=root.querySelector("#exhibition-verification"),list=root.querySelector("#exhibition-months"),empty=root.querySelector("#exhibition-empty");
  const currentYear=String(today().getFullYear());year.value=[...year.options].some(option=>option.value===currentYear)?currentYear:"all";
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
        const card=make("article","exhibition-event"),date=make("div","exhibition-date"),body=make("div","exhibition-event-body"),head=make("div","exhibition-event-head"),title=make("h3","",event.name),badge=make("span",`exhibition-badge ${event.verified?"verified":"planned"}`,event.verified?"官网已确认":"规划日期"),range=make("div","exhibition-range",formatEventRange(event)),meta=make("div","exhibition-meta"),metrics=make("div","exhibition-metrics"),note=make("small","exhibition-metrics-note",`${event.statsYear} · ${event.metricsNote}`),link=make("a","exhibition-link","查看主办方官网 ↗");
        date.append(make("strong","",String(Number(event.start.slice(8,10))).padStart(2,"0")),make("span","",`${Number(event.start.slice(5,7))} 月`));
        head.append(title,badge);meta.append(make("span","",`${event.country} · ${event.city}`),make("span","",event.category));
        link.href=event.url;link.target="_blank";link.rel="noopener noreferrer";
        [["举办频率",event.frequency],["参展商 / 品牌",metricValue(event.exhibitors)],["观众 / 人次",metricValue(event.visitors)]].forEach(([label,value])=>{const item=make("div","exhibition-metric");item.append(make("small","",label),make("b","",value));metrics.append(item)});
        body.append(head,range,meta,metrics,note,link);card.append(date,body);cards.append(card);
      });section.append(label,cards);list.append(section);
    });
  }
  [keyword,year,region,status,verification].forEach(control=>control.addEventListener(control===keyword?"input":"change",render));render();return {render};
}
