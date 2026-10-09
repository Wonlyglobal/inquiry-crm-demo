begin;
alter policy crm_sensitive_download_risk_guard on storage.objects to authenticated,crm_marketing_readonly;
grant execute on function private.crm_sensitive_download_allowed() to crm_marketing_readonly;
commit;
