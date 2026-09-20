// This check is required even for callers whose database client uses service_role.
export async function canAccessInquiry(
  db: any,
  actor: { id: string; role: string; active: boolean; team?: string | null },
  inquiry: { owner_id?: string | null },
): Promise<boolean> {
  if (!actor?.id || actor.active !== true) return false;
  if (actor.role === 'owner') return true;
  if (!['sales', 'sales_manager'].includes(actor.role)) return false;
  if (inquiry.owner_id === actor.id) return true;
  if (actor.role !== 'sales_manager' || !actor.team || !inquiry.owner_id) return false;
  const {data, error} = await db.from('profiles').select('team').eq('id', inquiry.owner_id).maybeSingle();
  return !error && Boolean(data?.team) && data.team === actor.team;
}
