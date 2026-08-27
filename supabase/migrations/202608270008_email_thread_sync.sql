alter table public.mailbox_connections
  add column if not exists mailbox_kind text not null default 'personal'
    check (mailbox_kind in ('personal','shared_inquiry')),
  add column if not exists managed_team text,
  add column if not exists sync_enabled boolean not null default true;

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_connection_id uuid not null references public.mailbox_connections(id) on delete cascade,
  folder text not null,
  uid bigint not null,
  message_id text,
  in_reply_to text,
  reference_ids text[] not null default '{}',
  direction text not null check (direction in ('inbound','outbound')),
  sender_email text,
  recipient_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text,
  body_text text,
  body_html text,
  sent_at timestamptz,
  received_at timestamptz,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  association_status text not null default 'pending'
    check (association_status in ('matched','pending','ignored')),
  association_method text,
  attachment_count integer not null default 0,
  raw_headers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(mailbox_connection_id, folder, uid)
);

create index if not exists email_messages_message_id_idx on public.email_messages(message_id);
create index if not exists email_messages_inquiry_time_idx on public.email_messages(inquiry_id, coalesce(received_at,sent_at) desc);
create index if not exists email_messages_pending_idx on public.email_messages(created_at) where association_status='pending';

create table if not exists public.email_sync_cursors (
  mailbox_connection_id uuid not null references public.mailbox_connections(id) on delete cascade,
  folder text not null,
  uid_validity text,
  last_uid bigint not null default 0,
  last_synced_at timestamptz,
  last_error text,
  primary key(mailbox_connection_id,folder)
);

create table if not exists public.communication_summaries (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  source_message_id uuid references public.email_messages(id) on delete set null,
  summary_zh text not null,
  latest_customer_request text,
  objections text,
  commitments text,
  risks text,
  recommended_next_step text,
  provider text not null default 'rules',
  created_at timestamptz not null default clock_timestamp()
);

alter table public.follow_ups
  add column if not exists source text not null default 'manual',
  add column if not exists direction text check (direction in ('inbound','outbound')),
  add column if not exists email_message_id uuid references public.email_messages(id) on delete set null;
create unique index if not exists follow_ups_email_message_unique on public.follow_ups(email_message_id) where email_message_id is not null;

alter table public.email_messages enable row level security;
alter table public.communication_summaries enable row level security;
create policy email_messages_read_visible on public.email_messages for select to authenticated
  using (inquiry_id is null or exists(select 1 from public.inquiries i where i.id=inquiry_id));
create policy communication_summaries_read_visible on public.communication_summaries for select to authenticated
  using (exists(select 1 from public.inquiries i where i.id=inquiry_id));
grant select on public.email_messages, public.communication_summaries to authenticated;
grant all on public.email_messages, public.email_sync_cursors, public.communication_summaries to service_role;

alter table public.email_messages replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.email_messages;
exception when duplicate_object then null;
end $$;
