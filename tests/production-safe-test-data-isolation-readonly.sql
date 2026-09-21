-- Read-only production acceptance for 20260921123000_safe_test_data_isolation.sql.
do $$
declare
  target_profile_id constant uuid := '010ed7a4-3624-43cc-87f7-fe51655de257';
  target_inquiry_id constant uuid := 'b175fd07-3e21-4060-aeda-e3c869c11847';
begin
  if not exists(select 1 from public.profiles where id=target_profile_id and is_test_data and data_environment='test' and active=false) then raise exception 'FAIL: acceptance profile is not quarantined'; end if;
  if not exists(select 1 from public.inquiries where id=target_inquiry_id and is_test_data and data_environment='test' and excluded_from_dashboard and validity='invalid') then raise exception 'FAIL: acceptance inquiry is not quarantined'; end if;
  if exists(select 1 from public.data_quality_alerts where inquiry_id=target_inquiry_id and resolved_at is null) then raise exception 'FAIL: acceptance inquiry still has open data-quality alerts'; end if;
  if exists(select 1 from public.email_reply_reminders where inquiry_id=target_inquiry_id and status='open') then raise exception 'FAIL: acceptance inquiry still has open reply reminders'; end if;
  if exists(select 1 from public.notifications where (inquiry_id=target_inquiry_id or recipient_id=target_profile_id) and read_at is null) then raise exception 'FAIL: acceptance notifications remain unread'; end if;
  if exists(select 1 from public.risk_cases where inquiry_id=target_inquiry_id and status not in ('resolved','false_positive')) then raise exception 'FAIL: acceptance inquiry still has an active risk case'; end if;
  if not exists(select 1 from public.audit_logs where entity_type='inquiry' and entity_id=target_inquiry_id and action='test_data_quarantined') then raise exception 'FAIL: quarantine audit evidence is missing'; end if;
end;
$$;

select 'PASS — audited acceptance fixture is quarantined; history and evidence remain intact' as production_acceptance;
