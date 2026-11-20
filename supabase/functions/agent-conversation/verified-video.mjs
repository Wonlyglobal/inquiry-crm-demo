// The private manifest holds frame-reviewed quotes, separate from worker-owned results.
const INDEX = 'wonly-verified-video-20261119-1e562ee0188e.json';
const videoName = /(?:视频|宣传片|画面|时间码|\bvideo\b|\btimestamp\b)/iu;
const collection = /(?:品牌|三条|3\s*条|全部|\bbrand\b)/iu;

function normalize(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[\s._-]+/gu, '');
}

function validEntry(entry) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry?.id || '')
    && typeof entry.name === 'string' && entry.name.length > 0 && entry.name.length <= 120
    && Number.isFinite(Date.parse(entry.updatedAt)) && entry.visibility === 'internal'
    && /^[a-f0-9]{64}$/.test(entry.sourceSha256)
    && Number.isInteger(entry.reviewedFrames) && entry.reviewedFrames > 0
    && Number.isInteger(entry.startMs) && Number.isInteger(entry.endMs)
    && entry.startMs >= 0 && entry.endMs > entry.startMs && entry.endMs <= 3600000
    && typeof entry.quote === 'string' && /^[\p{L}\p{N} .·-]{1,80}$/u.test(entry.quote)
    && Array.isArray(entry.keywords) && entry.keywords.length > 0
    && entry.keywords.every(keyword => typeof keyword === 'string' && normalize(keyword).length >= 3);
}

export async function loadVerifiedVideoIndex(admin) {
  try {
    const {data, error} = await admin.storage.from('agent-private-knowledge').download(INDEX);
    if (error || !data || data.size > 32768) return [];
    const manifest = JSON.parse(await data.text());
    if (manifest.schema !== 'grace-verified-video-v1' || !Array.isArray(manifest.assets)
        || manifest.assets.length !== 3 || !manifest.assets.every(validEntry)
        || new Set(manifest.assets.map(entry => entry.id)).size !== manifest.assets.length) return [];
    return manifest.assets;
  } catch {
    return [];
  }
}

function time(ms) {
  return Math.floor(ms / 60000) + ':' + (ms % 60000 / 1000).toFixed(3).padStart(6, '0');
}

export async function answerVerifiedVideo(question, readIndex, lookup) {
  if (!videoName.test(question) || /下载|发给|发送|发我|分享|生成|剪辑|制作|编辑|分析|复盘|\b(?:download|send|share|make|edit|analyze)\b/iu.test(question)) return null;
  const index = await readIndex();
  const q = normalize(question);
  const matches = index.filter(entry => [entry.name, ...entry.keywords].some(word => q.includes(normalize(word))));
  const selected = matches.length ? matches : collection.test(question) ? index : [];
  if (!selected.length) return null;

  const lines = await Promise.all(selected.map(async entry => {
    const data = await lookup(entry.name);
    const source = data.status === 'available' && data.assets.find(asset =>
      asset.id === entry.id && asset.name === entry.name && asset.type === '视频'
      && asset.isCurrentVersion && asset.visibility === entry.visibility
      && Date.parse(asset.updatedAt) === Date.parse(entry.updatedAt)
      && ['ready', 'partial'].includes(asset.video?.status));
    if (!source) return '';
    return `《${source.name}》 ${time(entry.startMs)}–${time(entry.endMs)}，画面显示「${entry.quote}」。`;
  }));
  const available = lines.filter(Boolean);
  if (!available.length) return {count: 0, answer: '这次无法核对原视频的时间码，请稍后重试。'};
  const answer = available.join('\n') + (available.length < selected.length ? '\n其余视频的时间码暂未核对。' : '');
  return {answer, count: available.length};
}
