export const OUTREACH_CATEGORIES=[['security_door','防盗门'],['steel_door','钢质门'],['wooden_door','木门'],['armored_door','装甲门'],['cast_aluminum_door','铸铝门'],['copper_door','铜门'],['fire_door','防火门'],['medical_door','医用门'],['aluminum_windows','铝合金门窗'],['aluminum_wood_windows','铝木门窗'],['smart_lock','智能锁'],['mechanical_hardware','机械锁及五金']];
export function suggestedOutreachCategory(text=''){
 const t=String(text);
 if(/metal\s*door\s*1\.0|金属门\s*1\.0/i.test(t))return 'security_door';
 const rules=[['aluminum_wood_windows',/铝木|alumin(?:um|ium)[ -]wood/i],['cast_aluminum_door',/铸铝|cast alumin/i],['armored_door',/装甲|armou?red door/i],['copper_door',/铜门|copper door/i],['medical_door',/医用门|医疗门|hospital door|medical door/i],['fire_door',/防火门|fire door/i],['smart_lock',/智能锁|smart lock/i],['mechanical_hardware',/机械锁|机械五金|mechanical lock|door hardware/i],['wooden_door',/木门|wooden door/i],['security_door',/防盗门|security door|Metal Door 1\.0/i],['steel_door',/钢质门|金属门|steel door|metal door/i],['aluminum_windows',/铝合金|aluminum window|aluminium window/i]];
 return rules.find(([,pattern])=>pattern.test(t))?.[0]||'';
}
export function mountOutreachProducts(container,text=''){
 const suggested=suggestedOutreachCategory(text);container.replaceChildren();
 for(const [value,label] of OUTREACH_CATEGORIES){const row=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=value;box.name='outreach-product';box.checked=value===suggested;row.append(box,document.createTextNode(' '+label));container.append(row);}
 return suggested;
}
export const METAL_DOOR_1_PROFILE={
 title:'Metal Door 1.0｜传统机械金属安全门基线',
 introduction:'以传统机械入户配置及金属安全门结构为定位，供不要求后续代际增强防夹、监控或电动功能的项目进行基础选型。是否适合具体工程，仍需核对安装及使用条件。',
 selection:'选型先确认目标市场、门洞尺寸、开启方向、饰面、数量和必需功能，再由销售工程师推荐当前可供型号与配置。',
 limits:'1.0是配置基线，不是已确认的具体型号。官网当前选型页未给出命名型号；厚度、填充、锁体、隔音、隔热、防火/防盗等级、认证、MOQ、价格及交期均须另行核实，不由代际名称推定。',
 source:'https://www.wonlyglobal.com/ru/products/metal-doors/1-0',checked:'2026-10-24',
};
export function renderOutreachProductProfile(container,text=''){
 container.replaceChildren();const matched=/metal\s*door\s*1\.0|金属门\s*1\.0/i.test(String(text));container.hidden=!matched;if(!matched)return;
 const p=METAL_DOOR_1_PROFILE;
 if(container.tagName==='DETAILS'){const summary=document.createElement('summary');summary.textContent='官网背景简介（非画册，不代表当前推荐产品）';container.append(summary);}
 const title=document.createElement('h4');title.textContent=p.title;container.append(title);
 for(const text of [p.introduction,p.selection,p.limits]){const line=document.createElement('p');line.textContent=text;container.append(line);}
 const link=document.createElement('a');link.href=p.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='查看官网产品介绍 ↗';
 const note=document.createElement('small');note.textContent=' 来源：WONLY公开产品页；核对日期 '+p.checked+'。官网介绍不替代内部画册页码证据或产品专家核验。';container.append(link,note);
}
export function renderCatalogueEvidence(container,data){
 container.replaceChildren();
 const note=document.createElement('p');note.textContent='以下是本次授权查询返回的画册页文字，机器提取、未人工核验；不代表已读完整册或获得参数/认证批准。';container.append(note);
 for(const result of data.category_results||[]){
  const line=document.createElement('p');const label=OUTREACH_CATEGORIES.find(([key])=>key===result.category)?.[1]||result.label;
  line.textContent=`${label}：${result.status==='matched'?`已匹配 ${result.matched_pages} 条当前索引页码`:result.status==='search_unavailable'?'检索未完成，请检查授权或连接':'本次尚未匹配到可定位页码，不代表没有当前版画册'}；已检索：${(result.searches||[]).map(s=>s.query).join(' → ')}。`;
  container.append(line);
 }
 for(const e of data.evidence||[]){const card=document.createElement('article'),title=document.createElement('h5'),quote=document.createElement('pre'),state=document.createElement('small');
  title.textContent=`${e.name}｜${e.version}｜第${e.page}页`;quote.textContent=e.quote;quote.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';
  state.textContent=`${e.partial?'部分解析，存在缺口；':'已返回本页文本；'}机器提取未人工核验，索引版本未复验原文件实时版本。`;card.append(title,quote,state);
  if(/not\s+recommended|不推荐|不建议|淘汰|停产/i.test(e.quote||'')){const warning=document.createElement('p');warning.textContent='本页含“不推荐/限制使用”等表述，需结合原页核对其对应型号与条件，不得将该页包装为产品推荐。';warning.style.color='#a13c32';card.prepend(warning);}
  container.append(card);
 }
 if(data.missing_categories?.length||!data.evidence?.length){const missing=document.createElement('p');missing.textContent='本次未取得对应画册页证据：'+(data.missing_categories||[]).join('、')+'。可能是授权/连接、索引或匹配范围问题，不代表画册不存在；请在原物料系统核对。';container.append(missing);}
 const footer=document.createElement('small');footer.textContent='查询时间：'+(data.read_at||'未返回')+'；未保存草稿、未发送邮件。';container.append(footer);
}
