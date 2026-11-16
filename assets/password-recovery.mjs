// Keep only flow intent and SDK-verified session in memory; never persist URL credentials.
export function recoveryIntent(location){
 const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,''));
 return query.get('auth')==='recovery'||query.get('type')==='recovery'||hash.get('type')==='recovery'||query.has('error_code')||hash.has('error_code');
}
export function recoveryRedirect(location){const url=new URL(location.pathname,location.origin);url.searchParams.set('auth','recovery');return url.href}
export function cleanRecoveryUrl(location){const url=new URL(location.href);for(const key of ['auth','type','code','error','error_code','error_description'])url.searchParams.delete(key);return url.pathname+url.search}
export function observePasswordRecovery(auth,requested){
 let verifiedSession=null,listener=null;
 const {data}=auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'&&session?.user&&session?.access_token){verifiedSession=session;listener?.(session)}
  if(event==='SIGNED_OUT'){verifiedSession=null}
 });
 return {requested,get session(){return verifiedSession},onVerified(callback){listener=callback;if(verifiedSession)callback(verifiedSession)},dispose(){data?.subscription?.unsubscribe()}};
}
