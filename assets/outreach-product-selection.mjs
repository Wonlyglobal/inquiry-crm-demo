export const OUTREACH_CATEGORIES=[['security_door','防盗门'],['steel_door','钢质门'],['wooden_door','木门'],['armored_door','装甲门'],['cast_aluminum_door','铸铝门'],['copper_door','铜门'],['fire_door','防火门'],['medical_door','医用门'],['aluminum_windows','铝合金门窗'],['aluminum_wood_windows','铝木门窗'],['smart_lock','智能锁'],['mechanical_hardware','机械锁及五金']];
export function suggestedOutreachCategory(text=''){
 const t=String(text);
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
 const title=document.createElement('h4');title.textContent=p.title;container.append(title);
 for(const text of [p.introduction,p.selection,p.limits]){const line=document.createElement('p');line.textContent=text;container.append(line);}
 const link=document.createElement('a');link.href=p.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='查看官网产品介绍 ↗';
 const note=document.createElement('small');note.textContent=' 来源：WONLY公开产品页；核对日期 '+p.checked+'。官网介绍不替代内部画册页码证据或产品专家核验。';container.append(link,note);
}
