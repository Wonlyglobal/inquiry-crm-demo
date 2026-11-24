const FOLDER = '门窗画册';
const CONTEXT = '物料：门窗画册';
const SUBJECT = String.raw`(?:王力)?(?:智能)?门窗(?:的)?(?:相关(?:的)?)?`;
const CATALOGUE = String.raw`(?:工程|零售)?(?:产品)?(?:画册|图册|样册)(?:pdf)?`;
const REQUEST = new RegExp(
  String.raw`^(?:(?:(?:你好|请问|麻烦|请|帮忙|帮我|我们|公司|物料库里|想|我想))*(?:还?有(?:没有)?|有没有|是否有|能否提供|能发(?:给我)?|找(?:一下)?|查(?:一下)?|给我(?:看看|找)?|发(?:给)?我|打开|看(?:看|一下)?|下载)?` +
  SUBJECT + CATALOGUE +
  String.raw`(?:有没有|有哪些|在哪里|发给我|有吗|吗|么|呢)?|` + SUBJECT +
  String.raw`(?:有(?:哪些|什么)|有没有)` + CATALOGUE + String.raw`(?:吗|呢)?)$`, 'i'
);
const FOLLOW_UP = /^(?:那|就)?(?:给我|发我|打开|看)?(工程|零售)(?:那本|这本|版)?(?:吗|呢|吧)?$/;
const ASSET_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function doorWindowCatalogueRequest(question, previousQuestion) {
  const text = String(question || '').normalize('NFKC').replace(/\s+/g, '').replace(/[。！？!?，,]+$/g, '');
  if (REQUEST.test(text)) return {edition:text.match(/工程|零售/)?.[0] || ''};
  if (previousQuestion === CONTEXT) {
    const edition = text.match(FOLLOW_UP)?.[1];
    if (edition) return {edition};
  }
  return null;
}

export function doorWindowCatalogueReply(data, {edition}) {
  if (data.status !== 'available') return null;
  const files = new Map();
  for (const asset of data.assets) {
    const path = String(asset.relativePath || '').split('/');
    const name = String(asset.name || '').split('/').at(-1);
    if (asset.isCurrentVersion !== true || asset.type !== '文档' || !ASSET_ID.test(asset.id) ||
        path.at(-2) !== FOLDER || path.at(-1) !== name || !/\.pdf$/i.test(name) ||
        (edition && !name.includes(edition))) continue;
    files.set(asset.id, {id:asset.id, name, type:asset.type});
  }
  const materials = [...files.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  const answer = materials.length
    ? `有，物料库「${FOLDER}」文件夹里找到了${materials.length}份${edition || ''}画册，可打开下方文件卡片查看或下载。`
    : `在你有权访问的「${FOLDER}」文件夹里，暂未找到${edition || ''}画册。`;
  return {answer,materials,context:{route:'materials',material_question:CONTEXT}};
}
