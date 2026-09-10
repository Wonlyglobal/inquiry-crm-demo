-- Keep data-quality reminders current without requiring a salesperson to open the workbench.

create or replace function private.refresh_inquiry_data_quality(target_inquiry_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  refreshed integer := 0;
begin
  update public.data_quality_alerts a
  set resolved_at=clock_timestamp(),updated_at=clock_timestamp()
  where a.inquiry_id=target_inquiry_id and a.resolved_at is null;

  insert into public.data_quality_alerts(inquiry_id,owner_id,alert_key,severity,message,detected_at,updated_at,resolved_at)
  select i.id,i.owner_id,v.alert_key,v.severity,v.message,clock_timestamp(),clock_timestamp(),null
  from public.inquiries i
  cross join lateral (
    values
      ('missing_email',case when not exists(
        select 1 from public.contacts c
        where c.company_id=i.company_id and nullif(trim(c.email),'') is not null
      ) then 'high' else null end,'缺少可联系的客户邮箱'),
      ('missing_country',case when nullif(trim(i.target_country),'') is null then 'warning' else null end,'缺少客户国家/地区'),
      ('missing_product',case when nullif(trim(i.product_category),'') is null then 'warning' else null end,'缺少客户关注的产品品类'),
      ('missing_quantity',case when nullif(trim(i.quantity),'') is null then 'warning' else null end,'缺少预计采购数量'),
      ('missing_budget',case when i.estimated_amount is null or i.estimated_amount<=0 then 'warning' else null end,'缺少预算或预计金额'),
      ('missing_decision_maker',case when nullif(trim(i.qualification_role),'') is null then 'warning' else null end,'尚未确认决策人及联系人角色'),
      ('missing_next_followup',case when i.next_follow_up_at is null then 'high' else null end,'尚未安排下次跟进时间'),
      ('stagnant',case when coalesce(i.updated_at,i.created_at)<clock_timestamp()-interval '14 days' then 'high' else null end,'商机超过 14 天没有更新')
  ) as v(alert_key,severity,message)
  where i.id=target_inquiry_id
    and i.owner_id is not null
    and i.validity='valid'
    and i.status not in ('won','lost')
    and coalesce(i.excluded_from_dashboard,false)=false
    and v.severity is not null
  on conflict(inquiry_id,alert_key) do update set
    owner_id=excluded.owner_id,severity=excluded.severity,message=excluded.message,
    detected_at=case when public.data_quality_alerts.resolved_at is null then public.data_quality_alerts.detected_at else excluded.detected_at end,
    updated_at=excluded.updated_at,resolved_at=null;

  get diagnostics refreshed=row_count;
  return refreshed;
end;
$$;

revoke all on function private.refresh_inquiry_data_quality(uuid) from public,anon,authenticated;

create or replace function public.refresh_my_data_quality_alerts()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  inquiry_record record;
  refreshed integer := 0;
begin
  if actor_id is null or not exists(select 1 from public.profiles p where p.id=actor_id and p.active=true) then
    raise exception '当前账号无权刷新数据质量提醒';
  end if;
  for inquiry_record in select i.id from public.inquiries i where i.owner_id=actor_id loop
    refreshed := refreshed + private.refresh_inquiry_data_quality(inquiry_record.id);
  end loop;
  return refreshed;
end;
$$;

create or replace function private.refresh_all_data_quality_alerts()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  inquiry_record record;
  refreshed integer := 0;
begin
  for inquiry_record in
    select i.id from public.inquiries i
    where i.owner_id is not null and i.validity='valid' and i.status not in ('won','lost')
  loop
    refreshed := refreshed + private.refresh_inquiry_data_quality(inquiry_record.id);
  end loop;
  return refreshed;
end;
$$;

revoke all on function private.refresh_all_data_quality_alerts() from public,anon,authenticated;

create or replace function private.refresh_inquiry_quality_on_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.refresh_inquiry_data_quality(new.id);
  return new;
end;
$$;

revoke all on function private.refresh_inquiry_quality_on_change() from public,anon,authenticated;
drop trigger if exists inquiries_refresh_data_quality on public.inquiries;
create trigger inquiries_refresh_data_quality
after insert or update of owner_id,validity,status,excluded_from_dashboard,target_country,product_category,quantity,estimated_amount,qualification_role,next_follow_up_at,updated_at
on public.inquiries for each row execute function private.refresh_inquiry_quality_on_change();

create or replace function private.refresh_company_quality_on_contact_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  company uuid := coalesce(new.company_id,old.company_id);
  inquiry_record record;
begin
  for inquiry_record in select i.id from public.inquiries i where i.company_id=company loop
    perform private.refresh_inquiry_data_quality(inquiry_record.id);
  end loop;
  return coalesce(new,old);
end;
$$;

revoke all on function private.refresh_company_quality_on_contact_change() from public,anon,authenticated;
drop trigger if exists contacts_refresh_data_quality on public.contacts;
create trigger contacts_refresh_data_quality
after insert or update of email,company_id or delete on public.contacts
for each row execute function private.refresh_company_quality_on_contact_change();

create extension if not exists pg_cron with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='refresh-crm-data-quality-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('refresh-crm-data-quality-daily','15 0 * * *','select private.refresh_all_data_quality_alerts()');
end;
$$;

select private.refresh_all_data_quality_alerts();
