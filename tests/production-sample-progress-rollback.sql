begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  target_sample uuid:=gen_random_uuid();
  saved public.sample_shipments;
  blocked_message text;
  event_count integer;
begin
  select id into actor_id from public.profiles
  where active=true and role in ('owner','sales_manager')
  order by case when role='owner' then 0 else 1 end,id limit 1;
  select id into target_inquiry from public.inquiries order by created_at desc limit 1;
  if actor_id is null or target_inquiry is null then raise exception 'NO_SAMPLE_PROGRESS_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);

  insert into public.sample_shipments(id,inquiry_id,contents,quantity,created_by)
  values(target_sample,target_inquiry,'ROLLBACK SAMPLE',1,actor_id);
  begin
    perform public.update_sample_shipment_progress(
      target_sample,'shipped',null,null,clock_timestamp(),null,null,null,null,'回滚测试无发货凭证'
    );
    raise exception 'MISSING_SHIPPING_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='MISSING_SHIPPING_NOT_BLOCKED' or position('必须保留快递公司' in blocked_message)=0 then raise; end if;
  end;

  select * into saved from public.update_sample_shipment_progress(
    target_sample,'shipped','DHL','ROLLBACK-SAMPLE-TRACK',clock_timestamp(),clock_timestamp()+interval '3 days',null,null,null,'回滚测试样品已寄出'
  );
  select * into saved from public.update_sample_shipment_progress(
    target_sample,'delivered',saved.courier,saved.tracking_no,saved.shipped_at,saved.expected_arrival_at,clock_timestamp(),null,null,'回滚测试客户已签收'
  );
  begin
    perform public.update_sample_shipment_progress(
      target_sample,'feedback_received',saved.courier,saved.tracking_no,saved.shipped_at,saved.expected_arrival_at,saved.delivered_at,null,clock_timestamp(),'回滚测试空反馈'
    );
    raise exception 'MISSING_FEEDBACK_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='MISSING_FEEDBACK_NOT_BLOCKED' or position('必须保留客户反馈' in blocked_message)=0 then raise; end if;
  end;
  select * into saved from public.update_sample_shipment_progress(
    target_sample,'feedback_received',saved.courier,saved.tracking_no,saved.shipped_at,saved.expected_arrival_at,saved.delivered_at,'客户确认样品合格',clock_timestamp(),'回滚测试收到客户反馈'
  );
  select * into saved from public.update_sample_shipment_progress(
    target_sample,'closed',saved.courier,saved.tracking_no,saved.shipped_at,saved.expected_arrival_at,saved.delivered_at,saved.customer_feedback,saved.feedback_at,'回滚测试完成样品跟踪'
  );
  select count(*) into event_count from public.sample_shipment_events where sample_id=target_sample;
  if saved.status<>'closed' or event_count<>5 then raise exception 'SAMPLE_TIMELINE_INCOMPLETE'; end if;
end;
$$;
select 'PASS — sample shipment, delivery, feedback and five-step timeline verified; all writes will be rolled back' as production_regression;
rollback;
