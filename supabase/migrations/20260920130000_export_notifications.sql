begin;
alter table public.notifications
 add column export_request_id uuid references public.crm_export_requests(id),
 add column export_event_id bigint references public.crm_export_events(id);
create unique index notifications_export_event_recipient_idx
 on public.notifications(export_event_id,recipient_id) where export_event_id is not null;

create function private.notify_crm_export_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.crm_export_requests; message_title text;
begin
 select * into r from public.crm_export_requests where id=new.request_id;
 if new.event_type='requested' then
  insert into public.notifications(recipient_id,inquiry_id,type,title,body,export_request_id,export_event_id)
  select p.id,null,'crm_export_review','导出申请待独立审核',
   '有一条 L3 导出申请待审核。请进入审批中心核对范围与用途；此通知不包含客户内容。',r.id,new.id
  from public.profiles p where p.active=true and p.id<>r.requester_id
   and (p.role='owner' or (p.role='sales_manager' and p.team=r.scope_team))
  on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
  -- No fallback reviewer or auto-approval when an independent stage is absent.
  if not exists(select 1 from public.profiles p where p.active=true and p.role='owner' and p.id<>r.requester_id)
   or not exists(select 1 from public.profiles p where p.active=true and p.role='sales_manager' and p.team=r.scope_team and p.id<>r.requester_id) then
   insert into public.notifications(recipient_id,type,title,body,export_request_id,export_event_id)
   values(r.requester_id,'crm_export_review','导出申请缺少独立审核人','申请已保存，但缺少独立主管或老板。请落实审核人；系统不会自动放行。',r.id,new.id)
   on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
  end if;
 elsif new.event_type in ('approved_manager','approved_owner','rejected','revoked','consumed') then
  message_title:=case when new.event_type='rejected' then '导出申请已驳回'
   when new.event_type='revoked' then '导出申请已撤回'
   when new.event_type='consumed' then '导出授权已领取'
   when r.status='approved' then '导出申请已获双审批' else '导出申请仍待另一位审核' end;
  insert into public.notifications(recipient_id,type,title,body,export_request_id,export_event_id)
  select p.id,'crm_export_status',message_title,
   case when r.status='approved' then '请在批准后的 10 分钟有效期内进入审批中心领取一次。领取时仍会核对权限和风险状态。'
   else '请进入导出审批中心查看最新状态与处理记录。' end,r.id,new.id
  from public.profiles p where p.id=r.requester_id and p.active=true
  on conflict(export_event_id,recipient_id) where export_event_id is not null do nothing;
 end if;
 return new;
end $$;
revoke all on function private.notify_crm_export_event() from public,anon,authenticated;
create trigger crm_export_event_notify after insert on public.crm_export_events
for each row execute function private.notify_crm_export_event();

create function private.protect_export_notification() returns trigger
language plpgsql set search_path='' as $$
begin
 if (old.export_event_id is not null or new.export_event_id is not null or old.export_request_id is not null or new.export_request_id is not null) and
  row(new.recipient_id,new.inquiry_id,new.type,new.title,new.body,new.export_request_id,new.export_event_id)
   is distinct from row(old.recipient_id,old.inquiry_id,old.type,old.title,old.body,old.export_request_id,old.export_event_id) then
  raise exception '导出通知内容与关联对象不可修改';
 end if;
 return new;
end $$;
revoke all on function private.protect_export_notification() from public,anon,authenticated;
create trigger export_notification_content_immutable before update on public.notifications
for each row execute function private.protect_export_notification();
-- Clients cannot forge export notification associations through an existing
-- permissive INSERT policy. The trusted event trigger creates them atomically.
create policy notifications_no_client_export_link on public.notifications
as restrictive for insert to public
with check (export_request_id is null and export_event_id is null);
commit;

