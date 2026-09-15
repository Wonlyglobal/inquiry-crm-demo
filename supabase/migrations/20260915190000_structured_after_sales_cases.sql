-- Structured, owner-scoped after-sales cases with atomic order synchronization.
create table if not exists public.after_sales_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  issue_type text not null check (issue_type in ('quality','logistics','quantity','payment','other')),
  description text not null,
  status text not null default 'open' check (status in ('open','processing','resolved','closed')),
  resolution text,
  opened_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (status not in ('resolved','closed') or (nullif(btrim(resolution),'') is not null and resolved_at is not null)),
  check (status<>'closed' or closed_at is not null)
);
create index if not exists after_sales_cases_order_updated_idx on public.after_sales_cases(order_id,updated_at desc);
alter table public.after_sales_cases enable row level security;
drop policy if exists after_sales_cases_read on public.after_sales_cases;
create policy after_sales_cases_read on public.after_sales_cases for select to authenticated
using (exists(
  select 1 from public.sales_orders o where o.id=after_sales_cases.order_id
    and (select private.can_read_fulfillment(o.inquiry_id))
));

create or replace function private.enforce_after_sales_case_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
declare allowed boolean:=false;
begin
  if tg_op='INSERT' then
    if new.status<>'open' then raise exception '新售后工单必须从待处理开始'; end if;
  else
    if new.order_id is distinct from old.order_id or new.created_by is distinct from old.created_by
       or new.issue_type is distinct from old.issue_type or new.description is distinct from old.description
       or new.opened_at is distinct from old.opened_at then
      raise exception '售后工单的订单、问题和创建信息不可改写';
    end if;
    if new.status is distinct from old.status then
      allowed:=(old.status='open' and new.status in ('processing','resolved'))
        or (old.status='processing' and new.status='resolved')
        or (old.status='resolved' and new.status='closed');
      if not allowed then raise exception '售后工单状态不能从 % 变更为 %',old.status,new.status; end if;
    end if;
  end if;
  if new.status in ('resolved','closed') and (nullif(btrim(new.resolution),'') is null or new.resolved_at is null) then
    raise exception '解决售后工单必须填写解决方案和解决时间';
  end if;
  if new.status='closed' and new.closed_at is null then raise exception '结案必须保留结案时间'; end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
revoke all on function private.enforce_after_sales_case_integrity() from public,anon,authenticated;
drop trigger if exists after_sales_cases_integrity_guard on public.after_sales_cases;
create trigger after_sales_cases_integrity_guard before insert or update on public.after_sales_cases
for each row execute function private.enforce_after_sales_case_integrity();

create or replace function public.create_after_sales_case(target_order_id uuid,case_issue_type text,case_description text)
returns public.after_sales_cases language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target_order public.sales_orders; inquiry_owner uuid; saved public.after_sales_cases;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','sales_manager','sales') then raise exception '无权登记售后工单'; end if;
  if case_issue_type not in ('quality','logistics','quantity','payment','other') then raise exception '售后问题类型不正确'; end if;
  if nullif(btrim(case_description),'') is null then raise exception '请填写售后问题描述'; end if;
  select o.* into target_order from public.sales_orders o where o.id=target_order_id for update of o;
  if target_order.id is null or target_order.status not in ('delivered','after_sales') then raise exception '订单交付后才能登记售后工单'; end if;
  select i.owner_id into inquiry_owner from public.inquiries i where i.id=target_order.inquiry_id;
  if actor.role='sales' and inquiry_owner<>actor.id then raise exception '只能处理本人当前负责客户的售后'; end if;
  insert into public.after_sales_cases(order_id,issue_type,description,created_by,updated_by)
  values(target_order.id,case_issue_type,btrim(case_description),actor.id,actor.id) returning * into saved;
  update public.sales_orders set status='after_sales',after_sales_status='open' where id=target_order.id;
  insert into public.order_events(order_id,event_type,status,detail,occurred_at,created_by)
  values(target_order.id,'after_sales','after_sales','新增售后工单：'||btrim(case_description),clock_timestamp(),actor.id);
  return saved;
