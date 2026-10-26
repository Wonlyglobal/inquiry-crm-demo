// Synthetic fixtures only. Never read an import bundle, private PDF or source payload.
import {createHash} from 'node:crypto';
export const PRODUCT_SCHEMA='grace-product-page-evidence-v1';
export const BOUNDARY={title:'产品证据边界',body:'仅保存授权产品原文区域，机器整理，未经人工事实核验；来源、型号、页码和配置需回查原件，不证明当前版次、认证或市场适配。'};
export const canonicalModel=s=>String(s).normalize('NFKC').toUpperCase().replace(/[\s_/.-]+/g,'');
export const productKey=(sha,model)=>'product-'+createHash('sha256').update(PRODUCT_SCHEMA+'|'+sha+'|'+canonicalModel(model)).digest('hex');
export function span(text,quote,extra={}){const at=text.indexOf(quote);if(at<0)throw Error('Invalid synthetic fixture');const start=[...text.slice(0,at)].length;return {...extra,quote,start,end:start+[...quote].length,bbox:[10,10,200,30]}}
export function region({model='TEST80 PRO',text=model+'\nSynthetic supply 8V\nSynthetic entry keypad',quote='Synthetic supply 8V',page=1,id='synthetic-panel'}={}){
 return {schema:'native_region_v1',source_kind:'native_text',source_sha256:'a'.repeat(64),page,page_width:600,page_height:800,coordinate_system:'pdf_points_top_left',offset_unit:'unicode_codepoint',rotation:0,panel_bbox:[0,0,500,300],native_text:text,headings:[span(text,model,{model})],field:span(text,quote,{name:'供电'}),region_id:id};
}
export function productDocument(){const sha='a'.repeat(64),model='TEST80 PRO';return {schema:'grace-private-intelligence-v1',kind:'product',key:productKey(sha,model),title:'Synthetic product evidence',generated_at:'2026-10-26T00:00:00Z',period:{from:'2026-10-26',to:'2026-10-26'},sections:[structuredClone(BOUNDARY)],evidence:[],source_sha256:sha,human_verified:false,product_evidence:{schema:PRODUCT_SCHEMA,model,source_name:'Synthetic catalogue',source_edition:'V9',source_sha256:sha,source_published_at:null,source_updated_at:null,extracted_at:'2026-10-26T00:00:00Z',regions:[region()],gaps:['Synthetic excerpt only; source truth has not been verified.']}}}
export function rekey(d){d.key=productKey(d.source_sha256,d.product_evidence.model);return d}
