// Keep output constraints on later lines without discarding the actual task.
// The legacy bank's first line is explicitly labelled audience/background.
export function writingRequestText(value){
 const lines=String(value||'').trim().split(/\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>1&&/^面向[^\n]*[：:]/.test(lines[0]))lines.shift();
 return lines.join('\n');
}
export const writingPrimaryTask=value=>writingRequestText(value).split('\n')[0]||'';
