begin;
-- Restrictive policy ANDs with existing ownership policies; it grants no new access.
create or replace function private.crm_sensitive_download_allowed()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and active=true)
    and not exists(select 1 from public.risk_user_controls where user_id=auth.uid()
      and (download_suspended or sensitive_reveal_suspended));
$$;
revoke all on function private.crm_sensitive_download_allowed() from public,anon;
grant execute on function private.crm_sensitive_download_allowed() to authenticated;
create policy crm_sensitive_download_risk_guard on storage.objects
as restrictive for select to authenticated
using (bucket_id not in ('customer-documents','email-attachments','research-attachments')
  or (select private.crm_sensitive_download_allowed()));
commit;
