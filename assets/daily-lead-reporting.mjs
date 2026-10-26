// Shared read-only reporting helpers. The controlled ledger RPC remains the
// authority for visibility and immutable recorded_on; never fall back to inquiries.
const dayMs=86400000;
const shanghaiDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});

function parseDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new RangeError('请选择有效的日期');
 const time=Date.parse(`${value}T00:00:00.000Z`);
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new RangeError('请选择有效的日期');
 return time;
}
function dateText(time){return new Date(time).toISOString().slice(0,10)}
function timestamp(value,label){
 // RPC timestamptz values include an explicit zone. A zone-less value would
 // otherwise silently depend on the viewer's timezone. Preserve sub-ms order.
 const match=typeof value==='string'&&value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:Z|[+-]\d{2}:\d{2})$/);
 const time=match?Date.parse(value):NaN;
 if(!match||!Number.isFinite(time))throw new TypeError(`${label}无效，无法核对线索时间`);
 parseDay(match[1]);
 return {time,order:BigInt(time)*1000000n+BigInt((match[2]||'').slice(3).padEnd(6,'0')||'0')};
}
function ledgerRows(workspace){
 if(!workspace||!Array.isArray(workspace.leads))throw new TypeError('客户线索账本未成功加载');
 const cutoff=timestamp(workspace.as_of,'账本截止时间'),rows=[],conversions=[];
 for(const row of workspace.leads){
  if(!row||typeof row!=='object')throw new TypeError('客户线索账本记录无效');
  parseDay(row.recorded_on);
  const recorded=timestamp(row.recorded_at,'实际录入时间');
  const converted=row.converted_at==null?null:timestamp(row.converted_at,'商机转化时间');
  if(recorded.order>cutoff.order)continue;
  rows.push(row);
  if(converted&&converted.order<=cutoff.order)conversions.push(row);
 }
 return {rows,conversions};
}
function uniqueRows(rows,key){
 const result=new Map();
 for(const row of rows){const id=row?.[key];if(typeof id==='string'&&id)result.set(id,row)}
 return [...result.values()];
}
function inSales(row,salesId){return row&&(!salesId||row.sales_id===salesId)}
function periodRows(rows,fromDay,toDay,salesId,conversionRows){
 const mine=rows.filter(row=>inSales(row,salesId));
 return {
  leads:uniqueRows(mine.filter(row=>typeof row.recorded_on==='string'&&row.recorded_on>=fromDay&&row.recorded_on<=toDay),'id'),
  conversions:uniqueRows(conversionRows.filter(row=>inSales(row,salesId)).filter(row=>{const day=shanghaiDay.format(new Date(Date.parse(row.converted_at)));return day>=fromDay&&day<=toDay}),'inquiry_id'),
 };
}

export function isSubmittedDailyReport(report,reportDate){
 return Boolean(report&&report.status==='submitted'&&report.submitted_at&&!report.is_simulated&&report.report_date===reportDate);
}

export function submittedDailySalesIds(reports,reportDate,people){
 const authorized=new Set((people||[]).map(person=>person?.id).filter(Boolean));
 return new Set((reports||[]).filter(report=>isSubmittedDailyReport(report,reportDate)&&authorized.has(report.sales_id)).map(report=>report.sales_id));
}

export function summarizeDailyLedger(workspace,reportDate,salesId){
 parseDay(reportDate);
 const {rows,conversions}=ledgerRows(workspace);
 const result=periodRows(rows,reportDate,reportDate,salesId,conversions);
 return {...result,newCount:result.leads.length,convertedCount:result.conversions.length,asOf:workspace.as_of};
}

export async function readDailyLedgerHistory(loadWorkspace,fromDay,toDay,{salesId}={}){
 const from=parseDay(fromDay),to=parseDay(toDay);
 if(to<from)throw new RangeError('结束日期不能早于开始日期');
 if(typeof loadWorkspace!=='function')throw new TypeError('缺少客户线索账本读取器');
 const rows=new Map(),conversions=new Map();let asOf=null;
 // Inclusive chunks are at most 93 calendar days, independent of browser DST.
 // Calls are deliberately sequential; a failed chunk rejects the whole result.
 for(let cursor=from;cursor<=to;cursor+=93*dayMs){
  const end=Math.min(to,cursor+92*dayMs);
  const workspace=await loadWorkspace(dateText(cursor),dateText(end));
  const batch=ledgerRows(workspace),eligible=new Set(batch.conversions.map(row=>row.id));
  for(const row of batch.rows){if(typeof row.id==='string'&&row.id){rows.set(row.id,row);if(eligible.has(row.id))conversions.set(row.id,row);else conversions.delete(row.id)}}
  asOf=workspace.as_of;
 }
 // One row may be returned in its recording chunk and again in a conversion
 // chunk. Keep the last row by id, then separately dedupe converted inquiry ids.
 // asOf is the last read time, not a claim of a transaction-wide snapshot.
 return {...periodRows([...rows.values()],fromDay,toDay,salesId,[...conversions.values()]),asOf};
}
