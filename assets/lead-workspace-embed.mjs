// Same-origin workspace presentation only. Authorization stays in the original RPCs.
if (window.parent !== window && new URLSearchParams(location.search).get('embed') === '1') {
  const back = document.querySelector('header > a[href="/"]');
  if (back) back.hidden = true;
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('/sales-leads.html') || url.pathname === location.pathname) return;
    event.preventDefault();
    const nav = parent.document.querySelector('.nav[data-view="sales-leads"]');
    nav?.click();
  });
}
