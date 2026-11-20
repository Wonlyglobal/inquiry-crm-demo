// Internal sales wording only. Keep the value and conditions on the same catalogue page.
const WORDING=/话术|能直接念|口头介绍|customer[- ]facing (?:line|draft|script)|sales (?:line|script)/i;
const PRODUCT_WORDING=/王力|WONLY|产品|展厅|画册|catalog(?:ue)?|\b[A-Z]{1,6}(?:-[A-Z]{1,7})?[- ]?\d{1,5}[A-Z]?\b/i;
const ENGLISH_WORDING=/^[\s]*(?:write|draft|give|please)\b/i;
const PROMISE=/终身保修|百分百安全|100\s*%\s*(?:安全|safe|secure)|行业第一|绝对不会|保证通过|永久免维护|lifetime warranty|guaranteed compliance/i;
const LABELS={
 'standard features':'标准功能','thickness':'厚度','compatible lock body':'兼容锁体','compatible lock bodies':'兼容锁体',
 'compatible lock core':'兼容锁芯','compatible lock cores':'兼容锁芯','lock body':'锁体','lock core':'锁芯',
 'display':'显示屏','grade':'等级','frame':'门框','sizes':'尺寸','dimensions':'尺寸','whole-home':'智能家居联动',
 'door viewer':'猫眼','video storage':'视频存储','inside release':'室内开启','core fill':'填充材料',
 'power':'供电','material':'材质','glass option':'玻璃选项','standard':'标准','smart lock':'配套智能锁',
 'front panel':'前面板','signature features':'特色功能','colour':'颜色','optional colours':'可选颜色',
 'unlocking':'开锁方式','craft':'工艺','dimensions (excluding handle)':'不含手柄的尺寸',
};
const normalize=value=>String(value).normalize('NFKC').toLowerCase();
const compact=value=>normalize(value).replace(/\s+/gu,'');
const modelKey=value=>compact(value).replace(/[-_/]/g,'');
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const contains=(query,phrase)=>/^[a-z]/.test(phrase)?new RegExp('(?<![a-z])'+escapeRegExp(phrase)+'(?![a-z])','i').test(query):query.includes(phrase);

export function catalogueWordingQuestion(question){
 return WORDING.test(question)&&PRODUCT_WORDING.test(question);
}

export function catalogueWordingAnswer(catalog,models,question,ref){
 if(models.length!==1)return '请先确认一个完整产品型号和想介绍的卖点，我再按画册整理话术。';
 const model=models[0],query=normalize(question);
 const fields=[];
 const seen=new Set();
 const pages=new Map((catalog.pages||[]).map(page=>[page.catalog+':'+page.page,compact(page.text)]));
 for(const product of catalog.products||[]){
  if(modelKey(product.model)!==modelKey(model))continue;
  for(const [field,raw] of Object.entries(product.specs||{})){
   if(typeof raw!=='string'||!raw.trim()||raw.length>350||PROMISE.test(raw))continue;
   const key=normalize(field),label=LABELS[key]||field;
   const names=[key,label].filter(phrase=>contains(query,phrase));
   if(!names.length)continue;
   const source=pages.get(product.catalog+':'+product.page)||'';
   if(!source.includes(compact(product.model))||!source.includes(compact(raw)))continue;
   const id=[key,compact(raw),product.catalog,product.page].join('|');
   if(seen.has(id))continue;
   seen.add(id);
   fields.push({key,field,label,value:raw.trim(),source:ref(product.catalog,product.page),match:Math.max(...names.map(x=>x.length))});
  }
 }
 const level=Math.max(0,...fields.map(f=>f.match));
 const best=fields.filter(f=>f.match===level);
 const keys=new Set(best.map(f=>f.key)),values=new Set(best.map(f=>compact(f.value)));
 if(!best.length)return '画册中暂未找到这个型号对应卖点的可引用原文。请确认型号或提供具体资料页，我再整理话术。';
 if(keys.size>1||values.size>1)return '当前资料对这个卖点有不同字段或表述。请先确认采用的型号配置和画册版本。\n'+best.map(f=>'- '+f.label+' '+f.value+'（'+f.source+'）').join('\n');
 const {field,label,value}=best[0];
 const sources=[...new Set(best.map(f=>f.source))].join('、');
 return ENGLISH_WORDING.test(question)
  ?'Suggested customer-facing line: “According to the WONLY catalogue, the '+field.toLowerCase()+' for the '+model+' is listed as '+value+'.”\n\nSource: '+sources
  :'建议话术：「按王力画册标注，'+model+' 的'+label+'为 '+value+'。」\n\n出处 '+sources+'。具体配置以对应版本为准。';
}
