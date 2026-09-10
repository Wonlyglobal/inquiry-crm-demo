-- Serialize quotation version allocation and validate every customer-facing line.
create or replace function public.create_quotation_version_v2(
  target_inquiry_id uuid,
  quote_subject text,
  quote_currency text,
  quote_lines jsonb,
  quote_terms text default null,
  quote_valid_until date default null,
  quote_notes text default null
)
returns public.quotation_versions
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  next_version integer;
  saved public.quotation_versions;
  inquiry_number bigint;
  calculated_total numeric;
  normalized_currency text := upper(btrim(coalesce(quote_currency,'')));
  line jsonb;
begin
  if actor is null then raise exception '请先登录'; end if;
  select role into actor_role from public.profiles where id=actor and active;
  if actor_role is null then raise exception '当前账号不可用'; end if;
  if nullif(btrim(quote_subject),'') is null then raise exception '请填写报价主题'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception '币种必须使用三位大写代码，例如 USD、CNY 或 EUR'; end if;
  if quote_valid_until is not null and quote_valid_until < current_date then raise exception '报价有效期不能早于今天'; end if;
  if jsonb_typeof(quote_lines)<>'array' or jsonb_array_length(quote_lines)=0 then raise exception '请至少填写一项报价产品'; end if;

  -- Lock the inquiry so two concurrent requests cannot allocate the same version.
  select i.inquiry_no into inquiry_number
  from public.inquiries i
  where i.id=target_inquiry_id
    and (i.owner_id=actor or actor_role in ('owner','sales_manager'))
  for update;
  if inquiry_number is null then raise exception '只能为本人负责或有权管理的询盘创建报价'; end if;

  for line in select value from jsonb_array_elements(quote_lines)
  loop
    if jsonb_typeof(line)<>'object' or nullif(btrim(line->>'product'),'') is null then
      raise exception '每项报价必须填写产品或型号';
    end if;
    if not coalesce(line->>'quantity','') ~ '^\d+(\.\d+)?$' or (line->>'quantity')::numeric <= 0 then
      raise exception '每项报价数量必须大于 0';
    end if;
    if not coalesce(line->>'unit_price','') ~ '^\d+(\.\d+)?$' or (line->>'unit_price')::numeric < 0 then
      raise exception '每项报价单价不能小于 0';
    end if;
  end loop;

  select coalesce(sum((item->>'quantity')::numeric * (item->>'unit_price')::numeric),0)
  into calculated_total
  from jsonb_array_elements(quote_lines) item;
  select coalesce(max(version_no),0)+1 into next_version
  from public.quotation_versions where inquiry_id=target_inquiry_id;

  insert into public.quotation_versions(
    inquiry_id,version_no,quote_no,subject,currency,total_amount,line_items,
    trade_terms,validity_until,notes,created_by
  ) values (
    target_inquiry_id,next_version,
    'Q-'||to_char(current_date,'YYYYMM')||'-'||lpad(inquiry_number::text,6,'0')||'-V'||next_version,
    btrim(quote_subject),normalized_currency,calculated_total,quote_lines,
    nullif(btrim(quote_terms),''),quote_valid_until,nullif(btrim(quote_notes),''),actor
  ) returning * into saved;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'quotation',saved.id,'quotation_created',
    jsonb_build_object('inquiry_id',target_inquiry_id,'version_no',next_version,'quote_no',saved.quote_no,'currency',normalized_currency,'total_amount',calculated_total),
    '业务员创建报价版本');
  return saved;
end $$;

revoke all on function public.create_quotation_version_v2(uuid,text,text,jsonb,text,date,text) from public,anon;
grant execute on function public.create_quotation_version_v2(uuid,text,text,jsonb,text,date,text) to authenticated;
