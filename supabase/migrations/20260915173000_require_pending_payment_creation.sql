-- New receivables must start pending; receipt evidence is accepted only by the audited status workflow.
create or replace function private.enforce_payment_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' and (
    new.status<>'pending'
    or new.received_at is not null
    or nullif(btrim(new.reference_no),'') is not null
    or nullif(btrim(new.received_note),'') is not null
    or new.refunded_at is not null
    or nullif(btrim(new.refund_reference_no),'') is not null
    or nullif(btrim(new.refund_reason),'') is not null
  ) then
    raise exception '新回款只能先登记为待回款，到账必须另行确认';
  end if;

  if new.status in ('received','refunded')
     and nullif(btrim(new.reference_no),'') is null then
    raise exception '已到账回款必须填写银行流水号或凭证编号';
  end if;

  if tg_op='UPDATE' and old.status in ('received','refunded') and (
    new.payment_type is distinct from old.payment_type
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.received_at is distinct from old.received_at
    or new.reference_no is distinct from old.reference_no
  ) then
    raise exception '已到账回款的类型、金额、币种、到账时间和原始凭证不可改写';
  end if;

  if new.refunded_at>clock_timestamp()+interval '5 minutes' then
    raise exception '退款时间不能晚于当前时间';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_payment_evidence() from public,anon,authenticated;
