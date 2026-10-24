export function revealOutreachPreview(find){
 const draft=find('#outreach-draft'),body=find('#outreach-body');
 if(!draft||!body||draft.classList.contains('hidden'))return false;
 const section=draft.closest?.('[data-detail-section]');
 if(section?.classList.contains('hidden'))return false;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 body.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
 body.focus({preventScroll:true});
 return true;
}
