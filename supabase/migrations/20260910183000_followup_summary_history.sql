-- Communication summaries are append-only versions; keep why each was generated.
alter table public.communication_summaries
  add column if not exists generation_trigger text not null default 'mail_sync'
    check (generation_trigger in ('mail_sync','manual','automatic_refresh'));

create index if not exists communication_summaries_inquiry_versions_idx
  on public.communication_summaries(inquiry_id,created_at desc,id desc);
