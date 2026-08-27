-- Lock the closing-date FX rate for won opportunities. Corrections remain
-- possible, but must be explicit and are captured by the existing audit log.
create or replace function private.protect_won_exchange_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'won' then
    if new.won_amount is null or new.won_amount <= 0 or nullif(trim(new.won_currency), '') is null then
      raise exception '成交商机必须填写成交金额和币种';
    end if;
    if new.won_at is null or new.won_exchange_rate is null or new.won_exchange_rate <= 0 then
      raise exception '成交商机必须锁定成交时间和成交日汇率';
    end if;
  end if;

  if old.status = 'won' and old.won_exchange_rate is not null and
     (new.won_amount is distinct from old.won_amount or
      new.won_currency is distinct from old.won_currency or
      new.won_exchange_rate is distinct from old.won_exchange_rate or
      new.won_at is distinct from old.won_at) and
     nullif(trim(coalesce(new.last_change_reason, '')), '') is null then
    raise exception '修正已成交金额或汇率必须填写原因';
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_protect_won_exchange_rate on public.inquiries;
create trigger inquiries_protect_won_exchange_rate
before insert or update on public.inquiries
for each row execute function private.protect_won_exchange_rate();

revoke all on function private.protect_won_exchange_rate() from public;
