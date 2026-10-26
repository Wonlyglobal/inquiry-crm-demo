// Presentation only: keep inquiry_status values and immutable weekly snapshots unchanged.
export const stageNames=Object.freeze({
 pending_assignment:'待分配',received:'收到询盘',qualified:'有效询盘',
 contacted:'已联系',quoted:'已报价',sample_sent:'已寄样',
 negotiating:'谈判',won:'成交',lost:'丢单'
});

export function leadStageLabel(lead={}){
 if(!lead.inquiry_id)return '尚未转化';
 if(!lead.stage)return '阶段暂不可用';
 return Object.hasOwn(stageNames,lead.stage)?stageNames[lead.stage]:'阶段待核实';
}

export function formatStageSummary(stages){
 if(stages==null)return '暂无商机阶段数据';
 if(typeof stages!=='object'||Array.isArray(stages))return '阶段数据待核对';
 const totals=new Map();let needsReview=false;
 for(const [stage,count] of Object.entries(stages)){
  if(!Number.isSafeInteger(count)||count<0){needsReview=true;continue}
  const label=Object.hasOwn(stageNames,stage)?stageNames[stage]:'阶段待核实';
  const total=(totals.get(label)||0)+count;
  if(!Number.isSafeInteger(total)){needsReview=true;continue}
  totals.set(label,total);
 }
 const parts=[...Object.values(stageNames),'阶段待核实'].filter(label=>totals.has(label)).map(label=>`${label}：${totals.get(label)} 个`);
 if(needsReview)parts.push('部分阶段数据待核对');
 return parts.join('、')||'暂无商机阶段数据';
}
