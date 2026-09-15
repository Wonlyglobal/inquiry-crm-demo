-- Make sample progress owner-scoped, atomic and visible as a durable timeline.
create table if not exists public.sample_shipment_events (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.sample_shipments(id) on delete cascade,
  status text not null check (status in ('preparing','shipped','delivered','feedback_received','closed')),
  detail text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists sample_shipment_events_sample_occurred_idx
  on public.sample_shipment_events(sample_id,occurred_at desc);
alter table public.sample_shipment_events enable row level security;

drop policy if exists sample_shipment_events_read on public.sample_shipment_events;
create policy sample_shipment_events_read on public.sample_shipment_events for select to authenticated
using (exists(
  select 1 from public.sample_shipments s
  where s.id=sample_shipment_events.sample_id
    and (select private.can_read_fulfillment(s.inquiry_id))
));

create or replace function private.enforce_sample_evidence_history()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('delivered','feedback_received','closed') and new.delivered_at is null then
    raise exception '样品已签收及后续状态必须保留签收时间';
  end if;
  if new.status='feedback_received' and (
    nullif(btrim(new.customer_feedback),'') is null or new.feedback_at is null
  ) then raise exception '样品已反馈必须保留客户反馈和反馈时间';
  end if;
  if old.status='feedback_received' and new.status='closed' and (
    nullif(btrim(new.customer_feedback),'') is null or new.feedback_at is null
  ) then raise exception '完成样品跟踪时不能清除客户反馈';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_sample_evidence_history() from public,anon,authenticated;
drop trigger if exists sample_shipments_evidence_history_guard on public.sample_shipments;
create trigger sample_shipments_evidence_history_guard before update on public.sample_shipments
for each row execute function private.enforce_sample_evidence_history();

create or replace function private.record_sample_created_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.sample_shipment_events(sample_id,status,detail,occurred_at,created_by)
  values(new.id,new.status,'新增样品记录：'||new.contents,new.created_at,new.created_by);
  return new;
end;
$$;
revoke all on function private.record_sample_created_event() from public,anon,authenticated;
drop trigger if exists sample_shipments_created_event on public.sample_shipments;
create trigger sample_shipments_created_event after insert on public.sample_shipments
for each row execute function private.record_sample_created_event();

create or replace function public.update_sample_shipment_progress(
  target_sample_id uuid,
  next_status text,
  next_courier text default null,
  next_tracking_no text default null,
  next_shipped_at timestamptz default null,
  next_expected_arrival_at timestamptz default null,
  next_delivered_at timestamptz default null,
  next_customer_feedback text default null,
  next_feedback_at timestamptz default null,
  progress_note text default null
)
returns public.sample_shipments
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.profiles;
  current_sample public.sample_shipments;
  saved public.sample_shipments;
  inquiry_owner uuid;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null then raise exception '当前账号未启用'; end if;
  if actor.role not in ('owner','sales_manager','sales') then raise exception '无权更新样品履约'; end if;
  if nullif(btrim(progress_note),'') is null then raise exception '样品进展说明不能为空'; end if;

  select s.* into current_sample from public.sample_shipments s
  where s.id=target_sample_id for update of s;
  if current_sample.id is null then raise exception '样品记录不存在'; end if;
  select i.owner_id into inquiry_owner from public.inquiries i where i.id=current_sample.inquiry_id;
  if actor.role='sales' and inquiry_owner<>actor.id then raise exception '只能更新本人当前负责客户的样品'; end if;

  update public.sample_shipments set
    status=next_status,
    courier=nullif(btrim(next_courier),''),
    tracking_no=nullif(btrim(next_tracking_no),''),
    shipped_at=next_shipped_at,
    expected_arrival_at=next_expected_arrival_at,
    delivered_at=next_delivered_at,
    customer_feedback=nullif(btrim(next_customer_feedback),''),
    feedback_at=next_feedback_at
  where id=current_sample.id returning * into saved;

  insert into public.sample_shipment_events(sample_id,status,detail,occurred_at,created_by)
  values(saved.id,saved.status,btrim(progress_note),clock_timestamp(),actor.id);
  return saved;
end;
$$;

revoke all on public.sample_shipments from authenticated;
grant select,insert on public.sample_shipments to authenticated;
revoke all on public.sample_shipment_events from anon,authenticated;
grant select on public.sample_shipment_events to authenticated;
grant select,insert,update,delete on public.sample_shipment_events to service_role;
revoke all on function public.update_sample_shipment_progress(uuid,text,text,text,timestamptz,timestamptz,timestamptz,text,timestamptz,text) from public,anon;
grant execute on function public.update_sample_shipment_progress(uuid,text,text,text,timestamptz,timestamptz,timestamptz,text,timestamptz,text) to authenticated;
