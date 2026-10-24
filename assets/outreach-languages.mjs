export const OUTREACH_TRANSLATION_LANGUAGES=[['en','英语'],['es','西班牙语'],['pt','葡萄牙语'],['fr','法语'],['ar','阿拉伯语'],['ru','俄语']];
export function selectedTranslationLanguages(values,source=''){
 const allowed=new Set(OUTREACH_TRANSLATION_LANGUAGES.map(([code])=>code));
 if(!Array.isArray(values)||values.some(value=>!allowed.has(value)))throw Error('请选择支持的目标语言');
 return [...new Set(values)].filter(code=>code!==source);
}
