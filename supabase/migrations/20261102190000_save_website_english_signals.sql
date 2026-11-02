begin;
-- Invoker rights: existing inquiry/company RLS and grants remain authoritative.
create function public.save_website_english_signals(target_inquiry uuid,expected_company uuid,expected_updated_at timestamptz,seo jsonb,projects jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles;company public.companies;company_id uuid;item jsonb;proof jsonb;items jsonb;label text;kind text;result jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce(auth.jwt()->'app_metadata'->>'crm_read_only','false')='true' then raise exception '当前账号不可保存摘要';end if;
 select * into actor from public.profiles where id=auth.uid() and active and not coalesce(is_test_data,false) and data_environment='production';
 if actor.id is null then raise exception '账号不可用';end if;
 select i.company_id into company_id from public.inquiries i where i.id=target_inquiry and not coalesce(i.is_test_data,false) and i.data_environment='production' and i.archived_at is null;
 if company_id is null or company_id is distinct from expected_company then raise exception '询盘或公司不可见';end if;
 if jsonb_typeof(seo) is distinct from 'array' or jsonb_typeof(projects) is distinct from 'array' then raise exception '摘要格式无效';end if;
 if jsonb_array_length(seo) not between 1 and 6 or jsonb_array_length(projects) not between 1 and 4 or length(seo::text)+length(projects::text)>26000 then raise exception '摘要数量或长度无效';end if;
 for kind,items in select 'seo', seo union all select 'projects',projects loop
  for item in select value from jsonb_array_elements(items) loop
   label:=case when kind='seo' then item->>'name' else item->>'display' end;
   if label is null or length(label) not between 3 and 280 or label !~ '^[ -~]+$' or label ~ '[<>]' or item->>'schema' is distinct from 'website-signals-en-v1' or item->>'language' is distinct from 'en' or item->>'policy' is distinct from 'public-website-evidence-en-v1' or item->>'review_status' is distinct from 'pending_human_review' or item->>'model' is distinct from 'qwen-plus' or coalesce(item->>'input_hash','') !~ '^[a-f0-9]{64}$' or coalesce(item->>'source_website','') !~ '^https://[a-zA-Z0-9.-]+(/[^?#[:space:]]*)?$' or coalesce(item->>'generated_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' or jsonb_typeof(item->'evidence') is distinct from 'array' then raise exception '仅保存带出处的英文建议';end if;
   if (kind='seo' and item->>'kind' not in('category','gap')) or (kind='projects' and item->>'kind' not in('project','application','gap')) or item->>'kind' is null then raise exception '摘要类型无效';end if;
   if exists(select 1 from jsonb_object_keys(item) k where k not in('name','display','schema','language','policy','kind','evidence','generated_at','input_hash','model','source_website','review_status')) then raise exception '摘要含额外字段';end if;
   if jsonb_array_length(item->'evidence') not between 1 and 4 then raise exception '摘要缺少原文出处';end if;
   for proof in select value from jsonb_array_elements(item->'evidence') loop
    if coalesce(length(proof->>'quote'),0) not between 4 and 500 or coalesce(proof->>'source_url','') !~ '^https://[a-zA-Z0-9.-]+(/[^?#[:space:]]*)?$' or coalesce(proof->>'accessed_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' or coalesce(proof->>'id','') !~ '^E[0-9]{1,2}$' or exists(select 1 from jsonb_object_keys(proof) k where k not in('id','quote','source_url','accessed_at')) then raise exception '原文出处格式无效';end if;
   end loop;
  end loop;
 end loop;
 select * into company from public.companies c where c.id=company_id for update;
 if company.id is null then raise exception '公司不可见或不可编辑';end if;
 if company.seo_focus_categories=seo and company.project_category_signals=projects then return jsonb_build_object('seo_focus_categories',company.seo_focus_categories,'project_category_signals',company.project_category_signals,'updated_at',company.updated_at);end if;
 if company.updated_at is distinct from expected_updated_at then raise exception '公司资料已更新，请刷新后再保存摘要';end if;
 update public.companies c set seo_focus_categories=seo,project_category_signals=projects,updated_at=clock_timestamp() where c.id=company_id
 returning jsonb_build_object('seo_focus_categories',c.seo_focus_categories,'project_category_signals',c.project_category_signals,'updated_at',c.updated_at) into result;
 if result is null then raise exception '无权编辑公司摘要';end if;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
 values(actor.id,'company',company_id,'website_english_signals_saved',jsonb_build_object('seo_focus_categories',company.seo_focus_categories,'project_category_signals',company.project_category_signals),result,'用户授权自动生成英文建议；仅保存两项公开官网摘要与原文出处，不改变客户身份、交易、归属或其他背调字段');
 return result;
end $$;
revoke all on function public.save_website_english_signals(uuid,uuid,timestamptz,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.save_website_english_signals(uuid,uuid,timestamptz,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
