// Follow new content until a deliberate reading gesture pauses it.
export function mountChatScroll({scroller,content,active=()=>true,buttonHost=null}) {
 let follow=true,frame=0,disposed=false,touchY=0;
 const listeners=[];
 const listen=(target,name,handler)=>{target.addEventListener(name,handler,{passive:true});listeners.push(()=>target.removeEventListener?.(name,handler))};
 const button=buttonHost?.ownerDocument.createElement('button');
 const nearBottom=()=>scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<72;
 const updateButton=()=>{if(button)button.hidden=!active()||follow||nearBottom()};
 const schedule=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(disposed)return;if(active()&&follow)scroller.scrollTop=scroller.scrollHeight;updateButton()})};
 const pause=()=>{follow=false;updateButton()};
 if(button){button.type='button';button.className='grace-jump-latest';button.textContent='↓ 回到最新消息';button.hidden=true;button.style.cssText='position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:5;white-space:nowrap;border:1px solid #e6e1f2;border-radius:24px;padding:10px 16px;background:#fff;color:#65558f;font:inherit;box-shadow:0 3px 14px #30234b14';buttonHost.prepend(button);button.onclick=()=>{follow=true;schedule()}}
 // Resize, browser anchoring and keyboard movement are not reading gestures.
 listen(scroller,'scroll',()=>{updateButton()});
 listen(scroller,'wheel',e=>{if(e.deltaY<0)pause();else if(e.deltaY>0&&nearBottom()){follow=true;schedule()}});
 listen(scroller,'touchstart',e=>{touchY=e.touches[0]?.clientY||0});
 listen(scroller,'touchmove',e=>{const y=e.touches[0]?.clientY||0;if(y>touchY+2)pause();else if(y<touchY-2&&nearBottom()){follow=true;schedule()}touchY=y});
 listen(scroller,'touchend',()=>{if(nearBottom()){follow=true;schedule()}});
 listen(scroller,'keydown',e=>{if(['ArrowUp','PageUp','Home'].includes(e.key))pause();else if(e.key==='End'){follow=true;schedule()}});
 const changes=new MutationObserver(schedule);changes.observe(content,{childList:true,subtree:true,characterData:true});
 const sizes=new ResizeObserver(schedule);sizes.observe(content);sizes.observe(scroller);
 content.addEventListener('load',schedule,true);
 schedule();
 return {latest(){follow=true;schedule()},disconnect(){disposed=true;button?.remove();changes.disconnect();sizes.disconnect();cancelAnimationFrame(frame);listeners.forEach(remove=>remove());content.removeEventListener?.('load',schedule,true)}};
}
