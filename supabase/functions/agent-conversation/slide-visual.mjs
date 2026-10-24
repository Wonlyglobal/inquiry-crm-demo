// Internal evidence only. Visual observations never become certified parameter facts.
export const visualQuestion=q=>/图片|图表|图示|画面|示意图|\b(?:diagram|visual|chart)s?\b/i.test(String(q));
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const strings=(v,n,size)=>Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,n).map(x=>x.slice(0,size)):[];
export function normalizeSlideVisual(raw,sha){
 if(raw?.schema!=='internal-slide-visual-v1'||!hash(sha)||raw.source_sha256!==sha)return null;
 const count=k=>Number.isSafeInteger(raw[k])&&raw[k]>=0?Math.min(raw[k],500):0;
 return {status:['processing','partial','reviewed'].includes(raw.status)?raw.status:'partial',source_sha256:sha,read_at:typeof raw.read_at==='string'?raw.read_at.slice(0,50):'',pages_total:count('pages_total'),pages_rendered:count('pages_rendered'),pages_observed:count('pages_observed'),pages_ocr:count('pages_ocr'),native_charts:count('native_charts'),native_tables:count('native_tables'),human_verified:false,pages:(Array.isArray(raw.pages)?raw.pages:[]).filter(p=>Number.isInteger(p?.page)&&p.page>0&&p.page<=500&&hash(p.render_sha256)).slice(0,3).map(p=>({page:p.page,render_sha256:p.render_sha256,status:p.status==='read'?'read':'partial',description:typeof p.description==='string'?p.description.slice(0,500):'',ocr_chunks:strings(p.ocr_chunks,3,850),table_chunks:strings(p.table_chunks,3,850),labels:strings(p.ocr_corroborated_labels,8,80),uncertainties:strings(p.uncertainties,6,120),human_verified:false}))};
}
export function slideVisualText(v){
 if(!v)return '';
 return `\n图片/图表内部阅读：已渲染 ${v.pages_rendered}/${v.pages_total} 页，OCR检查 ${v.pages_ocr} 页，视觉模型读取 ${v.pages_observed} 页；读取时间：${v.read_at||'未标注'}。均未人工核验。原生图表 ${v.native_charts} 项、原生表格 ${v.native_tables} 项；这不排除图片中含图示。\n`+v.pages.map(p=>`[第${p.page}页｜图片/图表示意，机器观察，非产品参数事实]\n${p.description||'该页尚无可用画面解释。'}\n`+(p.ocr_chunks.length?`[同页OCR文字，可能有误，需与原图核对]\n${p.ocr_chunks.join('\n')}\n`:'同页OCR没有可用文字，不代表原图无字。\n')+(p.table_chunks.length?`[同页原生表格文字，未重算]\n${p.table_chunks.join('\n')}\n`:'')+`缺口：${p.uncertainties.length?p.uncertainties.join('；'):'视觉解释未人工核验，未据此确认尺寸、材质、性能或认证。'}`).join('\n')+'\n画面观察只与同页关联，不自动归属该页每个型号；参数仍需可逐字核对的同产品原文证据。';
}
