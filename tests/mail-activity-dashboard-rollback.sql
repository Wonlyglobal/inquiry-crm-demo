do $$
declare seller uuid; box uuid; linked_inquiry uuid; msg uuid; msg2 uuid; h text; baseline jsonb; actual jsonb;
 period date:=date_trunc('month',timezone('Asia/Shanghai',now()))::date;
begin
 select p.id,b.id into seller,box from public.profiles p join public.mailbox_connections b on b.user_id=p.id and b.mailbox_kind='personal'
 where p.active and p.role='sales' and not p.is_test_data and p.data_environment='production' order by p.id limit 1;
 select id into linked_inquiry from public.inquiries where not is_test_data and data_environment='production' limit 1;
 if seller is null or linked_inquiry is null then raise exception 'fixture_missing';end if;
 perform set_config('request.jwt.claim.sub',seller::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 select x into baseline from jsonb_array_elements(public.get_sales_mail_type_summary(period)->'people') x where x->>'sales_id'=seller::text;
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,inquiry_id,received_at,association_status)
 values(box,'__SYNTH_ACTIVITY_ROLLBACK__',92310231901,'inbound','SYNTHETIC ONLY','Synthetic project followup',linked_inquiry,clock_timestamp(),'pending') returning id into msg;
 insert into public.email_messages(mailbox_connection_id,folder,uid,direction,subject,body_text,sent_at,association_status)
 values(box,'__SYNTH_ACTIVITY_ROLLBACK__',92310231902,'outbound','SYNTHETIC ONLY','Synthetic unclassified',clock_timestamp(),'pending') returning id into msg2;
 select private.sales_mail_type_hash(m) into h from public.email_messages m where m.id=msg;
 perform public.review_sales_mail_type(msg,h,'business_followup','合成看板分类关联对账');
 select x into actual from jsonb_array_elements(public.get_sales_mail_type_summary(period)->'people') x where x->>'sales_id'=seller::text;
 if (actual->>'total')::int<>(baseline->>'total')::int+2 or (actual->>'inbound')::int<>(baseline->>'inbound')::int+1
 or (actual->>'outbound')::int<>(baseline->>'outbound')::int+1 or (actual->>'linked')::int<>(baseline->>'linked')::int+1
 or (actual->>'confirmed_total')::int<>(baseline->>'confirmed_total')::int+1
 or (actual->>'awaiting_confirmation')::int<>(baseline->>'awaiting_confirmation')::int+1 then raise exception 'count_reconciliation_failed';end if;
 if (select sum((d->>'total')::int) from jsonb_array_elements(actual->'daily') d)<>(actual->>'total')::int then raise exception 'daily_failed';end if;
 perform public.review_sales_mail_type(msg,h,'uncertain','合成保留待人工确认验证');
 select x into actual from jsonb_array_elements(public.get_sales_mail_type_summary(period)->'people') x where x->>'sales_id'=seller::text;
 if (actual->>'confirmed_total')::int<>(baseline->>'confirmed_total')::int or (actual->>'awaiting_confirmation')::int<>(baseline->>'awaiting_confirmation')::int+2 then raise exception 'uncertain_not_pending';end if;
 update public.email_messages set body_text='Synthetic changed original' where id=msg;
 select x into actual from jsonb_array_elements(public.get_sales_mail_type_summary(period)->'people') x where x->>'sales_id'=seller::text;
 if (actual->>'pending')::int<>(baseline->>'pending')::int+2 then raise exception 'source_freshness_failed';end if;
 if exists(select 1 from jsonb_array_elements(public.get_sales_mail_type_summary(period)->'people') x where x->>'sales_id'<>seller::text) then raise exception 'self_scope_failed';end if;
 if has_function_privilege('anon','public.get_sales_mail_type_summary(date)','execute') then raise exception 'anonymous_allowed';end if;
 begin perform public.get_sales_mail_type_summary(period+1);raise exception 'bad_period_allowed';exception when others then if sqlerrm<>'invalid_period' then raise;end if;end;
end $$;
select 'PASS actual directions/links/classification/daily/uncertain/freshness/self/anonymous/period; transaction rolled back' as acceptance;
