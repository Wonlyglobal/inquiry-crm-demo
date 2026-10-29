// Retry only an empty same-origin frame; never reload an existing form document.
const states=new WeakMap();
export function openLeadWorkspaceFrame(frame,route,{setTimer=setTimeout,clearTimer=clearTimeout,base=location.href}={}){
 let state=states.get(frame);
 if(!state){
  state={timer:null,retried:false,target:null};states.set(frame,state);
  state.ready=()=>{try{const doc=frame.contentDocument;return Boolean(doc&&doc.URL!=='about:blank'&&doc.body?.childElementCount)}catch{return false}};
  state.arm=()=>{if(state.timer!==null)clearTimer(state.timer);state.timer=setTimer(()=>{state.timer=null;if(state.ready()||state.retried)return;state.retried=true;const target=new URL(state.target,base);target.searchParams.set('workspace_retry','1');frame.src=target.href;},8000)};
  frame.addEventListener('load',()=>{if(state.ready()&&state.timer!==null){clearTimer(state.timer);state.timer=null}});
 }
 const target=new URL(route.href,base);if(state.retried)target.searchParams.set('workspace_retry','1');
 state.target=target.href;
 if(!frame.getAttribute('src')||frame.dataset.workspaceView!==route.view){frame.src=target.href;if(!state.ready())state.arm()}
 frame.dataset.workspaceView=route.view;
}
