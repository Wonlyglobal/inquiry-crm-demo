create or replace function private.import_legacy_engineering_projects(p_rows jsonb, p_source_file text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  project_id bigint;
  imported integer := 0;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '无权导入历史工程项目';
  end if;
  p_rows := coalesce(p_rows,'[]'::jsonb);
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception '导入数据必须是数组';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception '单次最多导入 10000 条项目';
  end if;
  for item in select value from jsonb_array_elements(p_rows)
  loop
    project_id := nullif(trim(coalesce(item->>'legacy_project_id', item->>'旧 ID', '')), '')::bigint;
    if project_id is null then
      select coalesce(max(legacy_project_id),0)+1 into project_id from public.legacy_engineering_projects;
    end if;
    insert into public.legacy_engineering_projects (
      legacy_project_id,country,partner_name,partner_province,partner_city,customer_type,project_name,product_type,funnel_bucket,
      factory_price_amount,contract_no,contract_quantity,contract_amount_wan,website,project_status,next_milestone_at,
      project_total_quantity,lead_source,follow_up_status,contact_name,contact_details,contact_title,lost_reason,
      lost_reason_description,legacy_owner_name,legacy_creator_name,source_created_at,legacy_modifier_name,source_updated_at,
      department,source_file,raw_data
    ) values (
      project_id,
      nullif(trim(coalesce(item->>'country',item->>'国家/地区','')), ''), nullif(trim(coalesce(item->>'partner_name',item->>'合作方','')), ''),
      nullif(trim(coalesce(item->>'partner_province',item->>'省份','')), ''), nullif(trim(coalesce(item->>'partner_city',item->>'城市','')), ''),
      nullif(trim(coalesce(item->>'customer_type',item->>'客户类型','')), ''), nullif(trim(coalesce(item->>'project_name',item->>'项目名称','')), ''),
      nullif(trim(coalesce(item->>'product_type',item->>'产品','')), ''), nullif(trim(coalesce(item->>'funnel_bucket',item->>'分类','')), ''),
      nullif(coalesce(item->>'factory_price_amount',item->>'工厂价',''),'')::numeric, nullif(trim(coalesce(item->>'contract_no',item->>'合同号','')), ''),
      nullif(trim(coalesce(item->>'contract_quantity',item->>'合同数量','')), ''), nullif(coalesce(item->>'contract_amount_wan',item->>'合同金额（万元）',''),'')::numeric,
      nullif(trim(coalesce(item->>'website',item->>'官网','')), ''), nullif(trim(coalesce(item->>'project_status',item->>'项目状态','')), ''),
      nullif(coalesce(item->>'next_milestone_at',item->>'下一节点日期',''),'')::date, nullif(trim(coalesce(item->>'project_total_quantity',item->>'项目总数量','')), ''),
      nullif(trim(coalesce(item->>'lead_source',item->>'线索来源','')), ''), nullif(trim(coalesce(item->>'follow_up_status',item->>'跟进状态','')), ''),
      nullif(trim(coalesce(item->>'contact_name',item->>'联系人','')), ''), nullif(trim(coalesce(item->>'contact_details',item->>'联系方式','')), ''),
      nullif(trim(coalesce(item->>'contact_title',item->>'联系人职务','')), ''), nullif(trim(coalesce(item->>'lost_reason',item->>'丢单原因','')), ''),
      nullif(trim(coalesce(item->>'lost_reason_description',item->>'丢单说明','')), ''), nullif(trim(coalesce(item->>'legacy_owner_name',item->>'负责人','')), ''),
      nullif(trim(coalesce(item->>'legacy_creator_name',item->>'创建人','')), ''), nullif(coalesce(item->>'source_created_at',item->>'创建时间',''),'')::timestamptz,
      nullif(trim(coalesce(item->>'legacy_modifier_name',item->>'修改人','')), ''), nullif(coalesce(item->>'source_updated_at',item->>'更新时间',''),'')::timestamptz,
      nullif(trim(coalesce(item->>'department',item->>'部门','')), ''), left(coalesce(p_source_file,'Excel 导入'),255), item
    ) on conflict (legacy_project_id) do update set
      country=excluded.country,partner_name=excluded.partner_name,partner_province=excluded.partner_province,partner_city=excluded.partner_city,
      customer_type=excluded.customer_type,project_name=excluded.project_name,product_type=excluded.product_type,funnel_bucket=excluded.funnel_bucket,
      factory_price_amount=excluded.factory_price_amount,contract_no=excluded.contract_no,contract_quantity=excluded.contract_quantity,
      contract_amount_wan=excluded.contract_amount_wan,website=excluded.website,project_status=excluded.project_status,next_milestone_at=excluded.next_milestone_at,
      project_total_quantity=excluded.project_total_quantity,lead_source=excluded.lead_source,follow_up_status=excluded.follow_up_status,
      contact_name=excluded.contact_name,contact_details=excluded.contact_details,contact_title=excluded.contact_title,lost_reason=excluded.lost_reason,
      lost_reason_description=excluded.lost_reason_description,legacy_owner_name=excluded.legacy_owner_name,legacy_creator_name=excluded.legacy_creator_name,
      source_created_at=excluded.source_created_at,legacy_modifier_name=excluded.legacy_modifier_name,source_updated_at=excluded.source_updated_at,
      department=excluded.department,source_file=excluded.source_file,raw_data=excluded.raw_data,imported_at=now();
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

revoke all on function private.import_legacy_engineering_projects(jsonb,text) from public;
grant execute on function private.import_legacy_engineering_projects(jsonb,text) to authenticated;

create or replace function public.import_legacy_engineering_projects(p_rows jsonb, p_source_file text)
returns integer
language sql
security invoker
set search_path = public
as $$ select private.import_legacy_engineering_projects(p_rows,p_source_file) $$;

revoke all on function public.import_legacy_engineering_projects(jsonb,text) from public;
grant execute on function public.import_legacy_engineering_projects(jsonb,text) to authenticated;
