-- Synthetic data only. Execute within a transaction and roll back.
begin;
do $$
declare
  run_id text := gen_random_uuid()::text;
  result jsonb;
  payload jsonb;
  inquiry_key uuid;
  buyer_id uuid;
  linked_id uuid;
  contact_key uuid;
begin
  payload := jsonb_build_object('submission_id','webform-identity-'||run_id,'email','acceptance-'||run_id||'@example.test','name','Synthetic Acceptance','company','Web3Forms','message','Synthetic rollback acceptance only');
  result := public.ingest_website_inquiry(payload);
  if result->>'status' <> 'completed' then raise exception 'provider intake failed: %',result; end if;
  inquiry_key := (result->>'inquiry_id')::uuid;
  if exists(select 1 from public.inquiries where id=inquiry_key and (company_id is not null or contact_id is not null)) then raise exception 'provider became customer identity'; end if;
  result := public.ingest_website_inquiry(payload);
  if result->>'status' <> 'duplicate' then raise exception 'idempotency failed'; end if;

  payload := payload || jsonb_build_object('submission_id','webform-body-'||run_id,'company','Synthetic Buyer '||run_id,'company_website','https://buyer-'||run_id||'.example.test');
  result := public.ingest_website_inquiry(payload);
  if result->>'status' <> 'completed' then raise exception 'body company intake failed: %',result; end if;
  select company_id,contact_id into buyer_id,contact_key from public.inquiries where id=(result->>'inquiry_id')::uuid;
  if buyer_id is null or contact_key is null then raise exception 'explicit identity missing'; end if;
  if not exists(select 1 from public.companies where id=buyer_id and name='Synthetic Buyer '||run_id and domain='buyer-'||run_id||'.example.test') then raise exception 'explicit body fields not retained'; end if;

  payload := payload || jsonb_build_object('submission_id','webform-other-'||run_id,'company','Synthetic Other Buyer '||run_id,'company_website','https://other-'||run_id||'.example.test');
  result := public.ingest_website_inquiry(payload);
  if result->>'status' <> 'completed' then raise exception 'other company intake failed: %',result; end if;
  select company_id into linked_id from public.inquiries where id=(result->>'inquiry_id')::uuid;
  if linked_id is null or linked_id=buyer_id then raise exception 'email reused unrelated company'; end if;
end;
$$;
select 'webform_identity_rollback_passed' as result;
rollback;
