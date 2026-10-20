// Reveal content in its own panel only. Never pan the page or a clipped dashboard ancestor.
export function revealInPanel(node,panel){
 if(!node?.getBoundingClientRect||!panel?.getBoundingClientRect||node===panel)return;
 const n=node.getBoundingClientRect(),p=panel.getBoundingClientRect();
 if(n.height>p.height||n.top<p.top)panel.scrollTop+=n.top-p.top;
 else if(n.bottom>p.bottom)panel.scrollTop+=n.bottom-p.bottom;
}
