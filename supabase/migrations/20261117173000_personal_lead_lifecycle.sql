-- Personal workflow only. Keep period statistics, source, recorded times and CRM visibility unchanged.
begin;
alter table private.sales_leads add column next_action text, add column next_due_at timestamptz, add column next_done_at timestamptz;
create index sales_lead_action_due on private.sales_leads(sales_id,next_due_at) where next_due_at is not null and next_done_at is null;
create index sales_lead_history_target on private.sales_lead_events(target_id,at desc,id desc);
create unique index sales_lead_activity_request on private.sales_lead_events(actor_id,(details->>'request_id')) where action='progress_updated' and details ? 'request_id';
create function private.personal_lead_json(l private.sales_leads) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'sales_id',l.sales_id,'company',l.company,'contact',l.contact,'country',l.country,'email',l.email,'phone',l.phone,'source',l.source,'demand',l.demand,'acquired_on',l.acquired_on,'recorded_at',l.recorded_at,'recorded_on',l.recorded_on,'method',l.method,'inquiry_id',l.inquiry_id,'converted_at',l.converted_at,'progress_note',l.progress_note,'progress_at',l.progress_at,'estimated_amount',case when l.inquiry_id is null then l.estimated_amount else i.estimated_amount end,'currency',case when l.inquiry_id is null then l.currency else i.currency end,'stage',i.status,'next_action',l.next_action,'next_due_at',l.next_due_at,'next_done_at',l.next_done_at,'activity_count',(select count(*) from private.sales_lead_events e where e.target_id=l.id and e.actor_id=l.sales_id and e.action='progress_updated'))
 from (select 1) x left join public.inquiries i on i.id=l.inquiry_id and i.owner_id=l.sales_id
$$;
revoke all on function private.personal_lead_json(private.sales_leads) from public,anon,authenticated,service_role;
create function public.personal_sales_lead_list(search_text text default '',lead_state text default 'pending',page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); items jsonb; total integer; due integer;
begin
 if a.role<>'sales' then raise exception '仅业务员可查看本人历史线索';end if;
 if search_text is null or length(search_text)>300 or lead_state is null or lead_state not in('all','pending','converted','due') or page_offset is null or page_offset<0 or page_offset>100000 or page_offset%50<>0 then raise exception '筛选或分页参数不正确';end if;
 select count(*) into due from private.sales_leads l where l.sales_id=a.id and l.next_due_at<=clock_timestamp() and l.next_done_at is null;
 select count(*) into total from private.sales_leads l where l.sales_id=a.id and (lead_state='all' or lead_state='pending' and l.inquiry_id is null or lead_state='converted' and l.inquiry_id is not null or lead_state='due' and l.next_due_at<=clock_timestamp() and l.next_done_at is null) and (btrim(search_text)='' or strpos(lower(concat_ws(' ',l.company,l.contact,l.country,l.email,l.phone,l.demand)),lower(btrim(search_text)))>0);
 select coalesce(jsonb_agg(private.personal_lead_json(l) order by l.recorded_at desc,l.id desc),'[]') into items from (select * from private.sales_leads l where l.sales_id=a.id and (lead_state='all' or lead_state='pending' and l.inquiry_id is null or lead_state='converted' and l.inquiry_id is not null or lead_state='due' and l.next_due_at<=clock_timestamp() and l.next_done_at is null) and (btrim(search_text)='' or strpos(lower(concat_ws(' ',l.company,l.contact,l.country,l.email,l.phone,l.demand)),lower(btrim(search_text)))>0) order by l.recorded_at desc,l.id desc limit 50 offset page_offset) l;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'personal_list_read',jsonb_build_object('state',lead_state,'offset',page_offset,'total',total));
 return jsonb_build_object('items',items,'total',total,'offset',page_offset,'limit',50,'due',due,'as_of',clock_timestamp());
end $$;
create function public.personal_sales_lead_detail(target_id uuid,history_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; history jsonb; total integer;
begin
 if a.role<>'sales' then raise exception '仅业务员可查看本人线索跟进';end if;
 if history_offset is null or history_offset<0 or history_offset>100000 or history_offset%50<>0 then raise exception '历史分页参数不正确';end if;
 select * into l from private.sales_leads where id=target_id and sales_id=a.id;if l.id is null then raise exception '线索不存在或不属于本人';end if;
 select count(*) into total from private.sales_lead_events e where e.target_id=l.id and e.actor_id=a.id and e.action='progress_updated';
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'at',e.at,'note',e.details->>'note','next_action',e.details->>'next_action','next_due_at',e.details->>'next_due_at','next_done_at',e.details->>'next_done_at') order by e.at desc,e.id desc),'[]') into history from (select * from private.sales_lead_events h where h.target_id=l.id and h.actor_id=a.id and h.action='progress_updated' order by h.at desc,h.id desc limit 50 offset history_offset)e;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'personal_detail_read',jsonb_build_object('offset',history_offset));
 return jsonb_build_object('lead',private.personal_lead_json(l),'history',history,'history_total',total,'offset',history_offset,'as_of',clock_timestamp());
