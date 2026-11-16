-- Human-confirmed duplicate inbound into oldest assigned master; ownership never changes.
begin;
DO $guard$ begin
if (select md5(prosrc) from pg_proc where oid='private.merge_email(public.inquiries)'::regprocedure)<>'537572886a3a86eed2a870715106db8a' then raise exception 'Merge function drift: private.merge_email(public.inquiries)'; end if;
if (select md5(prosrc) from pg_proc where oid='public.inquiry_merge_workspace(uuid)'::regprocedure)<>'52b35b3e7b2efd75245ab2cd0b4d9555' then raise exception 'Merge function drift: public.inquiry_merge_workspace(uuid)'; end if;
if (select md5(prosrc) from pg_proc where oid='public.preview_inquiry_merge(uuid,uuid)'::regprocedure)<>'b8b06908019d7a4e1e5b378a21d11ec3' then raise exception 'Merge function drift: public.preview_inquiry_merge(uuid,uuid)'; end if;
end $guard$;
create or replace function private.merge_email(i public.inquiries) returns text language sql stable security definer set search_path='' as $$
 select lower(coalesce((regexp_match(coalesce(i.original_message,''),'(?:^|\n)[ \t]*(?:email|e-mail)[ \t]*[:：][ \t]*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})','i'))[1],nullif(c.email,''),'')) from (select 1) seed left join public.contacts c on c.id=i.contact_id;
$$;
create or replace function public.inquiry_merge_workspace(target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();i public.inquiries; candidates jsonb;history jsonb;
begin
 select * into i from public.inquiries where id=target_id and archived_at is null and not coalesce(is_test_data,false) and data_environment='production';
 if i.id is null or not (a.role='owner' or (a.role='marketing' and i.owner_id is null) or i.owner_id=a.id or (a.role='sales_manager' and private.crm_manager_covers_inquiry(a.id,i.id))) then raise exception '无权查看该询盘合并记录'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',m.source_id,'source_no',m.source_snapshot->'inquiry_no','title',m.source_snapshot->'title','source',m.source_snapshot->'source','received_at',m.source_snapshot->'created_at','original_message',m.source_snapshot->'original_message','merged_at',m.created_at,'reason',m.reason) order by m.created_at),'[]') into history from private.inquiry_merges m where m.target_id=i.id and exists(select 1 from public.inquiries original where original.id=m.source_id and original.merged_into_id=i.id);
 candidates:='[]';
 if (a.role='owner' or (a.role='marketing' and i.owner_id is null)) and private.merge_is_official(i) then
 select coalesce(jsonb_agg(x),'[]') into candidates from(
 select j.id,j.inquiry_no,j.title,j.created_at,j.source,j.product_category,j.target_country,
 case when nullif(private.merge_email(i),'')=private.merge_email(j) then '客户邮箱相同，需核对产品与项目' else '公司相同，需核对产品与项目' end match_reason
 from public.inquiries j where j.id<>i.id and (j.owner_id is null or (a.role='owner' and i.owner_id is null and j.created_at<=i.created_at)) and (i.owner_id is null or j.created_at>=i.created_at) and j.archived_at is null and j.merged_into_id is null and not coalesce(j.is_test_data,false) and j.data_environment='production' and not coalesce(j.excluded_from_dashboard,false) and private.merge_is_official(j)
 and ((private.merge_email(i)<>'' and private.merge_email(j)=private.merge_email(i)) or (i.company_id is not null and j.company_id=i.company_id))
 order by j.created_at,j.id limit 30) x;
 end if;
 return jsonb_build_object('candidates',candidates,'history',history,'can_restore',a.role='owner','can_merge',(a.role='owner' or (a.role='marketing' and i.owner_id is null)) and private.merge_is_official(i));
end $$;
create or replace function public.preview_inquiry_merge(source_id uuid,target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();s public.inquiries;t public.inquiries;token text;
begin
 if a.role not in('owner','marketing') then raise exception '本批仅允许市场部或老板合并未分配官方询盘'; end if;
 if source_id is null or target_id is null or source_id=target_id then raise exception '请选择不同的两条询盘'; end if;
 select * into s from public.inquiries where id=source_id;select * into t from public.inquiries where id=target_id;
 if s.id is null or t.id is null or s.owner_id is not null or (t.owner_id is not null and a.role<>'owner') or s.archived_at is not null or t.archived_at is not null or s.merged_into_id is not null or t.merged_into_id is not null or coalesce(s.is_test_data,false) or coalesce(t.is_test_data,false) or s.data_environment is distinct from 'production' or t.data_environment is distinct from 'production' or coalesce(s.excluded_from_dashboard,false) or coalesce(t.excluded_from_dashboard,false) or not private.merge_is_official(s) or not private.merge_is_official(t) then raise exception '仅可合并未分配原询盘；已分配主询盘须老板确认，且双方须为未归档生产官方询盘'; end if;
 if s.created_at<t.created_at then raise exception '请保留更早来信为主询盘'; end if;
 if s.status::text in('won','lost') or t.status::text in('won','lost') then raise exception '已关闭询盘不可直接合并'; end if;
 if not ((private.merge_email(s)<>'' and private.merge_email(s)=private.merge_email(t)) or (s.company_id is not null and s.company_id=t.company_id)) then raise exception '客户身份没有共同证据，须先核验身份'; end if;
 if nullif(btrim(coalesce(s.product_category,'')),'') is not null and nullif(btrim(coalesce(t.product_category,'')),'') is not null and lower(btrim(s.product_category))<>lower(btrim(t.product_category)) then raise exception '产品类别不同，请保留独立询盘'; end if;
 if nullif(btrim(coalesce(s.project_name,'')),'') is not null and nullif(btrim(coalesce(t.project_name,'')),'') is not null and lower(btrim(s.project_name))<>lower(btrim(t.project_name)) then raise exception '项目不同，请保留独立询盘'; end if;
 if exists(select 1 from public.email_messages e join public.mailbox_connections c on c.id=e.mailbox_connection_id where e.inquiry_id in(s.id,t.id) and c.mailbox_kind<>'shared_inquiry') then raise exception '存在销售私有邮件，不可走未分配合并流程'; end if;
 if exists(select 1 from private.inquiry_merges m where m.source_id=s.id) then raise exception '该原记录已有合并审计，请先由管理员核对历史'; end if;
 if exists(select 1 from private.inquiry_merges m where m.target_id=s.id) then raise exception '被合并询盘已有合并历史，请逐条合入主询盘，避免链式丢失'; end if;
 token:=encode(sha256(convert_to((to_jsonb(s)||jsonb_build_object('target',to_jsonb(t)))::text,'UTF8')),'hex');
 return jsonb_build_object('source',jsonb_build_object('id',s.id,'number',s.inquiry_no,'title',s.title,'original',s.original_message,'created_at',s.created_at),'target',jsonb_build_object('id',t.id,'number',t.inquiry_no,'title',t.title,'original',t.original_message,'created_at',t.created_at,'preserves_assigned_owner',t.owner_id is not null),'hash',token);
end $$;
commit;
