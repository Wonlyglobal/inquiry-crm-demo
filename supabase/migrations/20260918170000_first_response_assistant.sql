-- Persist the evidence-aware first-response plan alongside each AI reply draft.

alter table public.email_ai_drafts
  add column if not exists response_plan jsonb not null default '{}'::jsonb;

create or replace function public.record_email_ai_draft(
  target_author_id uuid,
  target_inquiry_id uuid,
  target_source_message_id uuid,
  draft_action text,
  target_language text,
  draft_subject text,
  draft_body text,
  draft_rationale text,
  draft_instruction text,
  draft_response_plan jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  draft_id uuid;
  author_role public.crm_role;
  source_item public.email_messages;
  inquiry_owner uuid;
  safe_plan jsonb:=case when jsonb_typeof(draft_response_plan)='object' then draft_response_plan else '{}'::jsonb end;
begin
  if (select auth.role())<>'service_role' then raise exception '仅邮件助手服务可保存 AI 草稿'; end if;
  select p.role into author_role from public.profiles p
  where p.id=target_author_id and p.active=true;
  if author_role not in ('owner','sales_manager','marketing','sales') then raise exception '草稿作者无权使用邮件助手'; end if;

  if draft_action='reply' then
    select * into source_item from public.email_messages m
    where m.id=target_source_message_id and m.direction='inbound';
    if not found or source_item.inquiry_id is distinct from target_inquiry_id then raise exception 'AI 回复来源邮件无效'; end if;
    select i.owner_id into inquiry_owner from public.inquiries i where i.id=target_inquiry_id;
    if not found then raise exception 'AI 回复关联询盘不存在'; end if;
    if inquiry_owner is distinct from target_author_id
      and author_role not in ('owner','sales_manager')
      and not exists(select 1 from public.mailbox_connections mc where mc.id=source_item.mailbox_connection_id and mc.user_id=target_author_id)
    then raise exception 'AI 回复草稿不属于当前账号'; end if;
  elsif draft_action<>'translate' then
    raise exception '不支持的邮件助手操作';
  end if;

  insert into public.email_ai_drafts(
    author_id,inquiry_id,source_message_id,action,language,subject,body_text,
    rationale_zh,supplemental_instruction,response_plan
  ) values(
    target_author_id,target_inquiry_id,target_source_message_id,draft_action,target_language,
    btrim(draft_subject),btrim(draft_body),nullif(btrim(draft_rationale),''),
    nullif(btrim(draft_instruction),''),safe_plan
  ) returning id into draft_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(target_author_id,case when target_inquiry_id is null then 'profile' else 'inquiry' end,
    coalesce(target_inquiry_id,target_author_id),'mail_ai_draft_generated',
    jsonb_build_object('draft_id',draft_id,'action',draft_action,'language',target_language,
      'source_message_id',target_source_message_id,'response_mode',safe_plan->>'mode',
      'recommended_send_at',safe_plan->>'recommended_send_at'),
    '邮件智能助手生成并持久化草稿及首次响应建议');
  return draft_id;
end;
$$;

revoke all on function public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;

