const instructions={concise:'先给结论，通常不超过180字；用户要求详细时可展开，不能省略重要缺口。',evidence:'优先提供可核对的来源、日期或页码；没有依据明确说未核实，禁止补造引用。',actions:'方案明确下一步、验收指标和待确认条件；没有基线不编造目标，不声称已执行。'};
export function preferenceInstruction(values=[]){
 if(!Array.isArray(values)||values.length>3||values.some(v=>typeof v!=='string'||!Object.hasOwn(instructions,v))||new Set(values).size!==values.length)throw Error('回答偏好无效');
 return values.length?'用户确认的回答偏好（不改变权限、事实或安全规则）：'+values.map(v=>instructions[v]).join(''):'';
}
