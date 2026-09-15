begin;
do $$
declare
  actor_id uuid;
  target_inquiry uuid;
  saved_follow_up uuid;
  blocked_message text;
begin
  select i.owner_id,i.id into actor_id,target_inquiry
  from public.inquiries i
  join public.profiles p on p.id=i.owner_id and p.active=true
  where i.validity='valid'
    and i.first_valid_contact_at is null
    and i.status not in ('won','lost')
    and p.role in ('owner','sales_manager','sales')
  order by i.created_at
  limit 1;
  if actor_id is null then raise exception 'NO_FIRST_CONTACT_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);

  begin
    update public.inquiries
    set first_valid_contact_at=clock_timestamp(),updated_by=actor_id
    where id=target_inquiry;
    raise exception 'DIRECT_FIRST_CONTACT_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='DIRECT_FIRST_CONTACT_NOT_BLOCKED'
       or position('必须通过带跟进记录的服务端流程' in blocked_message)=0 then raise; end if;
  end;

  select public.record_inquiry_followup_v2(
    target_inquiry,'phone','生产回滚验证：已完成可核验的首次有效联系',null,
    clock_timestamp()+interval '1 day',true,'normal',null
  ) into saved_follow_up;
  if not exists(
    select 1 from public.inquiries i
    join public.follow_ups f on f.id=saved_follow_up and f.inquiry_id=i.id
    where i.id=target_inquiry and i.first_valid_contact_at is not null
      and f.is_first_valid_contact=true and f.author_id=actor_id
  ) then raise exception 'AUTHORIZED_FIRST_CONTACT_NOT_PERSISTED'; end if;

  begin
    update public.inquiries set first_valid_contact_at=null where id=target_inquiry;
    raise exception 'FIRST_CONTACT_REWRITE_NOT_BLOCKED';
  exception when others then
    blocked_message:=sqlerrm;
    if blocked_message='FIRST_CONTACT_REWRITE_NOT_BLOCKED'
       or position('不能清空或改写' in blocked_message)=0 then raise; end if;
  end;
end;
$$;
select 'PASS — direct KPI forgery blocked, authorized evidence persisted, rewrite blocked; all writes will be rolled back' as production_regression;
rollback;
