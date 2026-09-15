-- All interactive follow-ups must use V2 so priority, reminder and rollover
-- metadata cannot be skipped through the original compatibility RPC.

revoke all on function public.record_inquiry_followup(uuid,text,text,text,timestamptz,boolean)
  from public, anon, authenticated;

