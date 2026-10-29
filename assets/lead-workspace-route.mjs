export function leadWorkspaceHref(role){return role==='sales'?'sales-leads.html#entry':'sales-leads.html#lead-dashboard'}

export function leadWorkspaceRoute(view, role) {
  if (view === 'company-candidates') return {key:view, href:'company-candidates.html?embed=1', anchor:''};
  const anchor = view === 'sales-lead-entry' && role === 'sales' ? '#entry' : view === 'weekly-customers' ? '#weekly-customer' : view === 'sales-leads' ? '#lead-dashboard' : null;
  return anchor ? {key:'sales-leads', href:'sales-leads.html?embed=1'+anchor, anchor} : null;
}
