insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-attachments','email-attachments',false,10485760,null)
on conflict (id) do update set public=false,file_size_limit=10485760;

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  file_name text not null,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 10485760),
  storage_path text not null unique,
  content_id text,
  inline boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists email_attachments_message_idx on public.email_attachments(email_message_id);
alter table public.email_attachments enable row level security;
drop policy if exists email_attachments_read_visible on public.email_attachments;
create policy email_attachments_read_visible on public.email_attachments for select to authenticated
  using (exists(select 1 from public.email_messages m where m.id=email_message_id));
drop policy if exists email_attachment_objects_read_visible on storage.objects;
create policy email_attachment_objects_read_visible on storage.objects for select to authenticated
  using (bucket_id='email-attachments' and exists(
    select 1 from public.email_attachments a
    join public.email_messages m on m.id=a.email_message_id
    where a.storage_path=name
  ));
grant select on public.email_attachments to authenticated;
grant all on public.email_attachments to service_role;
