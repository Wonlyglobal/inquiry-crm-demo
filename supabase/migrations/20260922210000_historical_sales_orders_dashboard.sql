begin;

create table if not exists public.historical_sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row integer not null check (source_row > 1),
  source_month text,
  legacy_owner_name text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  order_no text not null,
  contract_name text not null,
  order_source text,
  factory_description text,
  order_quantity numeric,
  amount_wan numeric not null check (amount_wan >= 0),
  ordered_at date,
  target_stock_at date,
  expected_stock_at date,
  status_raw text,
  status_code text not null default 'unknown' check (status_code in ('unknown','ordered_not_started','production','in_stock')),
  status_reason text,
  imported_by uuid not null references public.profiles(id),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_sha256, source_row)
);

create index if not exists historical_sales_order_lines_order_no_idx on public.historical_sales_order_lines(order_no);
create index if not exists historical_sales_order_lines_ordered_at_idx on public.historical_sales_order_lines(ordered_at);
create index if not exists historical_sales_order_lines_owner_idx on public.historical_sales_order_lines(owner_id,legacy_owner_name);

alter table public.historical_sales_order_lines enable row level security;
drop policy if exists historical_sales_order_lines_owner_read on public.historical_sales_order_lines;
create policy historical_sales_order_lines_owner_read on public.historical_sales_order_lines
for select to authenticated using (private.current_crm_role()='owner');

revoke all on public.historical_sales_order_lines from anon,authenticated;
grant select on public.historical_sales_order_lines to authenticated;
grant select,insert,update,delete on public.historical_sales_order_lines to service_role;

