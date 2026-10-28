// Format only the existing division snapshot. No additional database/client reads.
const url='https://crm.foreverdoodle.com/sales-leads.html#lead-dashboard';
export function divisionReportMessage(body,metadata){
 if(typeof body!=='string')throw new TypeError('Missing division snapshot');
 const lines=body.split('\n'),weekly=lines[0].startsWith('【事业部线索与商机周榜】'),daily=lines[0].startsWith('【事业部每日线索排行榜】');
 if(!daily&&!weekly)return {msg_type:'text',content:{text:body}};
 const candidates=lines.filter(line=>/^\d+\. /.test(line)),rows=[];
 for(const line of candidates){
  const m=weekly?line.match(/^(\d+)\. (.+)：转商机(\d+)条 \/ 新增(\d+)条 \/ 跟进(\d+)次 \/ 无新增申报(\d+)人天 \/ 未提交(\d+)人天 \/ 不足目标(\d+)人天$/):line.match(/^(\d+)\. (.+)：新增(\d+)条 \/ 转商机(\d+)条 · (豁免|达标|已申报无新增|未提交|未达标)$/);
  if(!m)return {msg_type:'text',content:{text:body}};
  const name=m[2],matches=(metadata?.timeliness||[]).filter(p=>p.full_name===name||name===p.full_name+'（'+(p.team||'')+'）'||(daily&&name.replace(/（[^（）]*）$/,'')===p.full_name));
  const t=matches.length===1?matches[0]:null;
  rows.push({rank:m[1],person:name,new_leads:weekly?m[4]:m[3],converted:weekly?m[3]:m[4],state:weekly?`跟进${m[5]}次；线索未申报${m[7]}人天`:m[5]==='未提交'?'线索未申报':m[5],on_time:t&&t.expected>0?`${t.on_time}/${t.expected} · ${t.rate}%`:'—',report_state:t?`迟交${t.late} / 缺交${t.missing} / 待截止${t.pending}`:'待核对'});
 }
 const total=lines[1]?.match(/^全员(\d+)人/);
 if(!total||Number(total[1])!==rows.length||!rows.length||rows.length>100)return {msg_type:'text',content:{text:body}};
 // Explicit percentages sum to 100%; auto columns otherwise grow beyond the card.
 const columns=[['rank','排名',12],['person','业务员',25],['new_leads','线索数',17],['converted','商机数',17],['on_time','按时提交率',29]].map(([name,display_name,width])=>({name,display_name,data_type:'text',width:width+'%',horizontal_align:name==='person'?'left':'center'}));
 const compactRows=rows.map(row=>({rank:row.rank,person:daily?row.person.replace(/（[^（）]*）$/,''):row.person,new_leads:row.new_leads,converted:row.converted,on_time:row.on_time==='—'?'—':row.on_time.split(' · ')[1]}));
 const details=rows.map((row,index)=>`第${index+1}行（排名${row.rank}）：${row.state}；按时 ${row.on_time}；${row.report_state}`).join('\n');
 return {msg_type:'interactive',card:{schema:'2.0',config:{update_multi:true},header:{template:'green',title:{tag:'plain_text',content:weekly?'事业部线索与商机周榜':'事业部每日线索排行榜'},subtitle:{tag:'plain_text',content:lines[0].replace(/^【[^】]+】/,'')}},body:{elements:[
 {tag:'markdown',content:lines.slice(1,weekly?2:3).join('\n').replace(/未提交(\d+)人/g,'线索未申报$1人')+`\n口径：线索/商机为${weekly?'本周':'当日'}，按时率为${weekly?'本周':'本月'}。`},
 {tag:'table',page_size:10,row_height:'auto',row_max_height:'96px',header_style:{lines:2,text_size:'normal'},columns,rows:compactRows},
 {tag:'markdown',content:'补充核对（对应主表行序）\n'+details},
 {tag:'markdown',content:weekly?'按本周转商机、新增依次排名，同量同名次；日报仅统计截止时已到期人天。':'按当日新增排名，同量同名次；日报按时率按本月已到期人天计算。'},
 {tag:'markdown',content:'日报截止按已生效规则（默认18:00）；草稿不算正式提交，周末/登记豁免排除。—表示尚无应提交人天或旧快照无数据，不代表0%。不含客户资料或日报正文。'},
 {tag:'markdown',content:`[打开客户线索看板](${url})`}
 ]}}};
}