end $$;
create function public.record_personal_lead_activity(target_id uuid,request_id uuid,note text,next_action text default '',next_due_at timestamptz default null,action_done boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; existing private.sales_lead_events; now_at timestamptz:=clock_timestamp(); payload jsonb;
begin
 if a.role<>'sales' or request_id is null or length(btrim(coalesce(note,''))) not between 4 and 2000 or next_action is null or length(btrim(next_action))>1000 or action_done is null then raise exception '请填写4—2000字跟进摘要，下一步行动最多1000字';end if;
 if (nullif(btrim(next_action),'') is null)<>(next_due_at is null) or action_done and next_due_at is null or next_due_at is not null and (not isfinite(next_due_at) or next_due_at<now_at-interval '10 years' or next_due_at>now_at+interval '10 years') then raise exception '下一步行动和北京时间截止需同时填写，日期需在10年范围内';end if;
 payload:=jsonb_build_object('request_id',request_id,'note',btrim(note),'next_action',nullif(btrim(next_action),''),'next_due_at',next_due_at,'action_done',action_done);
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
 select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;if l.id is null then raise exception '线索不存在或不属于本人';end if;
 select * into existing from private.sales_lead_events e where e.actor_id=a.id and e.action='progress_updated' and e.details->>'request_id'=request_id::text;
 if existing.id is not null then if existing.target_id<>target_id or existing.details-'next_done_at'<>payload then raise exception '重试内容已变化，请刷新核对';end if;return jsonb_build_object('id',l.id,'deduplicated',true);end if;
 update private.sales_leads set progress_note=btrim(note),progress_at=now_at,next_action=nullif(btrim(record_personal_lead_activity.next_action),''),next_due_at=record_personal_lead_activity.next_due_at,next_done_at=case when action_done then now_at end where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'progress_updated',payload||jsonb_build_object('next_done_at',case when action_done then now_at end));
 return jsonb_build_object('id',l.id,'saved_at',now_at,'deduplicated',false);
end $$;
create function public.correct_personal_sales_lead(target_id uuid,expected jsonb,changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); l private.sales_leads; before_data jsonb; after_data jsonb; fp text;
begin
 if a.role<>'sales' or expected is null or changes is null or jsonb_typeof(changes)<>'object' or jsonb_typeof(expected)<>'object' or exists(select 1 from jsonb_each(changes) v where jsonb_typeof(v.value)<>'string') or exists(select 1 from jsonb_object_keys(changes) k where k not in('company','contact','country','demand')) then raise exception '仅允许本人修订客户名称、联系人、国家和需求';end if;
 after_data:=jsonb_build_object('company',btrim(coalesce(changes->>'company','')),'contact',btrim(coalesce(changes->>'contact','')),'country',btrim(coalesce(changes->>'country','')),'demand',btrim(coalesce(changes->>'demand','')));
 if length(after_data->>'company')>300 or length(after_data->>'contact')>200 or length(after_data->>'company')+length(after_data->>'contact')=0 or length(after_data->>'country') not between 1 and 300 or length(after_data->>'demand') not between 4 and 10000 then raise exception '请补齐客户/联系人、国家与4—10000字需求';end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));select * into l from private.sales_leads where id=target_id and sales_id=a.id for update;
 if l.id is null or l.inquiry_id is not null then raise exception '仅可修订本人未转化线索，商机资料请在商机内维护';end if;
 before_data:=jsonb_build_object('company',l.company,'contact',l.contact,'country',l.country,'demand',l.demand);
 if before_data<>expected then raise exception '资料已被修改，请刷新后核对，未覆盖其他修改';end if;
 fp:=md5(lower(concat_ws('|',after_data->>'company',after_data->>'contact',l.email,regexp_replace(l.phone,'[^0-9+]','','g'),after_data->>'demand',l.acquired_on::text)));
 if exists(select 1 from private.sales_leads x where x.sales_id=a.id and x.id<>l.id and (x.fingerprint=fp or md5(lower(concat_ws('|',btrim(x.company),btrim(x.contact),btrim(x.email),regexp_replace(x.phone,'[^0-9+]','','g'),btrim(x.demand),x.acquired_on::text)))=fp)) then raise exception '修订后与已有线索重复，请先核对已有记录';end if;
 update private.sales_leads set company=after_data->>'company',contact=after_data->>'contact',country=after_data->>'country',demand=after_data->>'demand' where id=l.id;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,l.id,'profile_corrected',jsonb_build_object('before',before_data,'after',after_data));
 return jsonb_build_object('id',l.id,'recorded_at',l.recorded_at);
end $$;
create function public.personal_sales_lead_for_inquiry(target_inquiry uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); result uuid;
begin
 if a.role<>'sales' then raise exception '仅业务员可读取本人商机的关联线索';end if;
 select l.id into result from private.sales_leads l join public.inquiries i on i.id=l.inquiry_id and i.owner_id=a.id where l.sales_id=a.id and l.inquiry_id=target_inquiry order by l.recorded_at,l.id limit 1;
 return result;
end $$;
revoke all on function public.personal_sales_lead_for_inquiry(uuid) from public,anon,service_role;
grant execute on function public.personal_sales_lead_for_inquiry(uuid) to authenticated;
revoke all on function public.personal_sales_lead_list(text,text,integer),public.personal_sales_lead_detail(uuid,integer),public.record_personal_lead_activity(uuid,uuid,text,text,timestamptz,boolean),public.correct_personal_sales_lead(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.personal_sales_lead_list(text,text,integer),public.personal_sales_lead_detail(uuid,integer),public.record_personal_lead_activity(uuid,uuid,text,text,timestamptz,boolean),public.correct_personal_sales_lead(uuid,jsonb,jsonb) to authenticated;
commit;
