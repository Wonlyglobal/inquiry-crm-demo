begin;
-- The worker must not SELECT integration_events directly. Only return exact
-- sent Message-IDs for its valid, scoped historical-read lease.
create function public.read_inquiry_mail_history_forward_ids(job_key uuid,lease_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare task private.inquiry_mail_history_jobs; request private.inquiry_mail_history_requests; actor public.profiles; item public.inquiries; result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service worker required';end if;
 select * into task from private.inquiry_mail_history_jobs where id=job_key and lease_token=lease_key and status='running' and lease_until>=clock_timestamp();
 select * into request from private.inquiry_mail_history_requests where id=task.request_id;
 select * into actor from public.profiles where id=request.requested_by and active and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 select * into item from public.inquiries where id=request.inquiry_id and archived_at is null and merged_into_id is null and not coalesce(is_test_data,false) and not coalesce(excluded_from_dashboard,false) and coalesce(data_environment,'production')='production';
 if task.id is null or actor.id is null or coalesce(actor.role::text,'') not in ('owner','sales_manager','sales') or item.id is null or item.owner_id is distinct from request.owner_id or not(actor.role::text='owner' or item.owner_id=actor.id or actor.role::text='sales_manager' and coalesce(private.crm_manager_covers_inquiry(actor.id,item.id),false)) then raise exception 'history_scope_changed';end if;
 if not exists(select 1 from public.profiles p where p.id=request.owner_id and p.active and not coalesce(p.is_test_data,false) and coalesce(p.data_environment,'production')='production') then raise exception 'owner_account_inactive';end if;
 if not exists(select 1 from public.mailbox_connections c where c.id=task.connection_id and c.user_id=request.owner_id and c.mailbox_kind='personal' and c.status='connected' and c.sync_enabled) then raise exception 'mailbox_unavailable';end if;
 select coalesce(jsonb_agg(jsonb_build_object('provider_message_id',e.provider_message_id) order by e.created_at,e.id),'[]') into result from (select id,provider_message_id,created_at from public.integration_events where inquiry_id=request.inquiry_id and event_type='forward_original_email' and delivery_status='sent' and provider_message_id is not null order by created_at,id limit 101)e;
 return result;
end $$;
revoke all on function public.read_inquiry_mail_history_forward_ids(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_inquiry_mail_history_forward_ids(uuid,uuid) to service_role;
commit;
