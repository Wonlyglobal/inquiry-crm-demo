alter table public.communication_summaries
  add column if not exists confirmed_items text,
  add column if not exists pending_items text,
  add column if not exists recommended_follow_up_at timestamptz,
  add column if not exists summary_scope text not null default 'message'
    check (summary_scope in ('message','thread')),
  add column if not exists message_count integer not null default 1
    check (message_count >= 0);

create index if not exists communication_summaries_inquiry_latest_idx
  on public.communication_summaries(inquiry_id, created_at desc);

grant select on public.communication_summaries to authenticated;
grant all on public.communication_summaries to service_role;
