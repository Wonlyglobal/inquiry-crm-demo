-- Allow catalogue page images (catalog-pages/cN_pNNN.jpg) in the private agent knowledge bucket.
-- Still private: served only through 10-minute signed links created by agent-conversation.
update storage.buckets set allowed_mime_types=array['application/json','image/jpeg'],file_size_limit=8388608 where id='agent-private-knowledge';
-- Rollback: update storage.buckets set allowed_mime_types=array['application/json'] where id='agent-private-knowledge';
