// Native keyboardLayoutGuide resizes WKWebView; visualViewport covers browsers.
export function fitGraceViewport(root){
 const viewport=window.visualViewport;
 let baseline=window.innerHeight;
 const fit=()=>{
  const height=viewport?.height||window.innerHeight;
  const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
  if(!editing)baseline=window.innerHeight;
  root.style.setProperty('--grace-viewport-height',`${height}px`);
  root.style.setProperty('--grace-viewport-top',`${viewport?.offsetTop||0}px`);
  root.classList.toggle('keyboard-open',editing&&Math.max(baseline,window.innerHeight)-height>100);
 };
 viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
 window.addEventListener('resize',fit);document.addEventListener('focusin',fit);document.addEventListener('focusout',()=>requestAnimationFrame(fit));fit();
}
