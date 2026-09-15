-- Quotation state is written only by the audited workflow RPCs.
-- The legacy total-only creator bypasses line-item validation, and direct
-- table writes could otherwise bypass approval and delivery state changes.

revoke all on function public.create_quotation_version(uuid,text,text,numeric,text,date,text)
  from public,anon,authenticated;

revoke insert,update,delete on table public.quotation_versions
  from authenticated;
grant select on table public.quotation_versions
  to authenticated;
grant all on table public.quotation_versions
  to service_role;

