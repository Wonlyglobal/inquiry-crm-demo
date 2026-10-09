-- Grace request timeline (owner, 2026-09-28): every request with the sources used and the action windows
-- it opened, kept without time limit in this private table; the owner can delete one entry or all.
-- Windows are stored as small descriptors (catalogue/page, CRM view, inquiry id, evidence id, search
-- query + result titles/links, material id/name) - never signed links, files or customer contact fields.
create table if not exists public.agent_request_timeline (
  id bigint generated always as identity primary key,
  created_by uuid not null references public.profiles(id),
  persona text not null check (persona in ('Grace','Brian','Jay')),
  question text not null check (char_length(question) between 1 and 500),
  route text check (route is null or char_length(route)<=40),
  status text not null check (status in ('done','failed')),
  steps jsonb not null default '[]' check (jsonb_typeof(steps)='array' and jsonb_array_length(steps)<=12),
  windows jsonb not null default '[]' check (jsonb_typeof(windows)='array' and jsonb_array_length(windows)<=8),
  created_at timestamptz not null default clock_timestamp(),
  check (pg_column_size(steps)+pg_column_size(windows)<=16384)
);
create index if not exists agent_request_timeline_owner on public.agent_request_timeline(created_by,id desc);
alter table public.agent_request_timeline enable row level security;
revoke all on public.agent_request_timeline from anon,authenticated;
grant all on public.agent_request_timeline to service_role;

create or replace function public.add_agent_timeline(p_persona text,p_question text,p_route text,p_status text,p_steps jsonb,p_windows jsonb)
returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); new_id bigint;
  secret constant text := 'sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}|(密码|密钥|口令)\s*[:：=]';
begin
  if coalesce(p_question,'')~secret or coalesce(p_windows::text,'')~secret then raise exception '内容疑似包含凭据'; end if;
  if (select count(*) from public.agent_request_timeline where created_by=actor and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception '记录过于频繁，请稍后'; end if;
  insert into public.agent_request_timeline(created_by,persona,question,route,status,steps,windows)
  values(actor,p_persona,left(btrim(p_question),500),left(p_route,40),p_status,coalesce(p_steps,'[]'),coalesce(p_windows,'[]'))
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.list_agent_timeline(p_persona text,p_before bigint,p_limit integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor();
begin
  return (select coalesce(jsonb_agg(x order by x.id desc),'[]') from (
    select id,persona,question,route,status,steps,windows,created_at from public.agent_request_timeline
    where created_by=actor and (p_persona is null or persona=p_persona) and (p_before is null or id<p_before)
    order by id desc limit least(greatest(coalesce(p_limit,30),1),100)) x);
end; $$;

create or replace function public.delete_agent_timeline(p_id bigint)
returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.agent_correction_actor(); n integer;
begin
  delete from public.agent_request_timeline t where t.created_by=actor and (p_id is null or t.id=p_id);
  get diagnostics n = row_count;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(actor,'profile',actor,'agent_timeline_deleted',jsonb_build_object('id',p_id,'rows',n),case when p_id is null then '清空需求时间线' else '删除一条需求时间线' end);
  return n;
end; $$;

revoke all on function public.add_agent_timeline(text,text,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.list_agent_timeline(text,bigint,integer) from public,anon;
revoke all on function public.delete_agent_timeline(bigint) from public,anon;
grant execute on function public.add_agent_timeline(text,text,text,text,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.list_agent_timeline(text,bigint,integer) to authenticated,service_role;
grant execute on function public.delete_agent_timeline(bigint) to authenticated,service_role;
-- Rollback: drop the three functions above; drop table public.agent_request_timeline;
