-- Align database writes with the 2026-09-18 role overlap audit.
-- Market owns intake/attribution/nurture, managers own assignment/approval,
-- and sales owns customer follow-up and commercial execution.

begin;

-- Market may prepare contacts before hand-off, but an assigned account is
-- maintained by its sales owner, not by market or a supervising manager.
create or replace function public.add_customer_contact(
  target_company_id uuid,
  contact_name text,
  contact_email text default null,
  contact_phone text default null,
  contact_whatsapp text default null,
  contact_job_title text default null,
  contact_linkedin_url text default null,
  change_reason text default null
)
returns public.contacts
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.crm_role;
  saved public.contacts;
  normalized_email text := nullif(lower(trim(contact_email)), '');
begin
  if actor_id is null then raise exception '请先登录'; end if;
  select p.role into actor_role from public.profiles p where p.id=actor_id and p.active=true;
  if actor_role is null then raise exception '当前账号无权新增联系人'; end if;
  if not exists (
    select 1 from public.companies c
    where c.id=target_company_id and (
      actor_role='owner'
      or (actor_role='sales' and exists(select 1 from public.inquiries i where i.company_id=c.id and i.owner_id=actor_id))
      or (actor_role='marketing' and not exists(select 1 from public.inquiries i where i.company_id=c.id and i.owner_id is not null))
      or (actor_role='sales' and c.created_by=actor_id and not exists(select 1 from public.inquiries i where i.company_id=c.id))
    )
  ) then
    if actor_role='marketing' then raise exception '该客户已进入销售阶段，市场部不再维护联系人'; end if;
    raise exception '当前角色不能代替负责业务员维护联系人';
  end if;
  if nullif(trim(contact_name),'') is null then raise exception '联系人姓名不能为空'; end if;
  if normalized_email is null and nullif(trim(contact_phone),'') is null and nullif(trim(contact_whatsapp),'') is null then raise exception '邮箱、电话或 WhatsApp 至少填写一项'; end if;
  if normalized_email is not null and normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception '联系人邮箱格式不正确'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写新增联系人依据'; end if;
  if normalized_email is not null and exists(select 1 from public.contacts c where c.company_id=target_company_id and lower(c.email)=normalized_email) then raise exception '该客户下已存在相同邮箱的联系人'; end if;
  insert into public.contacts(company_id,full_name,email,phone,whatsapp,job_title,linkedin_url,created_by)
  values(target_company_id,trim(contact_name),normalized_email,nullif(trim(contact_phone),''),nullif(trim(contact_whatsapp),''),nullif(trim(contact_job_title),''),nullif(trim(contact_linkedin_url),''),actor_id)
  returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor_id,'contact',saved.id,'contact_created','{}'::jsonb,jsonb_build_object('company_id',saved.company_id,'full_name',saved.full_name,'email',saved.email,'phone',saved.phone,'whatsapp',saved.whatsapp,'job_title',saved.job_title,'linkedin_url',saved.linkedin_url),trim(change_reason));
  return saved;
end;
$$;

-- Assigned sales communication, drafts, quotations and summaries are not market
-- data. Managers keep team audit visibility while market only sees unassigned
-- intake records. This makes the boundary enforceable through the API too.
drop policy if exists communication_summaries_read_visible on public.communication_summaries;
create policy communication_summaries_read_visible on public.communication_summaries for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=communication_summaries.inquiry_id and (
  private.current_crm_role() in ('owner','sales_manager')
  or i.owner_id=(select auth.uid())
  or (private.current_crm_role()='marketing' and i.owner_id is null)
)));

drop policy if exists email_messages_read_visible on public.email_messages;
create policy email_messages_read_visible on public.email_messages for select to authenticated
using (
  exists(select 1 from public.mailbox_connections mc where mc.id=email_messages.mailbox_connection_id and mc.user_id=(select auth.uid()))
  or exists(select 1 from public.inquiries i where i.id=email_messages.inquiry_id and (
    private.current_crm_role() in ('owner','sales_manager')
    or i.owner_id=(select auth.uid())
    or (private.current_crm_role()='marketing' and i.owner_id is null)
  ))
  or (email_messages.inquiry_id is null and private.current_crm_role() in ('owner','sales_manager','marketing'))
);

drop policy if exists follow_ups_read on public.follow_ups;
create policy follow_ups_read on public.follow_ups for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=follow_ups.inquiry_id and (
  private.current_crm_role() in ('owner','sales_manager')
  or i.owner_id=(select auth.uid())
  or (private.current_crm_role()='marketing' and i.owner_id is null)
)));

drop policy if exists quotation_versions_read on public.quotation_versions;
create policy quotation_versions_read on public.quotation_versions for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=quotation_versions.inquiry_id and (
  private.current_crm_role() in ('owner','sales_manager')
  or i.owner_id=(select auth.uid())
  or (private.current_crm_role()='marketing' and i.owner_id is null)
)));

