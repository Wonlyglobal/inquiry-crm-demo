-- Automatic and mail-sync refreshes are idempotent per latest source message.
-- Keep old duplicate history intact: only new generations carry a key.
-- Manual refreshes intentionally remain append-only so an operator can record
-- a new interpretation even when no new message arrived.
alter table public.communication_summaries
  add column if not exists generation_dedupe_key text;

create unique index if not exists communication_summaries_generation_dedupe_key_idx
  on public.communication_summaries(generation_dedupe_key)
  where generation_dedupe_key is not null;
