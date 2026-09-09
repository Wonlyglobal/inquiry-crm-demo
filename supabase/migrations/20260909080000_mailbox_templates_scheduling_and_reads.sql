create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text not null default 'reply' check (category in ('reply','follow_up','quotation','sample','other')),
  language text not null default '英文',
  subject text,
  body_text text not null check (char_length(btrim(body_text)) > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,name)
);

alter table public.email_templates enable row level security;
drop policy if exists email_templates_own_all on public.email_templates;
create policy email_templates_own_all on public.email_templates for all to authenticated
  using ((select auth.uid())=owner_id)
  with check ((select auth.uid())=owner_id);
grant select,insert,update,delete on public.email_templates to authenticated;
grant all on public.email_templates to service_role;

create table if not exists public.email_message_reads (
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key(email_message_id,user_id)
);

alter table public.email_message_reads enable row level security;
drop policy if exists email_message_reads_own_select on public.email_message_reads;
drop policy if exists email_message_reads_own_insert on public.email_message_reads;
drop policy if exists email_message_reads_own_update on public.email_message_reads;
create policy email_message_reads_own_select on public.email_message_reads for select to authenticated
  using ((select auth.uid())=user_id);
create policy email_message_reads_own_insert on public.email_message_reads for insert to authenticated
  with check ((select auth.uid())=user_id and exists(select 1 from public.email_messages m where m.id=email_message_id));
create policy email_message_reads_own_update on public.email_message_reads for update to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
grant select,insert,update on public.email_message_reads to authenticated;
grant all on public.email_message_reads to service_role;

alter table public.mail_outbox
  alter column inquiry_id drop not null,
  add column if not exists cc_emails text[] not null default '{}',
  add column if not exists in_reply_to text,
  add column if not exists delivery_mode text not null default 'immediate'
    check (delivery_mode in ('immediate','scheduled'));

alter table public.mail_outbox drop constraint if exists mail_outbox_status_check;
alter table public.mail_outbox add constraint mail_outbox_status_check
  check (status in ('pending','sending','sent','failed','cancelled'));

create index if not exists mail_outbox_sender_schedule_idx
  on public.mail_outbox(sender_user_id,next_attempt_at desc);

drop policy if exists mail_outbox_sender_select on public.mail_outbox;
drop policy if exists mail_outbox_sender_schedule_insert on public.mail_outbox;
drop policy if exists mail_outbox_sender_schedule_update on public.mail_outbox;
create policy mail_outbox_sender_select on public.mail_outbox for select to authenticated
  using ((select auth.uid())=sender_user_id);
create policy mail_outbox_sender_schedule_insert on public.mail_outbox for insert to authenticated
  with check (
    (select auth.uid())=sender_user_id
    and status='pending'
    and attempts=0
    and delivery_mode='scheduled'
    and next_attempt_at between clock_timestamp()+interval '2 minutes' and clock_timestamp()+interval '30 days'
    and exists(
      select 1 from public.profiles p
      where p.id=(select auth.uid()) and p.active=true and p.role in ('sales','sales_manager','marketing','owner')
    )
    and exists(
      select 1 from public.mailbox_connections c
      where c.user_id=(select auth.uid()) and c.mailbox_kind='personal' and c.status='connected'
    )
    and (
      inquiry_id is null
      or exists(
        select 1 from public.inquiries i
        where i.id=inquiry_id and (
          i.owner_id=(select auth.uid())
          or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true and p.role in ('owner','sales_manager'))
        )
      )
    )
  );
create policy mail_outbox_sender_schedule_update on public.mail_outbox for update to authenticated
  using ((select auth.uid())=sender_user_id and delivery_mode='scheduled' and status='pending')
  with check ((select auth.uid())=sender_user_id and delivery_mode='scheduled' and status in ('pending','cancelled'));
grant select on public.mail_outbox to authenticated;
grant insert(inquiry_id,sender_user_id,recipient_email,cc_emails,subject,body_text,in_reply_to,status,next_attempt_at,delivery_mode) on public.mail_outbox to authenticated;
grant update(status,updated_at) on public.mail_outbox to authenticated;

create or replace function public.schedule_mailbox_message(
  target_inquiry_id uuid,
  recipient_email text,
  cc_list text[],
  mail_subject text,
  mail_body text,
  reply_message_id text,
  scheduled_for timestamptz
) returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  outbox_id uuid;
begin
  if actor is null then raise exception '请先登录'; end if;
  select role::text into actor_role from public.profiles where id=actor and active=true;
  if actor_role not in ('sales','sales_manager','marketing','owner') then raise exception '当前账号无权发送邮件'; end if;
  if recipient_email is null or recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '收件人邮箱格式不正确'; end if;
  if exists(select 1 from unnest(coalesce(cc_list,'{}'::text[])) cc where cc !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception '抄送邮箱格式不正确'; end if;
  if btrim(coalesce(mail_subject,''))='' or btrim(coalesce(mail_body,''))='' then raise exception '主题和正文不能为空'; end if;
  if scheduled_for < clock_timestamp()+interval '2 minutes' or scheduled_for > clock_timestamp()+interval '30 days' then raise exception '定时发送须设置为 2 分钟后至 30 天内'; end if;
  if not exists(select 1 from public.mailbox_connections c where c.user_id=actor and c.mailbox_kind='personal' and c.status='connected') then raise exception '请先连接当前业务员自己的企业邮箱'; end if;
  if target_inquiry_id is not null and not exists(
    select 1 from public.inquiries i where i.id=target_inquiry_id and (i.owner_id=actor or actor_role in ('owner','sales_manager'))
  ) then raise exception '只能为本人负责或有权管理的询盘安排邮件'; end if;
  insert into public.mail_outbox(inquiry_id,sender_user_id,recipient_email,cc_emails,subject,body_text,in_reply_to,status,next_attempt_at,delivery_mode)
  values(target_inquiry_id,actor,lower(btrim(recipient_email)),coalesce(cc_list,'{}'),btrim(mail_subject),btrim(mail_body),nullif(btrim(reply_message_id),''),'pending',scheduled_for,'scheduled')
  returning id into outbox_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,case when target_inquiry_id is null then 'profile' else 'inquiry' end,coalesce(target_inquiry_id,actor),'mailbox_message_scheduled',jsonb_build_object('outbox_id',outbox_id,'recipient',lower(btrim(recipient_email)),'subject',btrim(mail_subject),'scheduled_for',scheduled_for),'业务员在 CRM 安排定时邮件');
  return outbox_id;
end;
$$;

revoke all on function public.schedule_mailbox_message(uuid,text,text[],text,text,text,timestamptz) from public,anon;
grant execute on function public.schedule_mailbox_message(uuid,text,text[],text,text,text,timestamptz) to authenticated;

create or replace function public.cancel_scheduled_mailbox_message(target_outbox_id uuid)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception '请先登录'; end if;
  update public.mail_outbox
  set status='cancelled',updated_at=clock_timestamp()
  where id=target_outbox_id and sender_user_id=actor and delivery_mode='scheduled' and status='pending';
  if not found then raise exception '邮件已开始发送、已取消或不存在'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'mailbox_message_cancelled',jsonb_build_object('outbox_id',target_outbox_id),'业务员取消 CRM 定时邮件');
  return true;
end;
$$;

revoke all on function public.cancel_scheduled_mailbox_message(uuid) from public,anon;
grant execute on function public.cancel_scheduled_mailbox_message(uuid) to authenticated;