drop policy if exists outreach_drafts_read on public.outreach_drafts;
create policy outreach_drafts_read on public.outreach_drafts for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=outreach_drafts.inquiry_id and (
  private.current_crm_role() in ('owner','sales_manager')
  or i.owner_id=(select auth.uid())
  or (private.current_crm_role()='marketing' and i.owner_id is null)
)));

drop policy if exists outreach_drafts_insert on public.outreach_drafts;
create policy outreach_drafts_insert on public.outreach_drafts for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.inquiries i where i.id=outreach_drafts.inquiry_id and (
    private.current_crm_role()='owner'
    or (private.current_crm_role()='sales' and i.owner_id=(select auth.uid()))
  ))
);

-- Only the owner or assigned salesperson maintains transaction files. Managers
-- review them through the workflow instead of replacing the salesperson's work.
drop policy if exists customer_documents_select on public.customer_documents;
create policy customer_documents_select on public.customer_documents for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager')
  or (private.current_crm_role()='sales' and exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid())))
);

drop policy if exists customer_documents_insert on public.customer_documents;
create policy customer_documents_insert on public.customer_documents for insert to authenticated
with check (uploaded_by=(select auth.uid()) and (
  private.current_crm_role()='owner'
  or (private.current_crm_role()='sales' and exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid())))
));
drop policy if exists customer_documents_update on public.customer_documents;
create policy customer_documents_update on public.customer_documents for update to authenticated
using (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid()))))
with check (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid()))));
drop policy if exists customer_documents_delete on public.customer_documents;
create policy customer_documents_delete on public.customer_documents for delete to authenticated
using (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid()))));

drop policy if exists customer_documents_objects_insert on storage.objects;
drop policy if exists customer_documents_objects_read on storage.objects;
create policy customer_documents_objects_read on storage.objects for select to authenticated
using (bucket_id='customer-documents' and exists(
  select 1 from public.customer_documents d
  where d.storage_bucket=bucket_id and d.storage_path=name
));

create policy customer_documents_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='customer-documents' and (storage.foldername(name))[1]::uuid is not null and (
  private.current_crm_role()='owner'
  or (private.current_crm_role()='sales' and exists(select 1 from public.inquiries i where i.company_id=((storage.foldername(name))[1])::uuid and i.owner_id=(select auth.uid())))
));
drop policy if exists customer_documents_objects_update on storage.objects;
create policy customer_documents_objects_update on storage.objects for update to authenticated
using (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and d.uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=d.company_id and i.owner_id=(select auth.uid()))))))
with check (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and d.uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=d.company_id and i.owner_id=(select auth.uid()))))));
drop policy if exists customer_documents_objects_delete on storage.objects;
create policy customer_documents_objects_delete on storage.objects for delete to authenticated
using (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (private.current_crm_role()='owner' or (private.current_crm_role()='sales' and d.uploaded_by=(select auth.uid()) and exists(select 1 from public.inquiries i where i.company_id=d.company_id and i.owner_id=(select auth.uid()))))));

-- Once a lead is assigned, market cannot change sales-owned inquiry fields by
-- issuing a direct table update. Attribution remains a separate audited table.
create or replace function private.enforce_role_overlap_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.current_crm_role()='sales_manager'
     and coalesce(current_setting('app.inquiry_workflow_rpc',true),'')<>'on'
     and coalesce(current_setting('app.qualification_workflow_rpc',true),'')<>'on'
  then raise exception '销售主管请使用分配、审批或复核流程，不能直接代替业务员编辑询盘'; end if;
  if private.current_crm_role()='sales_manager'
     and new.validity is distinct from old.validity
     and not (old.invalid_review_status='pending' and new.invalid_review_status in ('approved','rejected'))
  then raise exception '销售主管仅处理有效性争议复核，正常初判由市场部完成'; end if;
  if private.current_crm_role()='marketing'
     and old.owner_id is not null
  then raise exception '已分配询盘由销售负责人维护，市场部仅保留归因与结果查看'; end if;
  return new;
end;
$$;
drop trigger if exists inquiries_role_overlap_scope on public.inquiries;
create trigger inquiries_role_overlap_scope before update on public.inquiries for each row execute function private.enforce_role_overlap_scope();

