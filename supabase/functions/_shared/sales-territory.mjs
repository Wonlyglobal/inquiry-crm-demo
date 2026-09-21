// Business routing, not account authorization. Unlisted/ambiguous countries stay unassigned.
const groups = {
  '中东': 'AE SA QA KW BH OM YE IQ IR JO LB IL PS SY',
  '非洲': 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD DJ EG GQ ER SZ ET GA GM GH GN GW CI KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW',
  '中亚': 'KZ KG TJ TM UZ',
  '美洲': 'US CA MX GT BZ SV HN NI CR PA CU HT DO JM BS BB TT GD LC VC DM KN AG BR AR CL CO PE VE EC BO PY UY GY SR',
  '欧洲': 'GB IE FR DE ES PT IT NL BE LU CH AT PL CZ SK HU RO BG GR AL AD BA HR CY DK EE FI IS LV LI LT MC ME MK MT NO SM RS SI SE VA',
  '东南亚': 'BN KH ID LA MY MM PH SG TH TL VN',
  '南亚': 'AF BD BT IN MV NP PK LK',
};
const aliases = new Map();
const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s._-]+/g,'');
for (const [region, codes] of Object.entries(groups)) {
  aliases.set(normalize(region), region);
  for (const code of codes.split(' ')) {
    aliases.set(normalize(code),region);
    for (const locale of ['zh-CN','en']) aliases.set(normalize(new Intl.DisplayNames([locale],{type:'region'}).of(code)),region);
  }
}
for(const [name,region] of Object.entries({'USA':'美洲','United States of America':'美洲','UK':'欧洲','UAE':'中东','United Arab Emirates':'中东','阿联酋':'中东','越南':'东南亚','Vietnam':'东南亚'}))aliases.set(normalize(name),region);
export function resolveInquiryRegion(country) { return aliases.get(normalize(country)) || null; }
export function matchTerritory(country, territory) {
  const region=resolveInquiryRegion(country), configured=String(territory||'').trim().replace(/–|—/g,'-');
  if(!region)return {region:null,rank:0,status:'unknown_country',label:'询盘国家未识别，待主管确认'};
  if(!configured)return {region,rank:0,status:'unconfigured',label:'业务员负责区域未设置'};
  if(configured===`${region}大区`||configured.endsWith(`-${region}`))return {region,rank:2,status:'exact',label:`${region}负责区域匹配`};
  if(configured==='中东非大区'&&['中东','非洲'].includes(region))return {region,rank:1,status:'parent',label:'中东非大区覆盖，优先分区负责人'};
  return {region,rank:0,status:'mismatch',label:`负责区域与${region}不匹配`};
}
export function rankTerritoryCandidates(candidates) {return [...candidates].sort((a,b)=>b.territory.rank-a.territory.rank||b.score-a.score||a.name.localeCompare(b.name,'zh-CN'));}
