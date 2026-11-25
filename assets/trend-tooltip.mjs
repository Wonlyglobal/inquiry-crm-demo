export function trendPointText(chart,bucket,value){
 const period=bucket.key||bucket.label;
 if(chart.unit==='%')return `${period}\n${chart.title}：${bucket.assigned?chart.format(value):'—（无已分配询盘）'}\n30分钟内首次联系：${bucket.fast} 条 / 已分配有效询盘：${bucket.assigned} 条`;
 return `${period}\n${chart.title}：${chart.format(value)}${chart.unit==='CNY'?'（人民币）':''}`;
}
export function bindTrendTooltips(container){
 for(const card of container.querySelectorAll('.trend-chart')){
  const tip=card.querySelector('.trend-tooltip');if(!tip)continue;
  const dots=[...card.querySelectorAll('.trend-dot')],guides=[...card.querySelectorAll('.trend-guide')];
  const reset=()=>{dots.forEach(dot=>{dot.classList.remove('active');dot.setAttribute('r','3')});guides.forEach(line=>line.classList.remove('active'))};
  const hide=()=>{tip.hidden=true;reset()};
  for(const hit of card.querySelectorAll('[data-trend-tip]')){
   const show=()=>{reset();const index=Number(hit.dataset.trendIndex);dots[index]?.classList.add('active');dots[index]?.setAttribute('r','5');guides[index]?.classList.add('active');tip.textContent=hit.dataset.trendTip;tip.hidden=false;};
   hit.addEventListener('pointerenter',show);hit.addEventListener('pointerleave',hide);
   hit.addEventListener('focus',show);hit.addEventListener('blur',hide);hit.addEventListener('click',show);
   hit.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
  }
 }
}