create or replace function public.import_historical_sales_order_lines(
  p_rows jsonb,
  p_source_file text,
  p_source_sha256 text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item jsonb;
  affected integer:=0;
  matched_owner uuid;
  matched_count integer;
  before_count integer;
  before_amount numeric;
  after_count integer;
  after_orders integer;
  after_amount numeric;
begin
  if private.current_crm_role()<>'owner' then raise exception '仅运营管理员可导入历史订单'; end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then raise exception '导入数据必须是数组'; end if;
  if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>500 then raise exception '单次导入须为 1 至 500 行'; end if;
  if nullif(btrim(p_source_file),'') is null then raise exception '必须提供来源文件名'; end if;
  if coalesce(p_source_sha256,'') !~ '^[0-9a-f]{64}$' then raise exception '来源文件 SHA-256 无效'; end if;
  if length(btrim(coalesce(p_reason,'')))<4 then raise exception '导入原因至少 4 个字符'; end if;

  select count(*),coalesce(sum(amount_wan),0) into before_count,before_amount
  from public.historical_sales_order_lines where source_sha256=p_source_sha256;

  for item in select value from jsonb_array_elements(p_rows) loop
    if nullif(btrim(item->>'legacy_owner_name'),'') is null
      or nullif(btrim(item->>'order_no'),'') is null
      or nullif(btrim(item->>'contract_name'),'') is null
      or nullif(item->>'amount_wan','') is null
      or nullif(item->>'source_row','') is null then
      raise exception '第 % 行缺少负责人、订单号、合同名称、金额或源行号',coalesce(item->>'source_row','未知');
    end if;
    select min(p.id::text)::uuid,count(*) into matched_owner,matched_count
    from public.profiles p
    where lower(btrim(p.full_name))=lower(btrim(item->>'legacy_owner_name'))
      and p.active=true and p.role='sales' and not coalesce(p.is_test_data,false)
      and coalesce(p.data_environment,'production')='production';
    if matched_count<>1 then matched_owner:=null; end if;

    insert into public.historical_sales_order_lines(
      source_file,source_sha256,source_row,source_month,legacy_owner_name,owner_id,order_no,contract_name,
      order_source,factory_description,order_quantity,amount_wan,ordered_at,target_stock_at,expected_stock_at,
      status_raw,status_code,status_reason,imported_by
    ) values (
      left(btrim(p_source_file),255),p_source_sha256,(item->>'source_row')::integer,nullif(btrim(item->>'source_month'),''),
      btrim(item->>'legacy_owner_name'),matched_owner,btrim(item->>'order_no'),btrim(item->>'contract_name'),
      nullif(btrim(item->>'order_source'),''),nullif(btrim(item->>'factory_description'),''),nullif(item->>'order_quantity','')::numeric,
      (item->>'amount_wan')::numeric,nullif(item->>'ordered_at','')::date,nullif(item->>'target_stock_at','')::date,
      nullif(item->>'expected_stock_at','')::date,nullif(btrim(item->>'status_raw'),''),
      case replace(coalesce(item->>'status_raw',''),E'\n','') when '2.在库' then 'in_stock' when '3.在制' then 'production' when '4.已下未制' then 'ordered_not_started' else 'unknown' end,
      nullif(btrim(item->>'status_reason'),''),auth.uid()
    ) on conflict(source_sha256,source_row) do update set
      source_file=excluded.source_file,source_month=excluded.source_month,legacy_owner_name=excluded.legacy_owner_name,
      owner_id=excluded.owner_id,order_no=excluded.order_no,contract_name=excluded.contract_name,order_source=excluded.order_source,
      factory_description=excluded.factory_description,order_quantity=excluded.order_quantity,amount_wan=excluded.amount_wan,
      ordered_at=excluded.ordered_at,target_stock_at=excluded.target_stock_at,expected_stock_at=excluded.expected_stock_at,
      status_raw=excluded.status_raw,status_code=excluded.status_code,status_reason=excluded.status_reason,
      imported_by=excluded.imported_by,updated_at=now();
    affected:=affected+1;
  end loop;

  select count(*),count(distinct order_no),coalesce(sum(amount_wan),0)
  into after_count,after_orders,after_amount from public.historical_sales_order_lines where source_sha256=p_source_sha256;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'profile',auth.uid(),'historical_sales_orders_imported',left(btrim(p_reason),500),
    jsonb_build_object('source_file',left(btrim(p_source_file),255),'line_count',before_count,'amount_wan',before_amount),
    jsonb_build_object('source_file',left(btrim(p_source_file),255),'source_sha256',p_source_sha256,'submitted_lines',affected,
      'line_count',after_count,'unique_order_count',after_orders,'amount_wan',after_amount,
      'owner_mapping','exact_active_production_sales_or_unmapped','customer_content_in_audit',false));
  return jsonb_build_object('line_count',after_count,'unique_order_count',after_orders,'amount_wan',after_amount);
end;
$$;

revoke all on function public.import_historical_sales_order_lines(jsonb,text,text,text) from public,anon;
grant execute on function public.import_historical_sales_order_lines(jsonb,text,text,text) to authenticated;

create or replace function public.rollback_historical_sales_order_import(p_source_sha256 text,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare removed integer; summary jsonb;
begin
  if private.current_crm_role()<>'owner' then raise exception '仅运营管理员可回滚历史订单导入'; end if;
  if length(btrim(coalesce(p_reason,'')))<4 then raise exception '回滚原因至少 4 个字符'; end if;
  select jsonb_build_object('source_sha256',p_source_sha256,'line_count',count(*),'unique_order_count',count(distinct order_no),'amount_wan',coalesce(sum(amount_wan),0)) into summary
  from public.historical_sales_order_lines where source_sha256=p_source_sha256;
  delete from public.historical_sales_order_lines where source_sha256=p_source_sha256;
  get diagnostics removed=row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'profile',auth.uid(),'historical_sales_orders_import_rolled_back',left(btrim(p_reason),500),summary,jsonb_build_object('removed_lines',removed));
  return removed;
end;
$$;

revoke all on function public.rollback_historical_sales_order_import(text,text) from public,anon;
grant execute on function public.rollback_historical_sales_order_import(text,text) to authenticated;

notify pgrst,'reload schema';
commit;
