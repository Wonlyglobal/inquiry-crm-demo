-- Owner ratings of agent answers, to find weak spots (approved 2026-09-28).
-- Question/answer text is kept only for "not useful" ratings, only in this private table (service role
-- and owner RPCs), never sent to external models by this feature. Deletable at any time.
create table if not exists public.agent_answer_feedback (
  id bigint generated always as identity primary key,
  persona text not null check (persona in ('Grace','Brian','Jay')),
  rating text not null check (rating in ('up','down')),
  reason text check (reason is null or reason in ('wrong_data','off_topic','too_long','too_vague','tone','other')),
  route text check (route is null or char_length(route)<=40),
  model text check (model is null or char_length(model)<=60),
  question text check (question is null or char_length(question)<=1000),
  answer_excerpt text check (answer_excerpt is null or char_length(answer_excerpt)<=2000),
  note text check (note is null or char_length(note)<=200),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  check (rating='down' or (question is null and answer_excerpt is null))
);
create index if not exists agent_answer_feedback_created on public.agent_answer_feedback(created_at desc);
alter table public.agent_answer_feedback enable row level security;
revoke all on public.agent_answer_feedback from anon,authenticated;
grant all on public.agent_answer_feedback to service_role;

create or replace function public.submit_agent_feedback(p_persona text,p_rating text,p_reason text,p_route text,p_model text,p_question text,p_answer text,p_note text)
returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); new_id bigint;
  secret constant text := 'sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|(密码|密钥|口令)\s*[:：=]';
begin
  if coalesce(p_question,'')~secret or coalesce(p_answer,'')~secret or coalesce(p_note,'')~secret then raise exception '反馈内容疑似包含凭据'; end if;
  if (select count(*) from public.agent_answer_feedback where created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception '反馈过于频繁，请稍后'; end if;
  insert into public.agent_answer_feedback(persona,rating,reason,route,model,question,answer_excerpt,note,created_by)
  values(p_persona,p_rating,case when p_rating='down' then p_reason end,left(p_route,40),left(p_model,60),
         case when p_rating='down' then left(p_question,1000) end,case when p_rating='down' then left(p_answer,2000) end,left(nullif(btrim(p_note),''),200),actor)
  returning id into new_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_feedback_submitted',jsonb_build_object('feedback_id',new_id,'persona',p_persona,'rating',p_rating,'reason',p_reason),'对智能体回答评分');
  return new_id;
end; $$;

create or replace function public.agent_feedback_summary(p_days integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz;
begin
  perform public.agent_correction_actor();
  since := clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,7),1),90));
  return jsonb_build_object(
    'days',least(greatest(coalesce(p_days,7),1),90),
    'by_persona',(select coalesce(jsonb_agg(x),'[]') from (select persona,count(*) filter(where rating='up') as up,count(*) filter(where rating='down') as down from public.agent_answer_feedback where created_at>=since group by persona order by persona) x),
    'by_route',(select coalesce(jsonb_agg(x),'[]') from (select coalesce(route,'unknown') as route,count(*) filter(where rating='up') as up,count(*) filter(where rating='down') as down from public.agent_answer_feedback where created_at>=since group by 1 order by 3 desc limit 10) x),
    'reasons',(select coalesce(jsonb_agg(x),'[]') from (select reason,count(*) as n from public.agent_answer_feedback where created_at>=since and rating='down' group by reason order by n desc) x),
    'recent_down',(select coalesce(jsonb_agg(x),'[]') from (select id,created_at::date as day,persona,route,reason,left(question,120) as question,note from public.agent_answer_feedback where created_at>=since and rating='down' order by id desc limit 10) x));
end; $$;

create or replace function public.delete_agent_feedback(p_id bigint)
returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); n integer;
begin
  delete from public.agent_answer_feedback f where p_id is null or f.id=p_id;
  get diagnostics n = row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_feedback_deleted',jsonb_build_object('feedback_id',p_id,'count',n),'删除智能体回答反馈');
  return n;
end; $$;

revoke all on function public.submit_agent_feedback(text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.agent_feedback_summary(integer) from public,anon;
revoke all on function public.delete_agent_feedback(bigint) from public,anon;
grant execute on function public.submit_agent_feedback(text,text,text,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.agent_feedback_summary(integer) to authenticated,service_role;
grant execute on function public.delete_agent_feedback(bigint) to authenticated,service_role;
-- Rollback: drop the three functions above; drop table public.agent_answer_feedback;
