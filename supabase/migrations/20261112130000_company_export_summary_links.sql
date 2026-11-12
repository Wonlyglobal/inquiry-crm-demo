-- Freeze stable relation IDs for the company-by-salesperson master sheet. No name matching.
begin;
create or replace function private.company_export_display_row(kind text,item jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company_name text; sales_name text; contact_name text; author_name text; reviewer_name text; inquiry_title text; inquiry_id uuid; company_ref uuid; sales_ref uuid; staff_list jsonb;
begin
 inquiry_id:=case when kind='opportunities' then (item->>'id')::uuid else (item->>'inquiry_id')::uuid end;
 if kind in ('followups','quotations') or (kind='leads' and inquiry_id is not null) then
  select c.name,p.full_name,i.title,c.id,i.owner_id into company_name,sales_name,inquiry_title,company_ref,sales_ref from public.inquiries i left join public.companies c on c.id=i.company_id left join public.profiles p on p.id=i.owner_id where i.id=inquiry_id;
 else
  company_ref:=(item->>'company_id')::uuid; sales_ref:=coalesce((item->>'owner_id')::uuid,(item->>'sales_id')::uuid);
  select c.name into company_name from public.companies c where c.id=(item->>'company_id')::uuid;
  select p.full_name into sales_name from public.profiles p where p.id=coalesce((item->>'owner_id')::uuid,(item->>'sales_id')::uuid);
 end if;
 if kind='leads' then sales_ref:=(item->>'sales_id')::uuid; select p.full_name into sales_name from public.profiles p where p.id=sales_ref; end if;
 if kind='customers' then company_ref:=(item->>'id')::uuid; end if;
 if kind in ('customers','contacts') then
  select string_agg(distinct p.full_name,'、' order by p.full_name),coalesce(jsonb_agg(distinct jsonb_build_object('id',p.id,'name',p.full_name)),'[]') into sales_name,staff_list from public.inquiries i join public.profiles p on p.id=i.owner_id where i.company_id=(case when kind='customers' then item->>'id' else item->>'company_id' end)::uuid and not coalesce(i.is_test_data,false) and coalesce(i.data_environment,'production')='production' and i.archived_at is null and i.merged_into_id is null and not coalesce(i.excluded_from_dashboard,false);
 end if;
 select c.full_name into contact_name from public.contacts c where c.id=(item->>'contact_id')::uuid;
 select p.full_name into author_name from public.profiles p where p.id=coalesce((item->>'author_id')::uuid,(item->>'created_by')::uuid);
 select p.full_name into reviewer_name from public.profiles p where p.id=(item->>'reviewed_by')::uuid;
 return item||jsonb_build_object('负责业务员清单',staff_list,'关联公司编号',company_ref,'负责业务员编号',sales_ref,'关联公司名称',company_name,'负责业务员姓名',sales_name,'联系人姓名',contact_name,'记录人姓名',author_name,'审核人姓名',reviewer_name,'关联商机主题',inquiry_title);
end $$;
commit;
