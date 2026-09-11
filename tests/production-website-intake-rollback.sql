-- Run through `supabase db query --linked --file ...`.
-- Every write is enclosed in a transaction and rolled back at the end.
begin;

do $$
declare
  submission_key text := 'rollback-acceptance-' || replace(gen_random_uuid()::text, '-', '');
  payload jsonb;
  first_result jsonb;
  duplicate_result jsonb;
  inquiry_key uuid;
  touch_count integer;
  attempt_count integer;
  stored_channel text;
  stored_utm text;
begin
  payload := jsonb_build_object(
    'submission_id', submission_key,
    'email', 'rollback.acceptance@example.test',
    'name', 'Rollback Acceptance',
    'company', 'Rollback Acceptance Company',
    'country', 'Test',
    'product', 'Security Door',
    'quantity', '10',
    'message', 'Transactional intake acceptance test',
    'landing_page', 'https://www.wonlyglobal.com/security-doors',
    'referrer_url', 'https://www.google.com/',
    'utm_source', 'google',
    'utm_medium', 'cpc',
    'utm_campaign', 'rollback-acceptance',
    'utm_content', 'test-ad',
    'utm_term', 'security-door',
    'session_ref', 'rollback-session'
  );

  first_result := public.ingest_website_inquiry(payload);
  if first_result->>'status' <> 'completed' then
    raise exception '首次接入未完成: %', first_result;
  end if;
  inquiry_key := (first_result->>'inquiry_id')::uuid;

  duplicate_result := public.ingest_website_inquiry(payload);
  if duplicate_result->>'status' <> 'duplicate' then
    raise exception '重复提交未返回 duplicate: %', duplicate_result;
  end if;
  if (duplicate_result->>'inquiry_id')::uuid <> inquiry_key then
    raise exception '重复提交生成了不同 inquiry';
  end if;

  select count(*) into attempt_count
  from public.website_intake_attempts
  where event_key = submission_key and status = 'completed' and inquiry_id = inquiry_key;
  if attempt_count <> 1 then
    raise exception '接入尝试记录异常: %', attempt_count;
  end if;

  select count(*), max(channel), max(utm_source)
    into touch_count, stored_channel, stored_utm
  from public.inquiry_marketing_touches
  where inquiry_id = inquiry_key;
  if touch_count <> 1 or stored_channel <> 'google_ads' or stored_utm <> 'google' then
    raise exception 'UTM 归因异常: count=%, channel=%, source=%', touch_count, stored_channel, stored_utm;
  end if;
end;
$$;

rollback;
