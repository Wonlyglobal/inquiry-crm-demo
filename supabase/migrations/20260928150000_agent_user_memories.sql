-- Long-term preferences Chloe asks the CRM agents to remember (approved 2026-09-28).
-- Style and focus only; the edge function refuses contacts, links, credentials and rule-changing text,
-- and this table repeats the contact/credential check. Only active rows are read (service role) into
-- the model prompt. Every change is audited; forgetting marks the row forgotten (content is cleared).
create table if not exists public.agent_user_memories (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('Grace','Brian','Jay')),
  scope text not null default 'all' check (scope in ('all','persona')),
  content text check (content is null or char_length(content) between 4 and 200),
  status text not null default 'active' check (status in ('active','forgotten')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  forgotten_at timestamptz,
  check ((status='active' and content is not null) or status='forgotten')
);
create index if not exists agent_user_memories_active on public.agent_user_memories(status,id);
alter table public.agent_user_memories enable row level security;
revoke all on public.agent_user_memories from anon,authenticated;
grant all on public.agent_user_memories to service_role;

-- Same single owner as agent_correction_actor() (20260928130000).
create or replace function public.remember_agent_preference(p_persona text,p_scope text,p_content text)
returns public.agent_user_memories
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); saved public.agent_user_memories;
  sensitive constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(\+|00)\d[\d \-]{7,}|sk-[A-Za-z0-9_-]{8,}|https?://|(密码|密钥|口令)';
begin
  if coalesce(p_content,'')~*sensitive then raise exception '记忆内容疑似包含联系方式、链接或凭据'; end if;
  if (select count(*) from public.agent_user_memories where status='active')>=30 then raise exception '长期偏好已达30条，请先忘记一些'; end if;
  insert into public.agent_user_memories(persona,scope,content,created_by) values(p_persona,p_scope,btrim(p_content),actor) returning * into saved;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_memory_saved',jsonb_build_object('memory_id',saved.id,'persona',saved.persona,'scope',saved.scope),'用户要求智能体记住长期偏好');
  return saved;
end; $$;

create or replace function public.list_agent_preferences()
returns setof public.agent_user_memories
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.agent_correction_actor();
  return query select * from public.agent_user_memories m where m.status='active' order by m.id limit 30;
end; $$;

-- p_id null = forget all active memories. Returns the number forgotten.
create or replace function public.forget_agent_preference(p_id bigint)
returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); n integer;
begin
  update public.agent_user_memories m set status='forgotten',content=null,forgotten_at=clock_timestamp()
  where m.status='active' and (p_id is null or m.id=p_id);
  get diagnostics n = row_count;
  if p_id is not null and n=0 then raise exception '记忆不存在或已忘记'; end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_memory_forgotten',jsonb_build_object('memory_id',p_id,'count',n),'用户要求智能体忘记长期偏好');
  return n;
end; $$;

revoke all on function public.remember_agent_preference(text,text,text) from public,anon;
revoke all on function public.list_agent_preferences() from public,anon;
revoke all on function public.forget_agent_preference(bigint) from public,anon;
grant execute on function public.remember_agent_preference(text,text,text) to authenticated,service_role;
grant execute on function public.list_agent_preferences() to authenticated,service_role;
grant execute on function public.forget_agent_preference(bigint) to authenticated,service_role;
-- Rollback: drop function public.forget_agent_preference(bigint), public.list_agent_preferences(),
-- public.remember_agent_preference(text,text,text); drop table public.agent_user_memories;
