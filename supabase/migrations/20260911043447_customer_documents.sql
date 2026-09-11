-- Customer-level document registry for contracts, PIs and other commercial files.
-- Files stay private and are visible only to users who can access the company.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('customer-documents','customer-documents',false,52428800,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png']::text[])
on conflict (id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,public=false;

create table if not exists public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('contract','proforma_invoice','purchase_order','quotation','payment_proof','other')),
  file_name text not null check (length(trim(file_name)) between 1 and 180),
  storage_bucket text not null default 'customer-documents' check (storage_bucket='customer-documents'),
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes>0 and size_bytes<=52428800),
  notes text,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists customer_documents_company_idx on public.customer_documents(company_id,created_at desc);
alter table public.customer_documents enable row level security;

drop policy if exists customer_documents_select on public.customer_documents;
create policy customer_documents_select on public.customer_documents for select to authenticated
using (
  private.current_crm_role() in ('owner','sales_manager','marketing')
  or exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid()))
);

drop policy if exists customer_documents_insert on public.customer_documents;
create policy customer_documents_insert on public.customer_documents for insert to authenticated
with check (
  uploaded_by=(select auth.uid()) and (
    private.current_crm_role() in ('owner','sales_manager','marketing')
    or exists(select 1 from public.inquiries i where i.company_id=customer_documents.company_id and i.owner_id=(select auth.uid()))
  )
);

drop policy if exists customer_documents_update on public.customer_documents;
create policy customer_documents_update on public.customer_documents for update to authenticated
using (uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'))
with check (uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'));

drop policy if exists customer_documents_delete on public.customer_documents;
create policy customer_documents_delete on public.customer_documents for delete to authenticated
using (uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'));

grant select,insert,update,delete on public.customer_documents to authenticated;
grant all on public.customer_documents to service_role;

drop policy if exists customer_documents_objects_read on storage.objects;
create policy customer_documents_objects_read on storage.objects for select to authenticated
using (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name));

drop policy if exists customer_documents_objects_insert on storage.objects;
create policy customer_documents_objects_insert on storage.objects for insert to authenticated
with check (
  bucket_id='customer-documents' and (storage.foldername(name))[1]::uuid is not null and
  (
    private.current_crm_role() in ('owner','sales_manager','marketing')
    or exists(select 1 from public.inquiries i where i.company_id=((storage.foldername(name))[1])::uuid and i.owner_id=(select auth.uid()))
  )
);

drop policy if exists customer_documents_objects_update on storage.objects;
create policy customer_documents_objects_update on storage.objects for update to authenticated
using (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (d.uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'))))
with check (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (d.uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'))));

drop policy if exists customer_documents_objects_delete on storage.objects;
create policy customer_documents_objects_delete on storage.objects for delete to authenticated
using (bucket_id='customer-documents' and exists(select 1 from public.customer_documents d where d.storage_bucket=bucket_id and d.storage_path=name and (d.uploaded_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager','marketing'))));
