-- Only trusted delivery workers may finalize an approved quotation as sent.
-- Browser clients must go through mailbox-compose-send, which first completes
-- SMTP delivery and then invokes this RPC with the service-role client.

revoke all on function public.mark_quotation_sent(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mark_quotation_sent(uuid,uuid)
  to service_role;

