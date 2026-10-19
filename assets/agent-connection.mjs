// Only read-only readiness checks are retried. Audio, chat, writes and probes are not.
const stopped=()=>Object.assign(Error('连接检查已停止'),{name:'AbortError'});
export function connectionFailure(error){
 if(error?.name==='AbortError')return {kind:'cancelled'};
 if(error?.connectionTimeout)return {kind:'timeout'};
 if(Number.isInteger(error?.status))return {kind:[401,403].includes(error.status)?'auth':'http',status:error.status};
 if(error instanceof TypeError||/Failed to fetch|NetworkError|Load failed|network unavailable|network failure/i.test(String(error?.message)))return {kind:'network'};
 return {kind:'other'};
}
export const retryableConnection=error=>{const d=connectionFailure(error);return ['network','timeout'].includes(d.kind)||d.kind==='http'&&[408,502,503,504].includes(d.status)};
function pause(ms,signal){return new Promise((resolve,reject)=>{let timer;const abort=()=>{clearTimeout(timer);reject(stopped())};if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)})}
async function bounded(request,signal,timeoutMs){
 const deadline=new AbortController();let timedOut=false,abort;
 const timer=setTimeout(()=>{timedOut=true;deadline.abort()},timeoutMs),combined=AbortSignal.any([signal,deadline.signal]);
 try{return await Promise.race([request(combined),new Promise((_,reject)=>{abort=()=>reject(timedOut?Object.assign(Error('连接检查超时'),{connectionTimeout:true}):stopped());if(combined.aborted)abort();else combined.addEventListener('abort',abort,{once:true})})])}
 catch(error){if(signal.aborted)throw stopped();if(timedOut)throw Object.assign(Error('连接检查超时'),{connectionTimeout:true});throw error}
 finally{clearTimeout(timer);combined.removeEventListener('abort',abort)}
}
export function createConnectionCheck({status,realtimeStatus=null,isAllowed=()=>true,onRetry=()=>{},onCore=()=>{},attempts=3,timeoutMs=8000,sleep=pause}){
 let flight=null,epoch=0;
 async function read(request,signal,source){
  for(let attempt=1;attempt<=attempts;attempt++){
   if(signal.aborted||!isAllowed())throw stopped();
   try{return {value:await bounded(request,signal,timeoutMs),attempts:attempt,state:'received'}}
   catch(error){if(signal.aborted||!isAllowed())throw stopped();if(attempt===attempts||!retryableConnection(error))return {error,attempts:attempt,state:'failed',reason:connectionFailure(error)};onRetry({source,attempt,next:attempt+1});await sleep(attempt===1?350:900,signal)}
  }
 }
 return {
  check(){
   if(flight)return flight.promise;const control=new AbortController(),id=++epoch,item={control,promise:null,corePromise:null};flight=item;
   const diagnostic=r=>r?{state:r.state,attempts:r.attempts,...(r.reason?{reason:r.reason}:{})}:null;
   item.corePromise=read(status,control.signal,'core').then(core=>{
    if(control.signal.aborted||epoch!==id||!isAllowed())return {cancelled:true};
    const result={core:core.value||null,error:core.error||null,diagnostics:{core:diagnostic(core),realtime:null}};onCore(result);return result;
   }).catch(error=>{if(control.signal.aborted||epoch!==id||!isAllowed())return {cancelled:true};throw error});
   item.promise=(async()=>{try{
    const [core,realtime]=await Promise.all([item.corePromise,realtimeStatus?read(realtimeStatus,control.signal,'realtime'):null]);
    if(control.signal.aborted||epoch!==id||!isAllowed())return {cancelled:true};
    return {core:core.core,realtime:realtime?.value||null,error:core.error||null,realtimeFailed:!!realtime?.error,diagnostics:{core:core.diagnostics.core,realtime:diagnostic(realtime)}};
   }catch(error){if(control.signal.aborted||epoch!==id||!isAllowed())return {cancelled:true};throw error}finally{if(flight===item)flight=null}})();item.promise.catch(()=>{});return item.promise;
  },
  checkCore(){this.check();return flight.corePromise},
  cancel(){epoch++;const previous=flight;flight=null;previous?.control.abort()},
  get pending(){return !!flight}
 };
}
