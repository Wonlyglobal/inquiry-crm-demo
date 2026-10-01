-- Competitor YouTube tracking (owner, 2026-10-01): channels are found on each competitor's OFFICIAL website,
-- new uploads are read from YouTube's public RSS feed. No API key, no login, public information only.
alter table public.competitor_intel drop constraint if exists competitor_intel_kind_check;
alter table public.competitor_intel add constraint competitor_intel_kind_check check (kind in ('news','evidence_changed','video'));
create table if not exists public.competitor_channels (
  company text not null check (char_length(company) between 1 and 120),
  platform text not null check (platform in ('youtube')),
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  found_at timestamptz not null default clock_timestamp(),
  primary key (company,platform)
);
alter table public.competitor_channels enable row level security;
revoke all on public.competitor_channels from anon,authenticated;
grant all on public.competitor_channels to service_role;
alter table public.competitor_watch_runs add column if not exists channels_read integer not null default 0;
-- Report also says how many YouTube channels are tracked.
create or replace function public.competitor_intel_report(p_days integer,p_company text)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz;
begin
  perform public.agent_correction_actor();
  since := clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,14),1),90));
  return jsonb_build_object(
    'last_run',(select to_jsonb(r) from (select started_at,trigger,sources_ok,sources_failed,evidence_checked,new_items,channels_read,(select count(*) from public.competitor_channels) as channels_known from public.competitor_watch_runs order by id desc limit 1) r),
    'items',(select coalesce(jsonb_agg(x order by x.first_seen desc),'[]') from (
      select id,company,kind,title,title_zh,url,published_on,evidence_id,status,first_seen from public.competitor_intel
      where first_seen>=since and status<>'dismissed' and (p_company is null or company=p_company)
      order by first_seen desc limit 60) x));
end; $$;
-- Rollback: drop table public.competitor_channels; restore the kind check without 'video'.