-- Contact policy follows the same hand-off boundary.
create or replace function public.save_inquiry_contact_policy(target_inquiry_id uuid, consent text, suppress_contact boolean, interval_days integer, next_contact_at timestamptz, note text, change_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.inquiries; previous public.inquiry_contact_policies; actor_role public.crm_role:=private.current_crm_role();
begin
  select * into item from public.inquiries where id=target_inquiry_id;
  if not found then raise exception '询盘不存在'; end if;
  if actor_role='sales' and item.owner_id is distinct from auth.uid() then raise exception '只能维护本人负责询盘的触达规则'; end if;
  if actor_role='marketing' and item.owner_id is not null then raise exception '询盘已分配，触达规则由负责业务员维护'; end if;
  if actor_role not in ('owner','marketing','sales') then raise exception '当前角色不能维护触达规则'; end if;
  if consent not in ('unknown','legitimate_interest','opted_in','opted_out') then raise exception '请选择有效的同意状态'; end if;
  if interval_days not between 1 and 90 then raise exception '频控间隔必须为 1–90 天'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写修改原因'; end if;
  select * into previous from public.inquiry_contact_policies where inquiry_id=target_inquiry_id;
  insert into public.inquiry_contact_policies(inquiry_id,consent_status,do_not_contact,min_interval_days,next_allowed_at,policy_note,updated_by)
  values(target_inquiry_id,consent,suppress_contact or consent='opted_out',interval_days,next_contact_at,nullif(trim(note),''),auth.uid())
  on conflict(inquiry_id) do update set consent_status=excluded.consent_status,do_not_contact=excluded.do_not_contact,min_interval_days=excluded.min_interval_days,next_allowed_at=excluded.next_allowed_at,policy_note=excluded.policy_note,updated_by=auth.uid(),updated_at=clock_timestamp();
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'contact_policy_updated',trim(change_reason),to_jsonb(previous),jsonb_build_object('consent_status',consent,'do_not_contact',suppress_contact or consent='opted_out','min_interval_days',interval_days,'next_allowed_at',next_contact_at,'policy_note',nullif(trim(note),'')));
end;
$$;

-- Daily market execution stays with market; managers review exceptions instead.
create or replace function public.save_inquiry_nurture(target_inquiry_id uuid, next_nurture_at timestamptz, nurture_content text, change_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.inquiries; occurred_at timestamptz:=clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','marketing') then raise exception '仅市场部或老板可维护培育计划'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写修改原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.sales_disposition<>'recycled' then raise exception '只有退回市场的线索可进入培育计划'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set nurture_status='nurturing',nurture_next_at=next_nurture_at,nurture_note=nullif(trim(nurture_content),''),nurture_updated_at=occurred_at,nurture_updated_by=auth.uid(),updated_at=occurred_at,updated_by=auth.uid(),last_change_reason=trim(change_reason) where id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data) values(auth.uid(),'inquiry',target_inquiry_id,'nurture_plan_updated',trim(change_reason),jsonb_build_object('nurture_status',item.nurture_status,'nurture_next_at',item.nurture_next_at,'nurture_note',item.nurture_note),jsonb_build_object('nurture_status','nurturing','nurture_next_at',next_nurture_at,'nurture_note',nullif(trim(nurture_content),'')));
end;
$$;

create or replace function public.resubmit_nurtured_inquiry(target_inquiry_id uuid, change_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.inquiries; occurred_at timestamptz:=clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','marketing') then raise exception '仅市场部或老板可重新提交培育线索'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写重新提交依据'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found then raise exception '询盘不存在'; end if;
  if item.sales_disposition<>'recycled' then raise exception '该线索当前不在市场培育池'; end if;
  perform set_config('app.inquiry_workflow_rpc','on',true);
  update public.inquiries set sales_disposition='pending',sales_disposition_at=null,sales_disposition_by=null,recycle_reason=null,nurture_status='ready',nurture_next_at=null,nurture_updated_at=occurred_at,nurture_updated_by=auth.uid(),owner_id=null,status='pending_assignment',assigned_at=null,first_contact_due_at=occurred_at+interval '4 hours',updated_at=occurred_at,updated_by=auth.uid(),last_change_reason=trim(change_reason) where id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data) values(auth.uid(),'inquiry',target_inquiry_id,'nurture_resubmitted',trim(change_reason),jsonb_build_object('sales_disposition',item.sales_disposition,'owner_id',item.owner_id,'status',item.status,'nurture_status',item.nurture_status),jsonb_build_object('sales_disposition','pending','owner_id',null,'status','pending_assignment','nurture_status','ready'));
end;
$$;

-- Historical import has one accountable owner. Managers may inspect current
-- business state elsewhere but cannot silently rewrite the legacy archive.
create or replace function public.import_legacy_engineering_projects(p_rows jsonb,p_source_file text)
returns integer language plpgsql security definer set search_path='' as $$
begin
  if private.current_crm_role()<>'owner' then raise exception '仅资料管理员（老板角色）可导入历史工程'; end if;
  return private.import_legacy_engineering_projects(p_rows,p_source_file);
end;
$$;

-- Knowledge authorship belongs to owner/market content administration;
-- managers retain read access and review through management views.
drop policy if exists sales_knowledge_manage_insert on public.sales_knowledge_articles;
create policy sales_knowledge_manage_insert on public.sales_knowledge_articles for insert to authenticated
with check (created_by=(select auth.uid()) and private.current_crm_role() in ('owner','marketing'));
drop policy if exists sales_knowledge_manage_update on public.sales_knowledge_articles;
create policy sales_knowledge_manage_update on public.sales_knowledge_articles for update to authenticated
using (private.current_crm_role() in ('owner','marketing'))
with check (private.current_crm_role() in ('owner','marketing'));

notify pgrst,'reload schema';
commit;
