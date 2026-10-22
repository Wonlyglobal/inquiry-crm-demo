-- Append after the migration's DDL in the SAME transaction, replacing COMMIT with this file.
-- All synthetic records and new tables are rolled back. Never run standalone.
do $$
declare actor uuid; result jsonb; payload jsonb; rid uuid:=gen_random_uuid();
begin
 select u.id into strict actor from auth.users u join public.profiles p on p.id=u.id where lower(u.email)='chloelee@wonlyglobal.com' and p.active is true;
 if has_table_privilege('anon','public.business_public_companies','SELECT') or has_table_privilege('authenticated','public.business_public_companies','INSERT') or has_table_privilege('authenticated','public.business_public_research_versions','UPDATE') then raise exception 'privilege_leak'; end if;
 if has_function_privilege('anon','public.save_business_public_research(uuid,text,jsonb,integer,uuid)','EXECUTE') then raise exception 'rpc_leak'; end if;
 payload:='{"company":"SYNTHETIC ROLLBACK ONLY","domain":"synthetic-business-test.invalid","country":"Test","facts":[{"field":"profile","value":"Synthetic public fixture","source_url":"https://synthetic-business-test.invalid/about","accessed_at":"2026-10-22","event_date":null,"verification":"official_self_report"}]}'::jsonb;
 begin
  perform public.save_business_public_research(gen_random_uuid(),'synthetic-business-test.invalid',payload,0,rid);
  raise exception 'unauthorized_actor_accepted';
 exception when others then if sqlerrm<>'business_owner_required' then raise; end if; end;
 result:=public.save_business_public_research(actor,'synthetic-business-test.invalid',payload,0,rid);
 if result->>'status'<>'created' or result->>'version'<>'1' then raise exception 'create_failed'; end if;
 result:=public.save_business_public_research(actor,'synthetic-business-test.invalid',payload,0,rid);
 if result->>'status'<>'replayed' then raise exception 'replay_failed'; end if;
 begin
  perform public.save_business_public_research(actor,'synthetic-business-test.invalid',payload||'{"country":"Changed"}'::jsonb,0,rid);
  raise exception 'request_conflict_accepted';
 exception when others then if sqlerrm<>'idempotency_conflict' then raise; end if; end;
 begin
  perform public.save_business_public_research(actor,'synthetic-business-test.invalid',payload,0,gen_random_uuid());
  raise exception 'stale_version_accepted';
 exception when others then if sqlerrm<>'version_conflict' then raise; end if; end;
 begin
  perform public.save_business_public_research(actor,'synthetic-business-test.invalid',jsonb_set(payload,'{facts}','[{"field":"profile","value":"Replacement"}]'),1,gen_random_uuid());
  raise exception 'history_erasure_accepted';
 exception when others then if sqlerrm<>'historical_evidence_must_be_retained' then raise; end if; end;
 result:=public.save_business_public_research(actor,'synthetic-business-test.invalid',payload,1,gen_random_uuid());
 if result->>'status'<>'unchanged' then raise exception 'no_change_failed'; end if;
 payload:=jsonb_set(payload,'{facts}',(payload->'facts')||'[{"field":"profile","value":"Additional fixture"}]'::jsonb);
 result:=public.save_business_public_research(actor,'synthetic-business-test.invalid',payload,1,gen_random_uuid());
 if result->>'version'<>'2' then raise exception 'append_failed'; end if;
 if (select count(*) from public.business_public_research_versions where domain='synthetic-business-test.invalid')<>2 then raise exception 'version_count_failed'; end if;
end $$;
rollback;
