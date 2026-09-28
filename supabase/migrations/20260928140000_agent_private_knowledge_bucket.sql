-- Private bucket for curated internal knowledge read only by agent-conversation (service role).
-- First object: wonly-catalog-v1.json, the structured extract of the four 2026-08 overseas catalogues
-- (authorised by Chloe 2026-09-28). No policies are granted to anon or authenticated users, so the
-- file is never downloadable from the browser; Grace renders answers locally without external models.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('agent-private-knowledge','agent-private-knowledge',false,8388608,array['application/json'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Rollback: delete from storage.objects where bucket_id='agent-private-knowledge'; delete from storage.buckets where id='agent-private-knowledge';
