import {modelCodes, normalizeProductInput} from './product-input.mjs';

const ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CATALOGUE_NAME = /画册|图册|样册|catalog(?:ue)?|brochure/i;
const PRODUCT_IMAGE_NAME = /产品(?:图|照片|图片)|产品外观|外观图|产品实拍/;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|heic|tiff?|avif)$/i;
const LEADING = /^(?:(?:请问|请|麻烦|帮我|给我|发我|发给我|我想要|我想看看|我想|我们|你们|公司|物料库里|有没有|还有没有|是否有|有|找一下|找|查一下|查|下载|打开|看看|看一下|看))+/;
const TRAILING = /(?:有没有|有哪些|在哪里|发给我|能发吗|吗|么|呢|可以吗|吧)$/;

export function materialDirectoryRequest(question) {
  const text = normalizeProductInput(question).trim().replace(/[。！？!?，,]+$/g, '');
  const compact = text.replace(/[\s,，]+/g, '').replace(/^(?:物料|公司文件)[：:]/, '');
  const subject = compact.replace(LEADING, '').replace(TRAILING, '');
  if (/^(?:王力)?(?:产品)?(?:画册|图册|样册)(?:pdf)?$/i.test(subject)) {
    return {kind:'catalogue', queries:['画册','图册','样册','catalog']};
  }
  const license = /^(?:(浙江王力门业有限公司|王力门业有限公司|王力门业|王力安防|王力)(?:的)?)?营业(?:执|职)照$/.exec(subject);
  if (license) return {kind:'license', queries:['营业执照'], company:license[1] || ''};
  const models = modelCodes(text);
  const imageSubject = /^(?:什么|哪些)?(?:[a-z0-9_-]+(?:的)?)?(?:产品图|产品图片|产品照片|产品实拍图|产品外观图|外观图)$/i;
  if (models.length <= 1 && imageSubject.test(subject) && (!/^[a-z]/i.test(subject) || models.length === 1)) {
    return {kind:'product_image', queries:models.length ? models : ['产品图','外观图'], model:models[0] || ''};
  }
  return null;
}

function matches(asset, name, request) {
  if (request.kind === 'catalogue') {
    return asset.type==='文档' && /\.pdf$/i.test(name) && CATALOGUE_NAME.test(name);
  }
  if (request.kind === 'license') {
    const requestedName = request.company;
    return /营业执照/.test(name) && (/\.pdf$/i.test(name) || IMAGE_EXTENSION.test(name)) &&
      (!requestedName || name.includes(requestedName));
  }
  const path = String(asset.relativePath || '');
  const namedModels = modelCodes(name);
  const models = namedModels.length ? namedModels : modelCodes(path);
  return asset.type==='图片' && IMAGE_EXTENSION.test(name) &&
    (PRODUCT_IMAGE_NAME.test(name) || /(?:^|\/)(?:外观图|产品图|产品实拍)(?:\/|$)/.test(path) ||
      (request.model && /外观图|产品图|产品实拍/.test(path))) &&
    (!request.model || models.includes(request.model));
}

export function materialDirectoryReply(responses, request) {
  const available = responses.filter(source=>source.status==='available');
  const incomplete = available.length !== responses.length;
  const files = new Map();
  for (const source of available) {
    for (const asset of source.assets) {
      const name = String(asset.name || '').split('/').at(-1);
      if (asset.isCurrentVersion !== true || !ID_PATTERN.test(asset.id) || !matches(asset,name,request)) continue;
      files.set(asset.id,{id:asset.id,name,type:asset.type});
    }
  }
  const materials = [...files.values()].slice(0,6);
  if (!materials.length && (incomplete || !available.length)) return null;
  const labels = {catalogue:'画册',license:'营业执照',product_image:'产品图'};
  const label = labels[request.kind];
  const more = available.some(source=>source.has_more) || files.size > materials.length;
  const answer = materials.length
    ? `物料库${more || incomplete ? '先列出' : '找到'}这${materials.length}${request.kind==='product_image'?'张':'份'}${label}：\n` +
      materials.map(file=>`- ${file.name}`).join('\n') + (incomplete?'\n部分检索暂未完成。':'')
    : `这次在你有权访问的物料库检索中暂未找到匹配的${label}。`;
  return {answer,materials,context:{route:'materials',material_question:'物料：'+label}};
}
