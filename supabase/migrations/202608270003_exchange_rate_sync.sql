create or replace function public.upsert_daily_exchange_rate(
  target_rate_date date,
  target_base_currency text,
  target_quote_currency text,
  target_rate numeric,
  target_provider text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then
    raise exception '无权更新平台汇率';
  end if;
  if target_rate <= 0 then raise exception '汇率必须大于 0'; end if;
  insert into public.exchange_rates(rate_date,base_currency,quote_currency,rate,provider,fetched_at)
  values(target_rate_date,upper(target_base_currency),upper(target_quote_currency),target_rate,target_provider,clock_timestamp())
  on conflict(rate_date,base_currency,quote_currency) do update set
    rate=excluded.rate,provider=excluded.provider,fetched_at=clock_timestamp();
end; $$;
revoke all on function public.upsert_daily_exchange_rate(date,text,text,numeric,text) from public;
grant execute on function public.upsert_daily_exchange_rate(date,text,text,numeric,text) to authenticated;
