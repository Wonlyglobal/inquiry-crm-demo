// Membership is supplied by the CRM profiles query under the authenticated JWT.
// This projection grants no access to conversation, material or owner-only data.
export function enterpriseSession(user, profile) {
  if (!user?.id || profile?.id !== user.id || profile.active !== true ||
      !['owner', 'sales_manager', 'marketing', 'sales'].includes(profile.role)) return null;
  return { accountId: user.id, role: profile.role, space: 'enterprise' };
}
