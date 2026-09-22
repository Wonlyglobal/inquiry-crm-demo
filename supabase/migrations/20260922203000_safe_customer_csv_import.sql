begin;

create or replace function public.import_customer_opportunities(
  import_rows jsonb,
  source_file text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  actor public.profiles;
  row_data jsonb;
  result jsonb;
  row_number integer;
  total_count integer;
  created_count integer:=0;
  deduplicated_count integer:=0;
  clean_file text:=left(nullif(btrim(source_file),''),255);
begin
  select * into actor from public.profiles
  where id=auth.uid() and active=true and not coalesce(is_test_data,false)
    and coalesce(data_environment,'production')='production';
  if actor.id is null then raise exception '当前账号不可用'; end if;
  if actor.role not in ('owner','marketing','sales') then raise exception '当前角色不能导入客户'; end if;
  if jsonb_typeof(import_rows) is distinct from 'array' then raise exception '导入内容必须是数组'; end if;
  total_count:=jsonb_array_length(import_rows);
  if total_count<1 or total_count>500 then raise exception '单次导入必须为 1 至 500 行'; end if;
  if clean_file is null or clean_file!~*'\.csv$' then raise exception '仅支持标准 CSV 客户模板'; end if;

  for row_data in select value from jsonb_array_elements(import_rows)
  loop
    row_number:=coalesce(nullif(row_data->>'row_number','')::integer,row_number+1,2);
    begin
      select public.create_customer_opportunity(
        company_name=>nullif(row_data->>'company',''),
        contact_name=>nullif(row_data->>'contact',''),
        contact_email=>nullif(row_data->>'email',''),
        contact_phone=>nullif(row_data->>'phone',''),
        contact_whatsapp=>nullif(row_data->>'whatsapp',''),
        country_name=>nullif(row_data->>'country',''),
        source_channel=>nullif(row_data->>'source',''),
        source_detail_text=>nullif(row_data->>'source_detail',''),
        demand_text=>nullif(row_data->>'demand',''),
        product_text=>nullif(row_data->>'product',''),
        quantity_text=>nullif(row_data->>'quantity',''),
        opportunity_title=>nullif(row_data->>'title',''),
        estimated_value=>case when nullif(row_data->>'estimated_value','') is null then null else (row_data->>'estimated_value')::numeric end,
        estimated_currency=>nullif(row_data->>'currency',''),
        expected_purchase_date=>case when nullif(row_data->>'expected_purchase_date','') is null then null else (row_data->>'expected_purchase_date')::date end,
        notify_manager=>false
      ) into result;
    exception when others then
      raise exception '第 % 行校验失败：%',row_number,sqlerrm;
    end;
    if coalesce((result->>'deduplicated')::boolean,false) then deduplicated_count:=deduplicated_count+1;
    else created_count:=created_count+1;
    end if;
  end loop;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(actor.id,'profile',actor.id,'customer_csv_imported','通过标准模板整批导入现有客户',jsonb_build_object(
    'source_file',clean_file,'row_count',total_count,'created_count',created_count,
    'deduplicated_count',deduplicated_count,'atomic',true,'external_ai_used',false
  ));
  return jsonb_build_object('row_count',total_count,'created_count',created_count,'deduplicated_count',deduplicated_count);
end;
$$;

revoke all on function public.import_customer_opportunities(jsonb,text) from public,anon;
grant execute on function public.import_customer_opportunities(jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
