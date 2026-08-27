alter table public.follow_ups
  add column if not exists is_task boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_status text
    check (completion_status in ('on_time','overdue'));

create table if not exists public.exchange_rates (
  rate_date date not null,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18,8) not null check (rate > 0),
  provider text not null,
  fetched_at timestamptz not null default clock_timestamp(),
  primary key (rate_date, base_currency, quote_currency)
);

alter table public.exchange_rates enable row level security;
create policy exchange_rates_read on public.exchange_rates
  for select to authenticated using (true);
grant select on public.exchange_rates to authenticated;

create or replace function public.complete_follow_up_task(target_follow_up_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare task public.follow_ups;
begin
  select * into task from public.follow_ups where id=target_follow_up_id for update;
  if not found then raise exception '跟进任务不存在'; end if;
  if task.author_id <> auth.uid() and private.current_crm_role() not in ('owner','sales_manager') then
    raise exception '无权完成该跟进任务';
  end if;
  update public.follow_ups set
    completed_at=clock_timestamp(),
    completion_status=case when next_follow_up_at is not null and clock_timestamp()>next_follow_up_at then 'overdue' else 'on_time' end
  where id=target_follow_up_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason)
  values(auth.uid(),'follow_up',target_follow_up_id,'task_completed','完成跟进任务');
end; $$;
revoke all on function public.complete_follow_up_task(uuid) from public;
grant execute on function public.complete_follow_up_task(uuid) to authenticated;
