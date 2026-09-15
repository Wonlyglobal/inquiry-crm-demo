-- Keep every generated mailbox AI draft recoverable and auditable.

create table if not exists public.email_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  source_message_id uuid references public.email_messages(id) on delete set null,
  action text not null check(action in ('reply','translate')),
  language text not null check(language in ('English','Spanish','Portuguese','French','Arabic','Russian','Chinese')),
  subject text not null check(char_length(btrim(subject)) between 1 and 500),
  body_text text not null check(char_length(btrim(body_text)) between 1 and 12000),
  rationale_zh text,
  supplemental_instruction text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists email_ai_drafts_author_created_idx
  on public.email_ai_drafts(author_id,created_at desc);
alter table public.email_ai_drafts enable row level security;
drop policy if exists email_ai_drafts_own_select on public.email_ai_drafts;
create policy email_ai_drafts_own_select on public.email_ai_drafts for select to authenticated
  using(author_id=(select auth.uid()));
revoke all on public.email_ai_drafts from anon,authenticated;
grant select on public.email_ai_drafts to authenticated;
grant all on public.email_ai_drafts to service_role;

create or replace function public.record_email_ai_draft(
  target_author_id uuid,
  target_inquiry_id uuid,
  target_source_message_id uuid,
  draft_action text,
  target_language text,
  draft_subject text,
  draft_body text,
  draft_rationale text,
  draft_instruction text
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
    author_id,inquiry_id,source_message_id,action,language,subject,body_text,rationale_zh,supplemental_instruction
  ) values(
    target_author_id,target_inquiry_id,target_source_message_id,draft_action,target_language,
    btrim(draft_subject),btrim(draft_body),nullif(btrim(draft_rationale),''),nullif(btrim(draft_instruction),'')
  ) returning id into draft_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(target_author_id,case when target_inquiry_id is null then 'profile' else 'inquiry' end,
    coalesce(target_inquiry_id,target_author_id),'mail_ai_draft_generated',
    jsonb_build_object('draft_id',draft_id,'action',draft_action,'language',target_language,'source_message_id',target_source_message_id),
    '邮件智能助手生成并持久化草稿');
  return draft_id;
end;
$$;

revoke all on function public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_email_ai_draft(uuid,uuid,uuid,text,text,text,text,text,text) to service_role;
