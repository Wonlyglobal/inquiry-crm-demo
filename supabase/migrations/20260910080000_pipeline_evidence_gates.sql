-- Evidence gates for quotation and sample pipeline stages.

create or replace function private.enforce_pipeline_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('quoted','sample_sent','negotiating')
    and (new.estimated_amount is null or nullif(trim(new.currency),'') is null) then
    raise exception '进入报价及后续阶段前必须有金额和币种';
  end if;
  if new.status in ('quoted','sample_sent','negotiating') and not exists(
    select 1 from public.quotation_versions q
    where q.inquiry_id=new.id and q.status='sent' and q.sent_at is not null
  ) then raise exception '请先完成报价审批并通过业务员邮箱发送'; end if;
  if new.status='sample_sent' and not exists(
    select 1 from public.sample_shipments s
    where s.inquiry_id=new.id and s.status in ('shipped','delivered','feedback_received','closed')
      and nullif(trim(s.tracking_no),'') is not null and s.shipped_at is not null
  ) then raise exception '请先登记样品内容、快递单号和寄出时间'; end if;
  return new;
end $$;

drop trigger if exists inquiries_enforce_pipeline_evidence on public.inquiries;
create trigger inquiries_enforce_pipeline_evidence
before update of status on public.inquiries
for each row execute function private.enforce_pipeline_evidence();
revoke all on function private.enforce_pipeline_evidence() from public,anon,authenticated;

create or replace function private.advance_inquiry_after_sample_shipped()
returns trigger language plpgsql security definer set search_path='' as $$
declare item public.inquiries;
begin
  if new.status not in ('shipped','delivered','feedback_received','closed') then return new; end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into item from public.inquiries where id=new.inquiry_id for update;
  if item.status in ('quoted','sample_sent') then
    update public.inquiries set status='sample_sent',updated_by=auth.uid(),updated_at=clock_timestamp(),
      last_change_reason='样品已寄出：'||coalesce(new.courier,'快递')||' '||coalesce(new.tracking_no,'')
    where id=new.inquiry_id;
  end if;
  return new;
end $$;

drop trigger if exists sample_shipment_advance_pipeline on public.sample_shipments;
create trigger sample_shipment_advance_pipeline
after insert or update of status on public.sample_shipments
for each row execute function private.advance_inquiry_after_sample_shipped();
revoke all on function private.advance_inquiry_after_sample_shipped() from public,anon,authenticated;
