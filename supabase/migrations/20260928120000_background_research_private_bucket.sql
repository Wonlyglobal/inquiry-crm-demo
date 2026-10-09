-- Private bucket for the business-only export of the background research system
-- (国家背调系统). No contacts are exported. Only the service role (agent-conversation)
-- reads it; no policies are granted to anon or authenticated users.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('background-research','background-research',false,10485760,array['application/json'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Rollback: delete from storage.objects where bucket_id='background-research'; delete from storage.buckets where id='background-research';
