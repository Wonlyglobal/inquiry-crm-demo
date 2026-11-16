// Select only within the already-authorized provider/data path. This does not authorize images or material bodies.
const COMPLEX=/SWOT|市场分析|竞争分析|竞争格局|产品对比|产品比较|比较.*产品|对比.*产品|深入分析|综合分析|market analysis|competitive analysis|compare.*products/i;
const FOLLOWUP=/^(?:继续|展开|详细一点|为什么|那怎么做|再分析一下|continue|explain more)[。？！?!]*$/i;
export function selectChatModel(input,{standard='qwen-plus',complex=standard}={}){
 const question=String(input?.question||'').trim();
 const previous=(Array.isArray(input?.history)?input.history:[]).filter(x=>x?.role==='user').at(-1)?.content||'';
 return COMPLEX.test(question)||(FOLLOWUP.test(question)&&COMPLEX.test(String(previous)))?complex:standard;
}
