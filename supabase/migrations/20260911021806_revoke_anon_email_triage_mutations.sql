-- The email triage and maintenance RPCs are SECURITY DEFINER and must never
-- be callable by an anonymous browser. Keep the authenticated grants intact;
-- each function still performs its own role/ownership checks.
revoke all on function public.convert_email_intakes_to_inquiries(uuid[]) from public, anon;
revoke all on function public.delete_trashed_email_intakes(uuid[]) from public, anon;
revoke all on function public.restore_email_intakes(uuid[]) from public, anon;
revoke all on function public.trash_email_intakes(uuid[]) from public, anon;
revoke all on function public.triage_email_intakes(uuid[], text) from public, anon;
revoke all on function public.rls_auto_enable() from public, anon;

grant execute on function public.convert_email_intakes_to_inquiries(uuid[]) to authenticated;
grant execute on function public.delete_trashed_email_intakes(uuid[]) to authenticated;
grant execute on function public.restore_email_intakes(uuid[]) to authenticated;
grant execute on function public.trash_email_intakes(uuid[]) to authenticated;
grant execute on function public.triage_email_intakes(uuid[], text) to authenticated;
grant execute on function public.rls_auto_enable() to authenticated;
