import {CATALOG_TITLES} from './agent-actions.mjs';
// Keep the search/coverage audit intact; present only the requested model list.
export function conciseCatalogList(intent,catalog,supplementary){
 if(intent?.kind!=='list'||!catalog)return null;
 const rows=(catalog.products||[]).filter(p=>intent.categories.includes(p.category)&&p.model);
 const seen=new Set(),models=[];const sources=new Map();
 for(const p of rows){const key=String(p.model).toUpperCase().replace(/[\s_-]/g,'');if(!seen.has(key)){seen.add(key);models.push(String(p.model));}
  if(CATALOG_TITLES[p.catalog]&&Number.isInteger(p.page)){if(!sources.has(p.catalog))sources.set(p.catalog,new Set());sources.get(p.catalog).add(p.page);}}
 if(!models.length)return '这次画册索引未找到可确认的型号，暂时不能列出；不代表没有对应产品。';
 const shown=models.slice(0,12);
 const refs=[...sources].map(([id,pages])=>`${CATALOG_TITLES[id]}第${[...pages].sort((a,b)=>a-b).join('、')}页`).join('；');
 const edition=catalog.sources?.find(s=>sources.has(s.id))?.edition;
 return `画册中有：${shown.join('、')}。`+(models.length>shown.length?`共检出 ${models.length} 个型号，先列 ${shown.length} 个。`:'')+
  `\n来源：${edition||'已收录版本'}${refs?'，'+refs:''}。`+
  '\n以上来自画册索引，尚未人工核验；'+(supplementary?.status==='available'?'物料库补充检索不代表全部版本已解析。':'物料库补充检索未完成，当前版本仍待核对。');
}
