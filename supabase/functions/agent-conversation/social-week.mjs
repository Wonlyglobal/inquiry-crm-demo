const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 3_600_000;
const PLATFORMS = {tiktok:'TikTok', instagram:'Instagram', youtube:'YouTube', facebook:'Facebook', linkedin:'LinkedIn'};
const CURRENT_WEEK = /本周|这周|这一周|\bthis week\b/i;
const PREVIOUS_WEEK = /上周|上一周|\blast week\b/i;

export function socialWeekPeriod(question, now = Date.now()) {
 const text = String(question || '').normalize('NFKC');
 if (!/社媒|社交媒体|TikTok|Instagram|YouTube|Facebook|LinkedIn/i.test(text) ||
     /竞品|竞争对手|投放|(?:数据|账号)来源|数据同步|环比|同比|对比|比较|近\s*\d+\s*天|过去\s*\d+\s*天/.test(text)) return null;
 const current = CURRENT_WEEK.test(text);
 const previous = PREVIOUS_WEEK.test(text);
 if (current === previous) return null;

 const date = new Date(now + BEIJING_OFFSET);
 date.setUTCHours(0, 0, 0, 0);
 const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY - BEIJING_OFFSET;
 const start = current ? monday : monday - 7 * DAY;
 const end = current ? now : monday - 1;
 const dateLabel = time => new Date(time + BEIJING_OFFSET).toISOString().slice(0, 10);
 const platforms = Object.keys(PLATFORMS).filter(platform => new RegExp(platform, 'i').test(text));
 return {label:current ? '本周' : '上周', start, end, dates:`${dateLabel(start)} 至 ${dateLabel(end)}`, platforms};
}

export function socialWeekReply(period, library) {
 const heading = `${period.label}（${period.dates}，北京时间）`;
 const source = '\n\n出处：王力社媒系统 · 已发布记录';
 if (library?.status === 'unavailable' || !Array.isArray(library?.posts)) {
  return {status:'unavailable', answer:`${heading}的发布记录暂时读不到。`};
 }

 const scope = period.platforms.length ? period.platforms : null;
 const counts = new Map();
 let hasUndated = false;
 for (const post of library.posts) {
  const platform = String(post.platform || '').toLowerCase();
  if (scope && !scope.includes(platform)) continue;
  const published = Date.parse(post.published_at);
  if (!Number.isFinite(published)) {
   hasUndated = true;
   continue;
  }
  if (published < period.start || published > period.end) continue;
  const label = Object.hasOwn(PLATFORMS, platform) ? PLATFORMS[platform] : '其他平台';
  counts.set(label, (counts.get(label) || 0) + 1);
 }
 const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
 const complete = library.all_stored_records_read === true && !hasUndated;
 const status = complete ? 'available' : 'partial';
 const breakdown = [...counts].map(([label, count]) => `${label} ${count} 条`).join('、');
 const detail = total
  ? `${complete ? '有' : '已查到'} ${total} 条已发布记录（${breakdown}）。`
  : complete ? '暂无已发布记录。' : '暂未查到已发布记录。';
 const gap = complete ? '' : '部分记录未读全或缺少发布时间，实际数量待核对。';
 return {status, answer:heading + detail + gap + source};
}
