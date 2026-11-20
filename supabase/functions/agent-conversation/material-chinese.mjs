import {wantsFactOriginal} from './catalog-fact-answer.mjs';
// Presentation only. Original evidence, versions, access checks and audit remain intact.
const TERMS={
 'Dimensions (excluding handle)':'不含手柄尺寸','Compatible lock bodies':'兼容锁体','Compatible lock cores':'兼容锁芯','Compatible lock body':'兼容锁体','Compatible lock core':'兼容锁芯',
 'Standard features':'标准功能','Signature features':'特色功能','Optional colours':'可选颜色','Front panel':'前面板','Rear panel':'后面板','Door leaf thickness':'门扇厚度','Frame thickness':'门框厚度','Frame material':'门框材质',
 'Remote-sensing Recognition':'远感识别','Remote-Sensing True Smart Lock':'远感真智能锁','Face Recognition Smart Lock':'人脸识别智能锁','AI Smart Display':'AI智能显示屏','Sentinel Door Viewer':'哨兵猫眼','24/7 Real-Time Monitoring':'全天候实时监控','3D Face Recognition':'3D人脸识别','Palm Vein Recognition':'掌静脉识别','Remote Unlocking':'远程开锁','Remote Video':'远程视频','HD Rear Display':'高清后显示屏','HD Display':'高清显示屏','Smart Video Door Viewer':'智能视频猫眼','Loitering Snapshot':'逗留抓拍','Auto-opener Optional':'自动开门器可选','Mains Supply':'市电供电','Mains Power':'市电供电','Auto-open':'自动开门','M1 Encrypted Card':'M1加密卡','M1 Card':'M1卡','Wechat Official Account':'微信公众号','Fingerprint':'指纹','Passcode':'密码','Video Intercom':'视频对讲','Door Viewer':'猫眼','Video storage':'视频存储','Inside release':'室内开启','Whole-home':'全屋联动','Unlocking':'开锁方式',
 'mechanical auto-opening lock body':'机械自动开启锁体','double-action quick-latch mechanical lock body':'双动作快锁机械锁体','cylindrical electric lock core':'圆柱电动锁芯','triple-row anti-prying electric lock core':'三排防撬电动锁芯','Mechanical lock':'机械锁','Lock body':'锁体','Lock core':'锁芯','Smart lock':'智能锁','Core fill':'填充材料','Door leaf':'门扇','Glass option':'玻璃选项','Burglary resistance':'防盗性能',
 'Minimalist Series':'极简系列','Solid Wood Series':'实木系列','Custom Series':'定制系列','Aluminum Alloy Series':'铝合金系列','PVC Series':'PVC系列','Cast Aluminium Door':'铸铝门','Steel-Wood Armoured Series':'钢木装甲系列','Etched Series':'蚀刻系列','Roll-Textured Series':'辊压纹理系列','Inlay Series':'镶嵌系列','Transfer-Print Series':'转印系列','Smart Door':'智能门','Security Door':'防盗门','Wooden Door':'木门','Hospital Doors':'医院门','School Doors':'学校门','Refuge Doors':'避难门','Fire Windows':'防火窗',
 'Space Black':'太空黑','Obsidian Black':'曜石黑','Xuanwu Gold':'玄武金','Black':'黑色','White':'白色','Grey':'灰色','Gray':'灰色','Gold':'金色','Silver':'银色','Bronze':'古铜色','Champagne':'香槟色',
 'Stainless steel':'不锈钢','Aluminium alloy':'铝合金','Aluminum alloy':'铝合金','Galvanized steel':'镀锌钢','Galvanised steel':'镀锌钢','Solid wood':'实木','Honeycomb':'蜂窝','Fire resistance':'耐火时间','Sound insulation':'隔声','Dimensions':'尺寸','Thickness':'厚度','Material':'材质','Colour':'颜色','Color':'颜色','Sizes':'尺寸','Frame':'门框','Hinges':'合页','Display':'显示屏','Power':'供电','Grade':'等级','Standard':'标准','Opening':'开启方式','Layers':'层数','Structure':'结构','Version':'版本','Type':'类型','Craft':'工艺','Badge':'标记','Key features':'主要功能','Smart Lock':'智能锁','Features':'功能','Optional':'可选','Series':'系列','inch':'英寸','excluding handle':'不含手柄','App':'应用','Key':'钥匙','Source':'来源',
};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function chineseMaterialText(value){
 let s=String(value);
 for(const [en,zh] of Object.entries(TERMS).sort((a,b)=>b[0].length-a[0].length))s=s.replace(new RegExp('(?<![a-z])'+escape(en)+'(?![a-z])','gi'),zh);
 return s;
}
const residue=s=>s.replace(/\b(?:WONLY|AI|PDF|PPT|PVC|APP|Max|Pro|Plus|Ultra|Basic|Standard|EN|BS|GB|GA|IEC|IP|CE|UL|RC|EI|Rw|HD|USB|WiFi|Wi-Fi|mm|cm|m|kg|dB|min|V|Hz|GHz|W|H|D|T)\b/gi,'').replace(/\b[A-Z]{1,8}[-\d][\w.-]*\b/g,'');
export function presentMaterialAnswer(answer,question='',catalog=null){
 if(typeof answer!=='string'||wantsFactOriginal(question))return answer;
 let text=answer.replace(/对外报价或投标前[^\n]+/g,'画册摘录，待产品负责人确认。').replace(/这些是画册里的公司宣传口径[^\n]+/g,'画册宣传口径，待产品负责人确认。');
 for(const f of catalog?.facts||[])if(typeof f.zh==='string'&&f.zh.length<=500&&/[\u3400-\u9fff]/u.test(f.zh))text=text.split(f.text).join(f.zh);
 const refs=[...new Set(text.match(/(?:工程画册|零售画册|静音木门画册|真智能锁画册)\s*(?:PDF)?第[\d、]+页/g)||[])];
 let missing=false;const lines=[];
 for(const raw of text.split('\n')){
  if(!raw.trim()||/检索覆盖|检索日志|匹配记录|已检索.*条|^覆盖范围/.test(raw))continue;
  if(/```|^\s*[{}]|console\.|export function/.test(raw)){missing=true;continue;}
  // File names and source identifiers are evidence, not English prose to translate.
  if(/^(?:\s*来源|\s*出处|《.*》\s*\d+:)/.test(raw)){lines.push(raw);continue;}
  let s=chineseMaterialText(raw).replace(/(\d)-英寸/g,'$1英寸').replace(/画册原文[：:]?[“”"]?/g,'画册释义：').replace(/[“”]/g,'');
  if(/[a-z]{3,}/i.test(residue(s))){missing=true;continue;}
  lines.push(s);
 }
 let details=lines.filter(l=>/^\s*[-•]/.test(l));
 const asked=['标准功能','开锁方式','尺寸','厚度','颜色','供电','材质','锁体','锁芯','特色功能'].filter(word=>question.includes(word));
 if(/[A-Z]{1,5}[- ]?\d/i.test(question)&&asked.length){const focused=details.filter(l=>asked.some(word=>l.includes(word)));if(focused.length)details=focused;}
 const priority=line=>/标准功能|开锁方式|尺寸|厚度|材质|供电|耐火|隔声|防盗|锁体|锁芯|特色功能/.test(line)?0:/标记|类型|版本|颜色/.test(line)?2:1;
 const keep=[...details].sort((a,b)=>priority(a)-priority(b)).slice(0,4);let limited=details.length>keep.length;
 const output=lines.filter(l=>!/^\s*[-•]/.test(l)||keep.includes(l));
 if(refs.length&&!output.some(l=>/来源|出处|PDF第\d+页|第\s*\d+\s*页/.test(l)))output.push('来源：'+refs.join('；')+'。');
 if(missing)output.push('部分内容的中文释义尚待核对，可要求查看原文。');
 if(limited)output.push('先列主要内容，可指定参数继续问。');
 return output.join('\n').replace(/\n{3,}/g,'\n\n');
}
