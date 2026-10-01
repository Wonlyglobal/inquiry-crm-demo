-- Continuous competitor watch (owner, 2026-10-01): every 4 hours the agent-conversation function reads the
-- tracked competitors' OFFICIAL websites (news lists + the pages behind each evidence quote) and stores what
-- is new. Public information only; nothing from the CRM is sent anywhere. Grace reads this when asked.
create table if not exists public.competitor_intel (
  id bigint generated always as identity primary key,
  company text not null check (char_length(company) between 1 and 120),
  kind text not null check (kind in ('news','evidence_changed')),
  title text not null check (char_length(title) between 1 and 300),
  title_zh text check (title_zh is null or char_length(title_zh)<=300),
  url text not null check (url ~ '^https://' and char_length(url)<=600),
  published_on date,
  evidence_id text check (evidence_id is null or char_length(evidence_id)<=80),
  status text not null default 'new' check (status in ('new','reviewed','dismissed')),
  first_seen timestamptz not null default clock_timestamp(),
  unique (kind,url)
);
create index if not exists competitor_intel_seen on public.competitor_intel(first_seen desc);
create table if not exists public.competitor_watch_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default clock_timestamp(),
  trigger text not null check (trigger in ('schedule','owner')),
  sources_ok integer not null default 0,
  sources_failed integer not null default 0,
  evidence_checked integer not null default 0,
  new_items integer not null default 0
);
alter table public.competitor_intel enable row level security;
alter table public.competitor_watch_runs enable row level security;
revoke all on public.competitor_intel, public.competitor_watch_runs from anon,authenticated;
grant all on public.competitor_intel, public.competitor_watch_runs to service_role;

-- Owner-only report for Grace.
create or replace function public.competitor_intel_report(p_days integer,p_company text)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz;
begin
  perform public.agent_correction_actor();
  since := clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,14),1),90));
  return jsonb_build_object(
    'last_run',(select to_jsonb(r) from (select started_at,trigger,sources_ok,sources_failed,evidence_checked,new_items from public.competitor_watch_runs order by id desc limit 1) r),
    'items',(select coalesce(jsonb_agg(x order by x.first_seen desc),'[]') from (
      select id,company,kind,title,title_zh,url,published_on,evidence_id,status,first_seen from public.competitor_intel
      where first_seen>=since and status<>'dismissed' and (p_company is null or company=p_company)
      order by first_seen desc limit 60) x));
end; $$;
revoke all on function public.competitor_intel_report(integer,text) from public,anon;
grant execute on function public.competitor_intel_report(integer,text) to authenticated,service_role;
-- Rollback: drop function public.competitor_intel_report(integer,text); drop table public.competitor_intel, public.competitor_watch_runs;

-- Watch secret: generated inside the database (vault), checked here; never typed, copied or stored elsewhere.
create or replace function public.verify_competitor_watch_secret(p_secret text)
returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(char_length(p_secret) between 32 and 200,false)
     and exists(select 1 from vault.decrypted_secrets where name='competitor_watch_secret' and decrypted_secret=p_secret);
$$;
revoke all on function public.verify_competitor_watch_secret(text) from public,anon,authenticated;
grant execute on function public.verify_competitor_watch_secret(text) to service_role;
