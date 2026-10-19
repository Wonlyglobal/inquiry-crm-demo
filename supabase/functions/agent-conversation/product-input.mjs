// Normalize model spelling only; no fuzzy identity merge or product facts are inferred.
const DIGITS={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function chineseNumber(s){
 if(/[百千][一二两三四五六七八九]$/.test(s))return null; // colloquial '一百二' is ambiguous
 if(!/[十百千]/.test(s))return [...s].map(c=>DIGITS[c]).join('');
 let n=0,d=0;for(const c of s){if(c in DIGITS)d=DIGITS[c];else{n+=(d||1)*({'十':10,'百':100,'千':1000}[c]);d=0}}return String(n+d);
}
const EN={zero:0,oh:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const EN_WORD=Object.keys(EN).join('|');
function englishNumber(s){const words=s.toLowerCase().trim().split(/[ -]+/);if(words.every(w=>EN[w]<10))return words.map(w=>EN[w]).join('');if(words.length===1)return String(EN[words[0]]);if(words.length===2&&EN[words[0]]>=20&&EN[words[0]]%10===0&&EN[words[1]]<10)return String(EN[words[0]]+EN[words[1]]);return null}
const suffix=s=>s.replace(/(\d)(pro|max|plus|ultra)\b/ig,'$1 $2');
export function normalizeProductInput(value){
 let q=String(value||'').normalize('NFKC');
 q=q.replace(/(?:艾克斯|埃克斯|艾斯|诶斯)(?=[ \t-]*(?:\d|[零〇一二两三四五六七八九十百千]))/g,w=>/克斯/.test(w)?'X':'S');
 q=q.replace(/(^|[^A-Za-z0-9])([A-Za-z]{1,3})[ \t-]*([零〇一二两三四五六七八九十百千]{1,7})(?![零〇一二两三四五六七八九十百千])/g,(all,b,p,n)=>{const v=chineseNumber(n);return v&&v.length>=2&&v.length<=4?b+p+v:all});
 const re=new RegExp(`(^|[^A-Za-z0-9])([A-Za-z]{1,3})[ \\t]+((?:${EN_WORD})(?:[ -]+(?:${EN_WORD})){0,3})(?![A-Za-z])`,'gi');
 q=q.replace(re,(all,b,p,n)=>{if(/^(?:an?|at|in|on|of|to|by|for|the|and|or|is|be|as|not)$/i.test(p))return all;const v=englishNumber(n);return v&&v.length>=2&&v.length<=4?b+p+v:all});
 q=q.replace(/\b([A-Za-z]{1,3})[ \t\-–—_]+(?=\d{2,4}(?!\d))/g,'$1');
 return suffix(q);
}
export function modelCodes(value){
 const q=normalizeProductInput(value),out=[];
 for(const m of q.matchAll(/\b[A-Za-z][A-Za-z0-9_-]{0,38}\d[A-Za-z0-9_-]*\b(?:[ \t_-]*(?:pro|max|plus|ultra)\b)?/gi)){
  const code=m[0].trim().toUpperCase();if(/^(?:V\d+|ISO\d+|EN\d+|UL\d+)$/.test(code))continue;
  if(!out.includes(code))out.push(code);
 }return out.slice(0,4);
}
export const bareModel=value=>/^\s*[A-Za-z]{1,3}\d{2,4}[A-Za-z]?(?:[ \t_-]*(?:pro|max|plus|ultra))?\s*[。？！!?]*$/i.test(normalizeProductInput(value));
