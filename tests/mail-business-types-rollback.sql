do $$
declare seller uuid; other_seller uuid; box uuid; address text; copied uuid; sent uuid; h text; q jsonb; month_start date:=date_trunc('month',timezone('Asia/Shanghai',now()))::date;
begin
 select p.id,p.email into seller,address from public.profiles p where p.active and p.role='sales' and not p.is_test_data and p.data_environment='production' and exists(select 1 from public.mailbox_connections b where b.user_id=p.id and b.mailbox_kind='personal') order by p.id limit 1;
 select id into other_seller from public.profiles where active and role='sales' and id<>seller and not is_test_data and data_environment='production' order by id limit 1;
 select id into box from public.mailbox_connections where user_id=seller and mailbox_kind='personal' limit 1;
 if seller is null or address is null or box is null or other_seller is null then raise exception 'fixture_missing';end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,sender_email,recipient_emails,cc_emails,received_at,association_status)
 values(box,'__SYNTH_BUSINESS_TYPES_ROLLBACK__',92310231801,'inbound','SYNTHETIC ONLY','Synthetic meeting follow-up','synthetic@sender.test',array['synthetic@recipient.test'],array[address],clock_timestamp(),'pending') returning id into copied;
 select private.sales_mail_type_hash(m) into h from public.email_messages m where m.id=copied;
 if (select private.sales_mail_participation(m) from public.email_messages m where m.id=copied)<>'copied' then raise exception 'copied_not_detected';end if;
 perform public.review_sales_mail_type(copied,h,'business_followup','合成商务跟进复核验证');
 q:=public.get_sales_mail_type_review_queue(seller,month_start,'human');
 if not exists(select 1 from jsonb_array_elements(q->'items') x where x->>'id'=copied::text and x->>'category'='business_followup' and x->>'participation'='copied') then raise exception 'queue_roundtrip';end if;
 begin perform public.review_sales_mail_type(copied,h,'outreach','合成拒绝抄送计开发信');raise exception 'copied_outreach_accepted';exception when others then if sqlerrm<>'outreach_requires_personal_sender' then raise;end if;end;
 perform public.review_sales_mail_type(copied,h,'project_materials','合成纠正项目资料往来');
 if (select count(*) from public.sales_mail_type_events where message_id=copied)<>2 then raise exception 'history_not_preserved';end if;
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,sender_email,recipient_emails,cc_emails,sent_at,association_status)
 values(box,'__SYNTH_BUSINESS_TYPES_ROLLBACK__',92310231802,'outbound','SYNTHETIC ONLY','Synthetic outreach',address,array['synthetic@recipient.test'],array[]::text[],clock_timestamp(),'pending') returning id into sent;
 select private.sales_mail_type_hash(m) into h from public.email_messages m where m.id=sent;
 perform public.review_sales_mail_type(sent,h,'outreach','合成本人发出开发信');
 q:=public.get_sales_mail_type_summary(month_start);
 if not exists(select 1 from jsonb_array_elements(q->'people') x where x->>'sales_id'=seller::text and (x->'confirmed'->>'project_materials')::int>=1) then raise exception 'new_type_summary';end if;
 perform set_config('request.jwt.claim.sub',other_seller::text,true);
 begin perform public.review_sales_mail_type(sent,h,'business_followup','合成跨人拒绝验证');raise exception 'cross_user_allowed';exception when others then if sqlerrm<>'forbidden' then raise;end if;end;
 if has_function_privilege('authenticated','private.sales_mail_participation(public.email_messages)','execute') then raise exception 'private_helper_exposed';end if;
end $$;
select 'PASS new types/save/correct/summary/copied/sender-only/history/cross-user; all synthetic rollback' as acceptance;
