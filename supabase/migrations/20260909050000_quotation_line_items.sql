alter table public.quotation_versions
  add column if not exists quote_no text,
  add column if not exists line_items jsonb not null default '[]'::jsonb;

create unique index if not exists quotation_versions_quote_no_unique
  on public.quotation_versions(quote_no) where quote_no is not null;

create or replace function public.create_quotation_version_v2(target_inquiry_id uuid,quote_subject text,quote_currency text,quote_lines jsonb,quote_terms text default null,quote_valid_until date default null,quote_notes text default null)
returns public.quotation_versions language plpgsql security invoker set search_path=public as $$
declare next_version integer; saved public.quotation_versions; inquiry_number bigint; calculated_total numeric;
begin
  select inquiry_no into inquiry_number from public.inquiries where id=target_inquiry_id and (owner_id=auth.uid() or (select role from public.profiles where id=auth.uid()) in ('owner','sales_manager'));
  if inquiry_number is null then raise exception '只能为本人负责或有权管理的询盘创建报价'; end if;
  if jsonb_typeof(quote_lines)<>'array' or jsonb_array_length(quote_lines)=0 then raise exception '请至少填写一项报价产品'; end if;
  select coalesce(sum(greatest(0,(item->>'quantity')::numeric)*greatest(0,(item->>'unit_price')::numeric)),0) into calculated_total from jsonb_array_elements(quote_lines) item;
  select coalesce(max(version_no),0)+1 into next_version from public.quotation_versions where inquiry_id=target_inquiry_id;
  insert into public.quotation_versions(inquiry_id,version_no,quote_no,subject,currency,total_amount,line_items,trade_terms,validity_until,notes,created_by)
  values(target_inquiry_id,next_version,'Q-'||to_char(current_date,'YYYYMM')||'-'||lpad(inquiry_number::text,6,'0')||'-V'||next_version,trim(quote_subject),upper(trim(quote_currency)),calculated_total,quote_lines,nullif(trim(quote_terms),''),quote_valid_until,nullif(trim(quote_notes),''),auth.uid()) returning * into saved;
  return saved;
end $$;
grant execute on function public.create_quotation_version_v2(uuid,text,text,jsonb,text,date,text) to authenticated;
