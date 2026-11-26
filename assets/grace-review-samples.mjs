export const sampleFiles = [
  {
    id: 'catalogue',
    title: 'Grace 示例画册 / Grace Sample Catalogue',
    filename: 'grace-sample-catalogue.txt',
    pages: [
      '示例门的标准尺寸为 900 × 2100 毫米。 The sample door measures 900 × 2100 mm.',
      '示例门提供白色和深灰色两款。 The sample door comes in white and dark grey.',
    ],
  },
  {
    id: 'guide',
    title: 'Grace 示例安装指南 / Grace Sample Installation Guide',
    filename: 'grace-sample-installation-guide.txt',
    pages: [
      '示例流程先核对门洞尺寸，再确认开启方向。 The sample process starts by checking the opening dimensions and swing direction.',
    ],
  },
];

export function sampleAnswer(question, { attached = false, previousTopic } = {}) {
  const text = question.trim();
  if (attached && (!text || /图|image|photo|picture/i.test(text))) {
    return { file: 'catalogue', page: 0, topic: 'door' };
  }
  if (/颜色|配色|colour|color|finish|white|grey/i.test(text)) {
    return { file: 'catalogue', page: 1, topic: 'door' };
  }
  if (/安装|开向|开启方向|install|swing/i.test(text)) {
    return { file: 'guide', page: 0, topic: 'installation' };
  }
  if (/尺寸|规格|宽|高|dimension|size|width|height/i.test(text)) {
    return { file: 'catalogue', page: 0, topic: 'door' };
  }
  if (previousTopic === 'door' && /^(还有呢|what else)[？?]?$/i.test(text)) {
    return { file: 'catalogue', page: 1, topic: 'door' };
  }
  return null;
}
