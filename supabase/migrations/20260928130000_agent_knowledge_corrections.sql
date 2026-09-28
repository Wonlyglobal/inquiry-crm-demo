-- Reviewed correction memory for the CRM agents (Grace/Brian/Jay).
-- Chloe (the approved agent-world owner and designated reviewer, 2026-09-28) submits a correction
-- in conversation; it only takes effect after an explicit approve step, and can be revoked.
-- Only approved rows are read by agent-conversation (service role). Every action is audited.

create table if not exists public.agent_knowledge_corrections (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('Grace','Brian','Jay')),
  wrong_claim text check (wrong_claim is null or char_length(wrong_claim) between 2 and 500),
  correction text not null check (char_length(correction) between 4 and 800),
  source_note text not null check (char_length(source_note) between 2 and 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note)<=300)
);
create index if not exists agent_knowledge_corrections_status on public.agent_knowledge_corrections(status,reviewed_at desc);

alter table public.agent_knowledge_corrections enable row level security;
revoke all on public.agent_knowledge_corrections from anon,authenticated;
grant all on public.agent_knowledge_corrections to service_role;

-- Reviewer = the single approved agent-world owner. Kept identical to agent-conversation policy.eligible().
create or replace function public.agent_correction_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or actor<>'c43bd3c2-6e3a-4228-99c7-dc95f33643f2'::uuid
    or not exists(select 1 from public.profiles p where p.id=actor and p.active=true and p.role='owner')
  then raise exception '当前账号无权维护智能体纠错知识'; end if;
  return actor;
end; $$;
revoke all on function public.agent_correction_actor() from public,anon,authenticated;

create or replace function public.submit_agent_correction(p_persona text,p_wrong_claim text,p_correction text,p_source_note text)
returns public.agent_knowledge_corrections
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); saved public.agent_knowledge_corrections;
  sensitive constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(\+|00)\d[\d \-]{7,}|sk-[A-Za-z0-9_-]{12,}|(密码|密钥|口令)\s*[:：=]';
begin
  if coalesce(p_correction,'')~sensitive or coalesce(p_wrong_claim,'')~sensitive or coalesce(p_source_note,'')~sensitive
  then raise exception '纠错内容疑似包含联系方式或凭据，请去掉后再提交'; end if;
  if (select count(*) from public.agent_knowledge_corrections where status='pending')>=50
  then raise exception '待审核纠错已达50条，请先审核'; end if;
  insert into public.agent_knowledge_corrections(persona,wrong_claim,correction,source_note,created_by)
  values(p_persona,nullif(btrim(p_wrong_claim),''),btrim(p_correction),btrim(p_source_note),actor)
  returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_correction_submitted',jsonb_build_object('correction_id',saved.id,'persona',saved.persona),'提交智能体纠错知识，待审核后生效');
  return saved;
end; $$;

create or replace function public.review_agent_correction(p_id bigint,p_decision text,p_note text)
returns public.agent_knowledge_corrections
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); saved public.agent_knowledge_corrections; next_status text;
begin
  next_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'revoke' then 'revoked' end;
  if next_status is null then raise exception '审核操作无效'; end if;
  update public.agent_knowledge_corrections c set status=next_status,reviewed_by=actor,reviewed_at=clock_timestamp(),review_note=nullif(btrim(coalesce(p_note,'')),'')
  where c.id=p_id and ((next_status in ('approved','rejected') and c.status='pending') or (next_status='revoked' and c.status='approved'))
  returning * into saved;
  if saved.id is null then raise exception '纠错不存在或当前状态不允许该操作'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_correction_'||next_status,jsonb_build_object('correction_id',saved.id,'status',saved.status),'审核智能体纠错知识');
  return saved;
end; $$;

create or replace function public.list_agent_corrections(p_status text)
returns setof public.agent_knowledge_corrections
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.agent_correction_actor();
  if p_status not in ('pending','approved','rejected','revoked') then raise exception '状态无效'; end if;
  return query select * from public.agent_knowledge_corrections c where c.status=p_status order by c.id desc limit 50;
end; $$;

revoke all on function public.submit_agent_correction(text,text,text,text) from public,anon;
revoke all on function public.review_agent_correction(bigint,text,text) from public,anon;
revoke all on function public.list_agent_corrections(text) from public,anon;
grant execute on function public.submit_agent_correction(text,text,text,text) to authenticated,service_role;
grant execute on function public.review_agent_correction(bigint,text,text) to authenticated,service_role;
grant execute on function public.list_agent_corrections(text) to authenticated,service_role;

-- Rollback: drop function public.list_agent_corrections(text), public.review_agent_correction(bigint,text,text),
-- public.submit_agent_correction(text,text,text,text), public.agent_correction_actor(); drop table public.agent_knowledge_corrections;
-- (audit_logs rows are retained.)
