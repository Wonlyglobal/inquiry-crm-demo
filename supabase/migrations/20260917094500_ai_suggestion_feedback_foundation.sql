-- Reusable, evidence-bearing AI suggestions with explicit human feedback.
-- AI may recommend; existing audited business workflows remain authoritative.

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggestion_type text not null check (char_length(btrim(suggestion_type)) between 1 and 80),
  target_type text not null check (char_length(btrim(target_type)) between 1 and 80),
  target_id uuid not null,
  source_hash text not null check (char_length(source_hash) between 16 and 128),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  proposed_data jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_data)='object'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  rationale_zh text,
  status text not null default 'generated' check (status in ('generated','accepted','modified','rejected','superseded')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_decision text check (review_decision is null or review_decision in ('accepted','modified','rejected')),
  review_note text,
  applied_data jsonb check (applied_data is null or jsonb_typeof(applied_data)='object'),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists ai_suggestions_target_created_idx
  on public.ai_suggestions(target_type,target_id,suggestion_type,created_at desc);
create index if not exists ai_suggestions_requested_created_idx
  on public.ai_suggestions(requested_by,created_at desc);
create unique index if not exists ai_suggestions_one_generated_target_idx
  on public.ai_suggestions(suggestion_type,target_type,target_id)
  where status='generated';

alter table public.ai_suggestions enable row level security;
drop policy if exists ai_suggestions_visible_scope on public.ai_suggestions;
create policy ai_suggestions_visible_scope on public.ai_suggestions for select to authenticated
using (
  case
    when target_type='email_intake' then private.current_crm_role() in ('owner','sales_manager','marketing')
    when target_type='inquiry' then
      private.current_crm_role() in ('owner','sales_manager','marketing')
      or exists(select 1 from public.inquiries i where i.id=target_id and i.owner_id=(select auth.uid()))
    else private.current_crm_role() in ('owner','sales_manager')
  end
);

revoke all on public.ai_suggestions from anon,authenticated;
grant select on public.ai_suggestions to authenticated;
grant all on public.ai_suggestions to service_role;

-- The dedicated marketing viewer role was created before this table existed,
-- so extend the same read visibility without granting any mutation or review RPC.
do $$
begin
  if exists(select 1 from pg_roles where rolname='crm_marketing_readonly') then
    execute 'grant select on public.ai_suggestions to crm_marketing_readonly';
    execute $policy$
      create policy ai_suggestions_readonly_visible_scope on public.ai_suggestions
      for select to crm_marketing_readonly
      using (
        case
          when target_type='email_intake' then private.current_crm_role() in ('owner','sales_manager','marketing')
          when target_type='inquiry' then
            private.current_crm_role() in ('owner','sales_manager','marketing')
            or exists(select 1 from public.inquiries i where i.id=target_id and i.owner_id=private.crm_readonly_uid())
          else private.current_crm_role() in ('owner','sales_manager')
        end
      )
    $policy$;
  end if;
end $$;

create or replace function public.record_ai_suggestion(
  target_suggestion_type text,
  target_target_type text,
  target_target_id uuid,
  target_source_hash text,
  target_provider text,
  target_model text,
  target_confidence numeric,
  target_proposed_data jsonb,
  target_evidence jsonb,
  target_rationale_zh text,
  target_requested_by uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  suggestion_id uuid;
begin
  if (select auth.role())<>'service_role' then raise exception '仅 AI 建议服务可写入建议'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_requested_by and p.active=true) then
    raise exception '建议请求人账号不可用';
  end if;
  if target_target_type='email_intake' and not exists(select 1 from public.email_intake e where e.id=target_target_id) then
    raise exception '目标邮件不存在';
  elsif target_target_type='inquiry' and not exists(select 1 from public.inquiries i where i.id=target_target_id) then
    raise exception '目标询盘不存在';
  end if;
  if jsonb_typeof(coalesce(target_proposed_data,'{}'::jsonb))<>'object'
    or jsonb_typeof(coalesce(target_evidence,'[]'::jsonb))<>'array' then
    raise exception 'AI 建议结构不正确';
  end if;

  select s.id into suggestion_id from public.ai_suggestions s
  where s.suggestion_type=btrim(target_suggestion_type)
    and s.target_type=btrim(target_target_type)
    and s.target_id=target_target_id
    and s.source_hash=target_source_hash
    and s.status='generated'
  order by s.created_at desc limit 1;
  if suggestion_id is not null then return suggestion_id; end if;

  update public.ai_suggestions
  set status='superseded',updated_at=clock_timestamp()
  where suggestion_type=btrim(target_suggestion_type)
    and target_type=btrim(target_target_type)
    and target_id=target_target_id
    and status='generated';

  insert into public.ai_suggestions(
    suggestion_type,target_type,target_id,source_hash,provider,model,confidence,
    proposed_data,evidence,rationale_zh,requested_by
  ) values(
    btrim(target_suggestion_type),btrim(target_target_type),target_target_id,target_source_hash,
    btrim(target_provider),btrim(target_model),least(1,greatest(0,target_confidence)),
    coalesce(target_proposed_data,'{}'::jsonb),coalesce(target_evidence,'[]'::jsonb),
    nullif(btrim(target_rationale_zh),''),target_requested_by
  ) returning id into suggestion_id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(target_requested_by,target_target_type,target_target_id,'ai_suggestion_generated',
    jsonb_build_object('suggestion_id',suggestion_id,'suggestion_type',target_suggestion_type,
      'provider',target_provider,'model',target_model,'confidence',target_confidence),
    'AI 生成带证据的业务建议，等待人工审核');
  return suggestion_id;
end;
$$;

revoke all on function public.record_ai_suggestion(text,text,uuid,text,text,text,numeric,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.record_ai_suggestion(text,text,uuid,text,text,text,numeric,jsonb,jsonb,text,uuid) to service_role;

create or replace function public.review_ai_suggestion(
  target_suggestion_id uuid,
  target_decision text,
  target_applied_data jsonb default null,
  target_review_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  actor_role public.crm_role;
  item public.ai_suggestions;
begin
  select p.role into actor_role from public.profiles p where p.id=actor_id and p.active=true;
  if actor_role is null then raise exception '当前账号不可用'; end if;
  if target_decision not in ('accepted','modified','rejected') then raise exception 'AI 建议审核结果不正确'; end if;
  if target_decision='modified' and jsonb_typeof(coalesce(target_applied_data,'null'::jsonb))<>'object' then
    raise exception '修改后采纳必须提供结构化结果';
  end if;

  select * into item from public.ai_suggestions s where s.id=target_suggestion_id for update;
  if not found then raise exception 'AI 建议不存在'; end if;
  if item.status<>'generated' then raise exception '该 AI 建议已经审核或已过期'; end if;
  if item.target_type='email_intake' and actor_role not in ('owner','sales_manager','marketing') then
    raise exception '当前账号无权审核邮件分拣建议';
  elsif item.target_type='inquiry'
    and actor_role not in ('owner','sales_manager','marketing')
    and not exists(select 1 from public.inquiries i where i.id=item.target_id and i.owner_id=actor_id) then
    raise exception '当前账号无权审核该询盘建议';
  elsif item.target_type not in ('email_intake','inquiry') and actor_role not in ('owner','sales_manager') then
    raise exception '当前账号无权审核该建议';
  end if;

  update public.ai_suggestions
  set status=target_decision,review_decision=target_decision,reviewed_by=actor_id,
      reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),
      review_note=nullif(btrim(target_review_note),''),
      applied_data=case when target_decision='modified' then target_applied_data
        when target_decision='accepted' then item.proposed_data else null end
  where id=item.id;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(actor_id,item.target_type,item.target_id,'ai_suggestion_reviewed',
    jsonb_build_object('suggestion_id',item.id,'status',item.status,'proposed_data',item.proposed_data),
    jsonb_build_object('suggestion_id',item.id,'status',target_decision,'applied_data',
      case when target_decision='modified' then target_applied_data when target_decision='accepted' then item.proposed_data else null end),
    coalesce(nullif(btrim(target_review_note),''),'AI 建议人工审核'));

  return jsonb_build_object('id',item.id,'status',target_decision,'reviewed_by',actor_id);
end;
$$;

revoke all on function public.review_ai_suggestion(uuid,text,jsonb,text) from public,anon;
grant execute on function public.review_ai_suggestion(uuid,text,jsonb,text) to authenticated;

notify pgrst,'reload schema';
