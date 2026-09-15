-- Keep scheduled quotation delivery in the same audited workflow as immediate mail.
alter table public.mail_outbox
  add column if not exists quotation_id uuid references public.quotation_versions(id) on delete set null;
grant insert(quotation_id) on public.mail_outbox to authenticated;

create or replace function public.schedule_mailbox_message(
  target_inquiry_id uuid, recipient_email text, cc_list text[], mail_subject text,
  mail_body text, reply_message_id text, scheduled_for timestamptz,
  target_quotation_id uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid := (select auth.uid()); actor_role text; outbox_id uuid; quote public.quotation_versions;
begin
  if actor is null then raise exception '请先登录'; end if;
  select role::text into actor_role from public.profiles where id=actor and active=true;
  if actor_role not in ('sales','sales_manager','marketing','owner') then raise exception '当前账号无权发送邮件'; end if;
  if recipient_email is null or recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '收件人邮箱格式不正确'; end if;
  if exists(select 1 from unnest(coalesce(cc_list,'{}'::text[])) cc where cc !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception '抄送邮箱格式不正确'; end if;
  if btrim(coalesce(mail_subject,''))='' or btrim(coalesce(mail_body,''))='' then raise exception '主题和正文不能为空'; end if;
  if scheduled_for < clock_timestamp()+interval '2 minutes' or scheduled_for > clock_timestamp()+interval '30 days' then raise exception '定时发送须设置为 2 分钟后至 30 天内'; end if;
  if not exists(select 1 from public.mailbox_connections c where c.user_id=actor and c.mailbox_kind='personal' and c.status='connected') then raise exception '请先连接当前业务员自己的企业邮箱'; end if;
  if target_inquiry_id is not null and not exists(select 1 from public.inquiries i where i.id=target_inquiry_id and (i.owner_id=actor or actor_role in ('owner','sales_manager'))) then raise exception '只能为本人负责或有权管理的询盘安排邮件'; end if;
  if target_quotation_id is not null then
    select * into quote from public.quotation_versions where id=target_quotation_id;
    if not found or quote.inquiry_id is distinct from target_inquiry_id then raise exception '报价与当前询盘不匹配'; end if;
    if quote.status<>'approved' then raise exception '只有主管批准后的报价才能安排发送'; end if;
    if quote.created_by<>actor and actor_role not in ('owner','sales_manager') and not exists(select 1 from public.inquiries i where i.id=quote.inquiry_id and i.owner_id=actor) then raise exception '无权发送该报价'; end if;
  end if;
  insert into public.mail_outbox(inquiry_id,quotation_id,sender_user_id,recipient_email,cc_emails,subject,body_text,in_reply_to,status,next_attempt_at,delivery_mode)
  values(target_inquiry_id,target_quotation_id,actor,lower(btrim(recipient_email)),coalesce(cc_list,'{}'),btrim(mail_subject),btrim(mail_body),nullif(btrim(reply_message_id),''),'pending',scheduled_for,'scheduled') returning id into outbox_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,case when target_quotation_id is not null then 'quotation' when target_inquiry_id is not null then 'inquiry' else 'profile' end,coalesce(target_quotation_id,target_inquiry_id,actor),'mailbox_message_scheduled',jsonb_build_object('outbox_id',outbox_id,'recipient',lower(btrim(recipient_email)),'subject',btrim(mail_subject),'scheduled_for',scheduled_for,'quotation_id',target_quotation_id),'业务员在 CRM 安排定时邮件');
  return outbox_id;
end $$;

revoke all on function public.schedule_mailbox_message(uuid,text,text[],text,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.schedule_mailbox_message(uuid,text,text[],text,text,text,timestamptz,uuid) to authenticated;

create or replace function public.finalize_scheduled_quotation(target_outbox_id uuid,target_sent_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare job public.mail_outbox; quote public.quotation_versions; occurred_at timestamptz:=coalesce(target_sent_at,clock_timestamp());
begin
  if (select auth.role())<>'service_role' then raise exception '仅邮件同步服务可完成定时报价'; end if;
  select * into job from public.mail_outbox where id=target_outbox_id and status='sent' and quotation_id is not null for update;
  if not found then raise exception '定时报价任务不存在或尚未发送'; end if;
  select * into quote from public.quotation_versions where id=job.quotation_id and inquiry_id=job.inquiry_id for update;
  if not found or quote.status<>'approved' then raise exception '报价状态已变化，不能标记为已发送'; end if;
  update public.quotation_versions set status='sent',sent_at=occurred_at,sent_message_id=null,updated_at=occurred_at where id=quote.id;
  update public.inquiries set status=case when status in ('received','qualified','contacted') then 'quoted' else status end,estimated_amount=coalesce(estimated_amount,quote.total_amount),currency=coalesce(currency,quote.currency),quoted_at=coalesce(quoted_at,occurred_at),updated_at=occurred_at where id=quote.inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(job.sender_user_id,'quotation',quote.id,'quotation_sent',jsonb_build_object('status','approved'),jsonb_build_object('status','sent','inquiry_id',quote.inquiry_id,'outbox_id',job.id),'报价已通过定时邮件发送');
end $$;

revoke all on function public.finalize_scheduled_quotation(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_scheduled_quotation(uuid,timestamptz) to service_role;
