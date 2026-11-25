// Keep output constraints on later lines without discarding the actual task.
const PRESENTATION_TAIL=/(?:^|[。！？，；.!?,;\s])(?:(?:请|先)?用一句话(?:回答(?:核心问题|这一问)?|作答)|(?:请)?(?:简短|简洁)(?:回答|作答)|请用便于核对的格式|重点说我问的这一项|答案要便于转述|结论先说|如有出处[，,]\s*请放在末尾|内容控制在必要范围|用容易理解的表达|能简答就简答|请直接回答这一问)[。！!?？\s]*$/u;
export function withoutPresentationTail(value){
 return String(value||'').trim().replace(PRESENTATION_TAIL,'').trim();
}

// The legacy bank's first line is explicitly labelled audience/background.
export function writingRequestText(value){
 const lines=String(value||'').trim().split(/\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>1&&/^面向[^\n]*[：:]/.test(lines[0]))lines.shift();
 return lines.join('\n');
}
export const writingPrimaryTask=value=>writingRequestText(value).split('\n')[0]||'';
export function writingSourceName(value){const q=String(value||'');return q.match(/《([^》]{1,180}\.(?:pdf|pptx?|docx?|xlsx?))》/i)?.[1]||q.match(/物料[:：]\s*([^\n，。；?？]{1,180}\.(?:pdf|pptx?|docx?|xlsx?))(?:\s|$|[，])/i)?.[1]||'';}
