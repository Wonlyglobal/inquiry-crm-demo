-- Appended to candidate DDL within a single transaction. Synthetic only; ALWAYS rollback.
do $$
declare boss uuid; seller uuid; other_seller uuid; box uuid; ids uuid[]:='{}'; msg uuid; h text; base_n integer; q jsonb; i integer; original jsonb;
begin
 select id into boss from public.profiles where active and role='owner' and not is_test_data and data_environment='production' order by id limit 1;
 select p.id into seller from public.profiles p where p.active and p.role='sales' and not p.is_test_data and p.data_environment='production' and exists(select 1 from public.mailbox_connections b where b.user_id=p.id and b.mailbox_kind='personal') order by p.id limit 1;
 select id into other_seller from public.profiles where active and role='sales' and id<>seller and not is_test_data and data_environment='production' order by id limit 1;
 select id into box from public.mailbox_connections where user_id=seller and mailbox_kind='personal' limit 1;
 if boss is null or seller is null or other_seller is null or box is null then raise exception 'missing_fixture'; end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 base_n:=(public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date)->>'total')::int;
 for i in 1..53 loop
  insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,received_at,association_status)
  values(box,'__SYNTH_REVIEW_ROLLBACK__',92310231600+i,'inbound','SYNTHETIC REVIEW ONLY','Please quote synthetic doors',clock_timestamp(),'pending') returning id into msg;
  ids:=array_append(ids,msg);select private.sales_mail_type_hash(m) into h from public.email_messages m where m.id=msg;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.record_sales_mail_type(msg,h,case when i=53 then 'quotation_order' else 'uncertain' end,case when i<=51 then 'skipped' else 'ai' end,case when i>51 then 0.8 end,'合成复核队列验证，不是真实邮件',case when i>51 then 'Please quote' else '' end,'synthetic-no-api',boss);
 end loop;
 perform set_config('request.jwt.claim.role','authenticated',true);
 q:=public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date);
 if (q->>'total')::int<>base_n+52 or jsonb_array_length(q->'items')<>50 then raise exception 'filter_total_paging_failed'; end if;
 if (select count(*) from jsonb_array_elements(q->'items') x where (x->>'id')::uuid=any(ids))<>50 then raise exception 'stable_first_page_failed'; end if;
 q:=public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date,'review',50);
 if (select count(*) from jsonb_array_elements(q->'items') x where (x->>'id')::uuid=any(ids))<>2 then raise exception 'second_page_lost'; end if;
 select private.sales_mail_type_hash(m) into h from public.email_messages m where id=ids[1];
 original:=public.get_sales_mail_type_original(ids[1],h);
 if original->>'body_text'<>'Please quote synthetic doors' then raise exception 'original_failed'; end if;
 if not exists(select 1 from public.audit_logs where entity_id=ids[1] and action='sales_mail_type_original_viewed' and actor_id=seller) then raise exception 'read_audit_missing'; end if;
 perform public.review_sales_mail_type(ids[1],h,'quotation_order','合成原文核对后确认');
 q:=public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date,'human');
 if not exists(select 1 from jsonb_array_elements(q->'items') x where x->>'id'=ids[1]::text and x->>'category'='quotation_order') then raise exception 'saved_human_not_read'; end if;
 perform public.review_sales_mail_type(ids[1],h,'new_inquiry','合成纠正分类保留历史');
 if (select count(*) from public.sales_mail_type_events where message_id=ids[1])<>3 then raise exception 'history_lost'; end if;
 if (public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date)->>'total')::int<>base_n+51 then raise exception 'confirmed_not_removed'; end if;
 begin perform public.get_sales_mail_type_original(ids[1],'stale');raise exception 'stale_accepted';exception when others then if sqlerrm<>'source_changed' then raise; end if;end;
 perform set_config('request.jwt.claim.sub',other_seller::text,true);
 begin perform public.get_sales_mail_type_original(ids[1],h);raise exception 'other_original_accepted';exception when others then if sqlerrm<>'forbidden' then raise; end if;end;
 begin perform public.get_sales_mail_type_review_queue(seller,date_trunc('month',timezone('Asia/Shanghai',now()))::date);raise exception 'other_queue_accepted';exception when others then if sqlerrm<>'forbidden' then raise; end if;end;
 perform set_config('request.jwt.claim.sub',seller::text,true);
 begin perform public.get_sales_mail_type_review_queue(seller,current_date,'invalid');raise exception 'bad_filter_accepted';exception when others then if sqlerrm<>'invalid_filter_or_period' then raise; end if;end;
 if has_function_privilege('anon','public.get_sales_mail_type_original(uuid,text)','execute') or has_function_privilege('anon','public.get_sales_mail_type_review_queue(uuid,date,text,integer)','execute') then raise exception 'anon_acl'; end if;
end $$;
select 'PASS queue filter/page/save/correct/history/original/audit/stale/cross-user/ACL; synthetic rollback' as acceptance;