end;
$$;

create or replace function public.update_after_sales_case(target_case_id uuid,next_status text,case_resolution text,progress_note text)
returns public.after_sales_cases language plpgsql security definer set search_path='' as $$
declare actor public.profiles; current_case public.after_sales_cases; target_order public.sales_orders; inquiry_owner uuid; saved public.after_sales_cases; remaining integer;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and active=true;
  if actor.id is null or actor.role not in ('owner','sales_manager','sales') then raise exception '无权更新售后工单'; end if;
  if nullif(btrim(progress_note),'') is null then raise exception '请填写售后处理进展'; end if;
  select c.* into current_case from public.after_sales_cases c where c.id=target_case_id for update of c;
  if current_case.id is null then raise exception '售后工单不存在'; end if;
  select o.* into target_order from public.sales_orders o where o.id=current_case.order_id for update of o;
  select i.owner_id into inquiry_owner from public.inquiries i where i.id=target_order.inquiry_id;
  if actor.role='sales' and inquiry_owner<>actor.id then raise exception '只能处理本人当前负责客户的售后'; end if;

  update public.after_sales_cases set
    status=next_status,
    started_at=case when next_status='processing' then coalesce(started_at,clock_timestamp()) else started_at end,
    resolution=case when next_status in ('resolved','closed') then nullif(btrim(case_resolution),'') else resolution end,
    resolved_at=case when next_status in ('resolved','closed') then coalesce(resolved_at,clock_timestamp()) else resolved_at end,
    closed_at=case when next_status='closed' then clock_timestamp() else closed_at end,
    updated_by=actor.id
  where id=current_case.id returning * into saved;

  select count(*) into remaining from public.after_sales_cases c
  where c.order_id=target_order.id and c.status in ('open','processing');
  if remaining=0 then
    update public.sales_orders set status='completed',after_sales_status='resolved' where id=target_order.id;
  elsif next_status='processing' then
    update public.sales_orders set after_sales_status='processing' where id=target_order.id;
  end if;
  insert into public.order_events(order_id,event_type,status,detail,occurred_at,created_by)
  values(target_order.id,'after_sales',case when remaining=0 then 'completed' else 'after_sales' end,btrim(progress_note),clock_timestamp(),actor.id);
  return saved;
end;
$$;

create or replace function private.enforce_after_sales_resolution()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='after_sales' and new.status='completed' and new.after_sales_status<>'resolved' then
    raise exception '售后问题必须标记为已解决后才能完成订单';
  end if;
  if old.status='after_sales' and new.status='completed' and exists(
    select 1 from public.after_sales_cases c where c.order_id=new.id and c.status in ('open','processing')
  ) then raise exception '仍有未解决售后工单，不能完成订单'; end if;
  if old.status='delivered' and new.status='completed' and new.after_sales_status<>'none' then
    raise exception '未进入售后流程的订单不能伪造售后已解决状态';
  end if;
  if new.after_sales_status='resolved' and not (
    (old.status='after_sales' and new.status='completed')
    or (old.status='completed' and old.after_sales_status='resolved' and new.status='completed')
  ) then raise exception '售后已解决只能由售后中订单关闭时记录'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_after_sales_resolution() from public,anon,authenticated;

revoke all on public.after_sales_cases from anon,authenticated;
grant select on public.after_sales_cases to authenticated;
grant select,insert,update,delete on public.after_sales_cases to service_role;
revoke all on function public.create_after_sales_case(uuid,text,text) from public,anon;
grant execute on function public.create_after_sales_case(uuid,text,text) to authenticated;
revoke all on function public.update_after_sales_case(uuid,text,text,text) from public,anon;
grant execute on function public.update_after_sales_case(uuid,text,text,text) to authenticated;
