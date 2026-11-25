import {findModels} from './catalog-knowledge.mjs';
import {chineseMaterialText} from './material-chinese.mjs';
import {wantsFactOriginal} from './catalog-fact-answer.mjs';

const GUIDE=[
 ['不含把手尺寸',['Dimensions (excluding handle)']],
 ['尺寸',['Dimensions','Sizes']],['厚度',['Thickness']],['颜色',['Colour']],
 ['可选颜色',['Optional colours']],['产品类型',['Type']],['产品版本',['Version']],
 ['门框',['Frame']],['锁体',['Lock body']],['锁芯',['Lock core']],
 ['配置的智能锁',['Smart lock']],['适配锁体',['Compatible lock body','Compatible lock bodies']],
 ['适配锁芯',['Compatible lock core','Compatible lock cores']],['等级',['Grade']],
 ['标准编号',['Standard']],['材质',['Material']],['前面板',['Front panel']],
 ['屏幕',['Display']],['供电',['Power']],['玻璃选项',['Glass option']],
 ['门芯填充',['Core fill']],['视频存储',['Video storage']],['开门方式',['Opening']],
 ['门扇',['Door leaf']],['合页',['Hinges']],['解锁方式',['Unlocking']],
 ['产品标识',['Badge']],['标配功能',['Standard features']],['工艺',['Craft']],
 ['特色功能',['Signature features']],['猫眼',['Door viewer']],
];
const NAMES={c1:'工程画册',c2:'零售画册',c3:'静音木门画册',c4:'真智能锁画册'};
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s_/-]+/gu,'');
const QUERY_SCOPE=/画册(?:里|中)?(?:写[了的]|怎么写|记载|标注)|(?:只|仅|按)(?:看|用|照)?(?:这本|旧版|2026年8月版|2026-08版)?画册/u;
const NON_ARCHIVE=/现售|在售|当前配置|最新版|第\s*[一二三四五六七八九十\d]+\s*版|\bv\d+\b|出货|证书|保修|质保|市场适配|对比|比较|为什么|写一段|准备|方案|推荐|选型|怎么选|适合|哪个更/iu;
const DESCRIPTIVE=/^(?:王力\s*|查一下\s*|请查\s*|请问\s*)?[^？?，,。]{1,65}的(?:产品类型|产品版本|产品标识|配置的智能锁)(?:是什么|[？?，,。]|$)/u;
const BASIC_UNTRANSLATED=/[a-z]{3,}/i;
const allowedLine=text=>!BASIC_UNTRANSLATED.test(text.replace(/\b(?:WONLY|AI|HD|USB|Wi-?Fi|PVC|MAX|PRO|PLUS|APP|GB|EN|IEC|UL|GA|mm|cm|kg|min|Hz|GHz)\b/gi,'').replace(/\b[A-Z]{1,8}[- ]?\d[\w.-]*\b/g,''));

export function archivedCatalogField(question,catalog){
 const q=String(question||'').normalize('NFKC').trim();
 if(!catalog||q.length>125||!(QUERY_SCOPE.test(q)||DESCRIPTIVE.test(q))||NON_ARCHIVE.test(q))return null;
 const models=findModels(q,catalog);
 if(models.length!==1)return null;
 const field=[...GUIDE].sort((a,b)=>b[0].length-a[0].length).find(([label])=>q.includes(label));
 if(!field)return null;
 const [label,keys]=field,model=models[0],canonical=normalize(model);
 const edition=String(catalog.sources?.[0]?.edition||'2026-08');
 const records=catalog.products.filter(item=>normalize(item.model)===canonical&&item.confidence!=='low'&&NAMES[item.catalog]&&Number.isInteger(item.page)&&item.page>0);
 const selected=records.flatMap(row=>keys.filter(key=>typeof row.specs?.[key]==='string'&&row.specs[key].trim()).map(key=>({value:row.specs[key].trim(),row})));
 const title=`按 ${edition} 版画册，${model} 的${label}`;
 const refs=rows=>[...new Set(rows.map(({row})=>`${NAMES[row.catalog]} PDF第${row.page}页`))].slice(0,3).join('、');
 if(!selected.length)return {answer:`${title}未找到明确记录。`,status:'missing'};
 if(new Set(selected.map(item=>normalize(item.value))).size>1)return {answer:`${title}有不同记录，请按对应版本核对。\n出处：${refs(selected)}。`,status:'conflict'};
 const raw=selected[0].value;
 const original=wantsFactOriginal(q);
 const value=original?raw:chineseMaterialText(raw);
 if(!original&&!allowedLine(value))return {answer:`${title}已有记录，中文释义待核对，可要求查看原文。\n出处：${refs(selected)}。`,status:'translation_needed'};
 return {answer:`${title}为 ${value.replace(/[。.]$/u,'')}。\n出处：${refs(selected)}。`,status:'cited'};
}
