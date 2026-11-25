begin;
-- Private inquiry-scoped search evidence, not published company master data.
create table public.inquiry_research_attempts (
 id uuid primary key,
 inquiry_id uuid not null references public.inquiries(id),
 actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 company_claim text not null check(length(company_claim) between 1 and 120),
 location_claim text not null default '' check(length(location_claim)<=160),
 status text not null check(status in ('completed','unavailable')),
 verification text not null default 'company_match_required' check(verification='company_match_required'),
 result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=30000)
);
create index inquiry_research_attempts_latest on public.inquiry_research_attempts(inquiry_id,created_at desc);
alter table public.inquiry_research_attempts enable row level security;
revoke all on public.inquiry_research_attempts from public,anon,authenticated,service_role;
grant select on public.inquiry_research_attempts to authenticated;
grant select,insert on public.inquiry_research_attempts to service_role;
create policy inquiry_research_attempts_read on public.inquiry_research_attempts for select to authenticated
 using(exists(select 1 from public.inquiries i where i.id=inquiry_id));
-- No client write/update/delete policies. Repeated research appends; history is retained.
commit;
