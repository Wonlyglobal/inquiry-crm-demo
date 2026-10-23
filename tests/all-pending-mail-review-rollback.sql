do $$
declare seller uuid;other_seller uuid;box uuid;msg uuid;h text;ids uuid[]:='{}';q jsonb;base int;period date:=date_trunc('month',timezone('Asia/Shanghai',now()))::date;
begin
 select p.id,b.id into seller,box from public.profiles p join public.mailbox_connections b on b.user_id=p.id and b.mailbox_kind='personal' where p.active and p.role='sales' and not p.is_test_data and p.data_environment='production' order by p.id limit 1;
 select id into other_seller from public.profiles where active and role='sales' and id<>seller and not is_test_data and data_environment='production' limit 1;
 if seller is null or other_seller is null then raise exception 'fixture_missing';end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 base:=(public.get_sales_mail_type_review_queue(seller,period,'awaiting')->>'total')::int;
 for j in 1..5 loop
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,received_at,association_status)
 values(box,'__SYNTH_ALL_PENDING_ROLLBACK__',92310232000+j,'inbound','SYNTHETIC ONLY','Please quote doors',clock_timestamp(),'pending')returning id into msg;
 ids:=array_append(ids,msg);select private.sales_mail_type_hash(m)into h from public.email_messages m where m.id=msg;
 if j=2 then perform public.record_sales_mail_type(msg,h,'quotation_order','ai',0.9,'合成明确建议测试','Please quote','synthetic',seller);
 elsif j=3 then perform public.record_sales_mail_type(msg,h,'uncertain','failed',null,'合成分类失败测试','','synthetic',seller);
 elsif j=4 then perform public.review_sales_mail_type(msg,h,'uncertain','合成保留待确认测试');
 elsif j=5 then perform public.review_sales_mail_type(msg,h,'business_followup','合成明确人工分类测试');end if;
 end loop;
 q:=public.get_sales_mail_type_review_queue(seller,period,'awaiting');
 if (q->>'total')::int<>base+4 or not exists(select 1 from jsonb_array_elements(q->'items')x where x->>'id'=ids[1]::text) or exists(select 1 from jsonb_array_elements(q->'items')x where x->>'id'=ids[5]::text) then raise exception 'awaiting_filter_failed';end if;
 q:=public.get_sales_mail_type_review_queue(seller,period,'suggested');
 if not exists(select 1 from jsonb_array_elements(q->'items')x where x->>'id'=ids[2]::text) then raise exception 'suggested_filter_failed';end if;
 select private.sales_mail_type_hash(m)into h from public.email_messages m where m.id=ids[2];
 perform public.get_sales_mail_type_original(ids[2],h);
 if not exists(select 1 from public.audit_logs where entity_id=ids[2] and action='sales_mail_type_original_viewed')then raise exception 'original_audit_missing';end if;
 perform public.review_sales_mail_type(ids[2],h,'quotation_order','合成原文复核保存测试');
 q:=public.get_sales_mail_type_review_queue(seller,period,'awaiting');if(q->>'total')::int<>base+3 then raise exception 'saved_not_removed';end if;
 perform set_config('request.jwt.claim.sub',other_seller::text,true);
 begin perform public.get_sales_mail_type_review_queue(seller,period,'awaiting');raise exception 'cross_user_allowed';exception when others then if sqlerrm<>'forbidden' then raise;end if;end;
 if has_function_privilege('anon','public.get_sales_mail_type_review_queue(uuid,date,text,integer)','execute')or has_function_privilege('service_role','public.get_sales_mail_type_original(uuid,text)','execute')then raise exception 'acl_changed';end if;
end $$;
select 'PASS all awaiting/suggested/null/failed/human uncertain/save/audit/scope/ACL; all rolled back' as acceptance;
