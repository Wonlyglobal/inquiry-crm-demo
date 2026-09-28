-- Long-term conversation memory for the CRM agents (owner request 2026-09-28: no time limit).
-- Stores only turns the model itself answered (question + short answer summary + question embedding
-- from Bailian text-embedding-v4); internal-only answers (catalogue, materials, background records,
-- corrections) are never stored. Kept until the owner deletes them ("清空对话记忆" etc.).
-- Read/write by agent-conversation with the service role; the owner can list/delete via RPCs.
create extension if not exists vector with schema extensions;

create table if not exists public.agent_conversation_memory (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('Grace','Brian','Jay')),
  question text not null check (char_length(question) between 2 and 1000),
  answer_summary text not null check (char_length(answer_summary) between 1 and 800),
  embedding extensions.vector(1024) not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists agent_conversation_memory_recent on public.agent_conversation_memory(persona,created_at desc);
create index if not exists agent_conversation_memory_embedding on public.agent_conversation_memory using hnsw (embedding extensions.vector_cosine_ops);
alter table public.agent_conversation_memory enable row level security;
revoke all on public.agent_conversation_memory from anon,authenticated;
grant all on public.agent_conversation_memory to service_role;

-- Semantic recall (service role only). Similarity = 1 - cosine distance.
create or replace function public.match_agent_memories(p_embedding extensions.vector(1024),p_persona text,p_limit integer,p_min double precision)
returns table(id bigint,persona text,question text,answer_summary text,created_at timestamptz,similarity double precision)
language sql stable security definer set search_path='' as $$
  select m.id,m.persona,m.question,m.answer_summary,m.created_at,1-(m.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.agent_conversation_memory m
  where (p_persona is null or m.persona=p_persona)
  order by m.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(coalesce(p_limit,5),1),10)
$$;
revoke all on function public.match_agent_memories(extensions.vector,text,integer,double precision) from public,anon,authenticated;
grant execute on function public.match_agent_memories(extensions.vector,text,integer,double precision) to service_role;

create or replace function public.list_agent_conversation_memory()
returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.agent_correction_actor();
  return jsonb_build_object(
    'total',(select count(*) from public.agent_conversation_memory),
    'first_at',(select min(created_at)::date from public.agent_conversation_memory),
    'by_persona',(select coalesce(jsonb_object_agg(persona,n),'{}') from (select persona,count(*) n from public.agent_conversation_memory group by persona) x),
    'recent',(select coalesce(jsonb_agg(x),'[]') from (select id,created_at::date as day,persona,left(question,80) as question from public.agent_conversation_memory order by id desc limit 10) x));
end; $$;

-- p_scope: 'last' (most recent), 'match' (question or summary contains p_text), 'all'.
create or replace function public.forget_agent_conversation_memory(p_scope text,p_text text)
returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); n integer;
begin
  if p_scope='last' then delete from public.agent_conversation_memory where id=(select max(id) from public.agent_conversation_memory);
  elsif p_scope='match' and char_length(btrim(coalesce(p_text,'')))>=2 then
    delete from public.agent_conversation_memory m where strpos(m.question,btrim(p_text))>0 or strpos(m.answer_summary,btrim(p_text))>0;
  elsif p_scope='all' then delete from public.agent_conversation_memory;
  else raise exception '忘记范围无效'; end if;
  get diagnostics n = row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_conversation_memory_forgotten',jsonb_build_object('scope',p_scope,'count',n),'用户要求智能体忘记对话记忆');
  return n;
end; $$;
revoke all on function public.list_agent_conversation_memory() from public,anon;
revoke all on function public.forget_agent_conversation_memory(text,text) from public,anon;
grant execute on function public.list_agent_conversation_memory() to authenticated,service_role;
grant execute on function public.forget_agent_conversation_memory(text,text) to authenticated,service_role;
-- Rollback: drop the three functions; drop table public.agent_conversation_memory; (extension may stay)
