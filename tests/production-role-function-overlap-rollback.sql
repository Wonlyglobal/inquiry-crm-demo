-- Production-safe acceptance for the 2026-09-18 role-overlap optimization.
-- Run as a privileged database operator after the migration. All writes roll back.
begin;

do $$
declare
  assigned_inquiry public.inquiries;
  marketing_id uuid;
  manager_id uuid;
begin
  select i.* into assigned_inquiry
  from public.inquiries i
  join public.profiles p on p.id=i.owner_id and p.active=true and p.role='sales'
  where i.company_id is not null
  order by i.updated_at desc
  limit 1;
  select p.id into marketing_id from public.profiles p where p.active=true and p.role='marketing' order by p.created_at limit 1;
  select p.id into manager_id from public.profiles p where p.active=true and p.role='sales_manager' order by p.created_at limit 1;
  if assigned_inquiry.id is null or marketing_id is null or manager_id is null then
    raise exception 'ROLE_OVERLAP_TEST_FIXTURE_MISSING';
  end if;
  perform set_config('crm.role_test_inquiry',assigned_inquiry.id::text,true);
  perform set_config('crm.role_test_company',assigned_inquiry.company_id::text,true);
  perform set_config('crm.role_test_sales',assigned_inquiry.owner_id::text,true);
  perform set_config('crm.role_test_marketing',marketing_id::text,true);
  perform set_config('crm.role_test_manager',manager_id::text,true);
end;
$$;

-- Market cannot alter an assigned inquiry or its contact policy.
select set_config('request.jwt.claim.sub',current_setting('crm.role_test_marketing'),true);
set local role authenticated;
do $$
declare blocked text;
begin
  begin
    update public.inquiries set title=title where id=current_setting('crm.role_test_inquiry')::uuid;
    raise exception 'MARKETING_ASSIGNED_INQUIRY_WRITE_ALLOWED';
  exception when others then
    blocked:=sqlerrm;
    if blocked='MARKETING_ASSIGNED_INQUIRY_WRITE_ALLOWED'
      or position('已分配询盘由销售负责人维护' in blocked)=0 then raise; end if;
  end;
  begin
    perform public.save_inquiry_contact_policy(
      current_setting('crm.role_test_inquiry')::uuid,'unknown',false,7,null,null,'生产回滚验证'
    );
    raise exception 'MARKETING_ASSIGNED_CONTACT_POLICY_ALLOWED';
  exception when others then
    blocked:=sqlerrm;
    if blocked='MARKETING_ASSIGNED_CONTACT_POLICY_ALLOWED'
      or position('触达规则由负责业务员维护' in blocked)=0 then raise; end if;
  end;
end;
$$;
reset role;

-- A manager can use the qualification workflow, but cannot silently perform
-- salesperson edits, maintain contacts or upload transaction documents.
select set_config('request.jwt.claim.sub',current_setting('crm.role_test_manager'),true);
set local role authenticated;
do $$
declare
  item public.inquiries;
  blocked text;
  saved jsonb;
begin
  select * into item from public.inquiries where id=current_setting('crm.role_test_inquiry')::uuid;
  begin
    update public.inquiries set title=title where id=item.id;
    raise exception 'MANAGER_DIRECT_INQUIRY_WRITE_ALLOWED';
  exception when others then
    blocked:=sqlerrm;
    if blocked='MANAGER_DIRECT_INQUIRY_WRITE_ALLOWED'
      or position('不能直接代替业务员编辑询盘' in blocked)=0 then raise; end if;
  end;

  select public.save_inquiry_qualification(
    item.id,item.qualification_identity,item.qualification_need,item.qualification_role,
    item.qualification_value,item.qualification_timing,item.qualification_fit,
    item.qualification_next_step,coalesce(item.lead_priority,'P2'),'生产回滚验证：主管资格定级仍可用'
  ) into saved;
  if saved is null then raise exception 'MANAGER_QUALIFICATION_WORKFLOW_FAILED'; end if;

  begin
    perform public.add_customer_contact(
      current_setting('crm.role_test_company')::uuid,'回滚测试联系人','rollback@example.invalid',
      null,null,null,null,'生产回滚验证'
    );
    raise exception 'MANAGER_CONTACT_MAINTENANCE_ALLOWED';
  exception when others then
    blocked:=sqlerrm;
    if blocked='MANAGER_CONTACT_MAINTENANCE_ALLOWED'
      or position('不能代替负责业务员维护联系人' in blocked)=0 then raise; end if;
  end;

  begin
    insert into public.customer_documents(
      company_id,document_type,file_name,storage_path,content_type,size_bytes,uploaded_by
    ) values (
      current_setting('crm.role_test_company')::uuid,'other','manager-should-not-upload.txt',
      current_setting('crm.role_test_company')||'/role-overlap-manager-'||gen_random_uuid()::text,
      'text/plain',1,current_setting('crm.role_test_manager')::uuid
    );
    raise exception 'MANAGER_DOCUMENT_UPLOAD_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- The assigned salesperson remains able to maintain the account document.
select set_config('request.jwt.claim.sub',current_setting('crm.role_test_sales'),true);
set local role authenticated;
insert into public.customer_documents(
  company_id,document_type,file_name,storage_path,content_type,size_bytes,uploaded_by
) values (
  current_setting('crm.role_test_company')::uuid,'other','sales-rollback-proof.txt',
  current_setting('crm.role_test_company')||'/role-overlap-sales-'||gen_random_uuid()::text,
  'text/plain',1,current_setting('crm.role_test_sales')::uuid
);
reset role;

rollback;

do $$
begin
  if exists(select 1 from public.audit_logs where reason='生产回滚验证：主管资格定级仍可用') then
    raise exception 'ROLE_OVERLAP_ROLLBACK_AUDIT_RESIDUE';
  end if;
  if exists(select 1 from public.customer_documents where file_name in ('manager-should-not-upload.txt','sales-rollback-proof.txt')) then
    raise exception 'ROLE_OVERLAP_ROLLBACK_DOCUMENT_RESIDUE';
  end if;
end;
$$;

select concat(
  'trigger=',exists(select 1 from pg_trigger where tgname='inquiries_role_overlap_scope' and not tgisinternal),
  '; market_assigned_message_scope=',exists(select 1 from pg_policies where schemaname='public' and tablename='email_messages' and policyname='email_messages_read_visible' and qual like '%owner_id IS NULL%'),
  '; market_quote_scope=',exists(select 1 from pg_policies where schemaname='public' and tablename='quotation_versions' and policyname='quotation_versions_read' and qual like '%owner_id IS NULL%'),
  '; manager_document_write=',exists(select 1 from pg_policies where schemaname='public' and tablename='customer_documents' and policyname='customer_documents_insert' and with_check like '%sales_manager%'),
  '; rollback_audits=',(select count(*) from public.audit_logs where reason like '生产回滚验证%'),
  '; rollback_documents=',(select count(*) from public.customer_documents where file_name in ('manager-should-not-upload.txt','sales-rollback-proof.txt'))
) as production_role_overlap_acceptance;
