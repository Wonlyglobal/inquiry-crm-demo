-- Run after migration inside the SAME transaction; synthetic email only, always rollback.
do $$
declare boss uuid; seller uuid; other_seller uuid; box uuid; msg uuid; h text; event uuid; counts jsonb; n integer;
begin
 select id into boss from public.profiles where active and role='owner' order by id limit 1;
 select p.id into seller from public.profiles p where p.active and p.role='sales' and exists(select 1 from public.mailbox_connections b where b.user_id=p.id and b.mailbox_kind='personal') order by p.id limit 1;
 select id into other_seller from public.profiles where active and role='sales' and id<>seller order by id limit 1;
 if boss is null or seller is null or other_seller is null then raise exception 'missing_roles'; end if;
 -- Existing connection metadata is not read or modified; only its ID is used for an isolated synthetic message.
 select id into box from public.mailbox_connections where user_id=seller and mailbox_kind='personal' limit 1;
 if box is null then raise exception 'missing_personal_mailbox_fixture'; end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,received_at,association_status)
 values(box,'__CRM_SYNTHETIC_ROLLBACK_ONLY__',92310231230,'inbound','SYNTHETIC ONLY','Please quote steel doors',clock_timestamp(),'pending') returning id into msg;
 select private.sales_mail_type_hash(m) into h from public.email_messages m where id=msg;
 event:=public.record_sales_mail_type(msg,h,'quotation_order','ai',0.8,'合成类型验证，不是真实客户','Please quote','synthetic-no-api',boss);
 if event is null then raise exception 'save_failed'; end if;
 if public.record_sales_mail_type(msg,h,'quotation_order','ai',0.8,'合成重复验证，不是真实客户','Please quote','synthetic-no-api',boss) is not null then raise exception 'dedup_failed'; end if;
 begin perform public.record_sales_mail_type(msg,h,'quotation_order','ai',0.8,'错误证据合成验证','made up','synthetic-no-api',boss);raise exception 'bad_evidence_accepted';exception when others then if sqlerrm<>'invalid_evidence' then raise; end if; end;
 begin perform public.record_sales_mail_type(msg,h,'quotation_order','ai',0.8,'跨人权限合成验证','Please quote','synthetic-no-api',other_seller);raise exception 'cross_scope_accepted';exception when others then if sqlerrm<>'forbidden' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if not exists(select 1 from jsonb_array_elements(public.get_sales_mail_type_workspace(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date)) x where x->>'id'=msg::text) then raise exception 'roundtrip_failed'; end if;
 perform public.review_sales_mail_type(msg,h,'new_inquiry','合成原文人工确认验证');
 if not exists(select 1 from jsonb_array_elements(public.get_sales_mail_type_workspace(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date)) x where x->>'id'=msg::text and x->>'method'='human' and x->>'category'='new_inquiry') then raise exception 'human_priority_failed'; end if;
 counts:=public.get_sales_mail_type_summary(date_trunc('month',timezone('Asia/Shanghai',now()))::date);
 if jsonb_array_length(counts->'people')<>1 then raise exception 'sales_aggregate_scope_failed'; end if;
 if (counts->'people'->0->'confirmed'->>'new_inquiry')::int<1 then raise exception 'human_count_missing'; end if;
 begin perform public.review_sales_mail_type(msg,'bad_hash','new_inquiry','合成陈旧版本拒绝验证');raise exception 'stale_accepted';exception when others then if sqlerrm<>'source_changed' then raise; end if; end;
 begin update public.sales_mail_type_events set reason='bad' where id=event;raise exception 'history_changed';exception when others then if sqlerrm<>'邮件分类历史仅追加，不允许覆盖或删除' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',other_seller::text,true);
 begin perform public.get_sales_mail_type_workspace(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date);raise exception 'other_sales_read';exception when others then if sqlerrm<>'forbidden' then raise; end if; end;
 if has_function_privilege('anon','public.get_sales_mail_type_summary(date)','EXECUTE') or has_function_privilege('authenticated','public.record_sales_mail_type(uuid,text,text,text,numeric,text,text,text,uuid)','EXECUTE') or has_table_privilege('authenticated','public.sales_mail_type_events','INSERT') then raise exception 'bad_acl'; end if;
end $$;
select 'PASS synthetic classification save/read/dedup/human-priority/freshness/scope/audit-immutability/ACL; all writes roll back' as acceptance;
