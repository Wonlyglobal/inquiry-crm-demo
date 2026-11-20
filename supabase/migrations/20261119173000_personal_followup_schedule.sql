-- Read-only personal reminders; preserve original lead actions, conversion and audit.
begin;
create function public.personal_followup_schedule(target_phase text default 'prospect', target_range text default 'today', page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); now_at timestamptz:=clock_timestamp(); day_start timestamptz; end_at timestamptz; items jsonb; total integer;
begin
 if a.role<>'sales' then raise exception '仅业务员可查看本人跟进提醒';end if;
 if target_phase is null or target_phase not in('prospect','opportunity') or target_range is null or target_range not in('today','week') or page_offset is null or page_offset<0 or page_offset>100000 or page_offset%50<>0 then raise exception '提醒筛选或分页不正确';end if;
 day_start:=date_trunc('day',now_at at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
 end_at:=day_start+case when target_range='week' then interval '7 days' else interval '1 day' end;
 select count(*) into total from private.sales_leads l where l.sales_id=a.id and l.next_done_at is null and l.next_due_at<end_at and (target_phase='prospect' and l.inquiry_id is null or target_phase='opportunity' and exists(select 1 from public.inquiries i where i.id=l.inquiry_id and i.owner_id=a.id and i.archived_at is null and coalesce(i.is_test_data,false)=false and coalesce(i.data_environment,'production')='production' and i.status::text not in('won','lost')));
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'company',l.company,'contact',l.contact,'next_action',l.next_action,'next_due_at',l.next_due_at,'inquiry_id',l.inquiry_id,'overdue',l.next_due_at<day_start) order by l.next_due_at,l.id),'[]') into items from (select l.* from private.sales_leads l where l.sales_id=a.id and l.next_done_at is null and l.next_due_at<end_at and (target_phase='prospect' and l.inquiry_id is null or target_phase='opportunity' and exists(select 1 from public.inquiries i where i.id=l.inquiry_id and i.owner_id=a.id and i.archived_at is null and coalesce(i.is_test_data,false)=false and coalesce(i.data_environment,'production')='production' and i.status::text not in('won','lost'))) order by l.next_due_at,l.id limit 50 offset page_offset)l;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'personal_schedule_read',jsonb_build_object('phase',target_phase,'range',target_range,'offset',page_offset,'total',total));
 return jsonb_build_object('items',items,'total',total,'offset',page_offset,'limit',50,'as_of',now_at,'until',end_at);
end $$;
revoke all on function public.personal_followup_schedule(text,text,integer) from public,anon,service_role;
grant execute on function public.personal_followup_schedule(text,text,integer) to authenticated;
commit;
