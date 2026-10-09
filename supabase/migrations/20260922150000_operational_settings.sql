begin;
create table private.crm_assignment_preferences (
 profile_id uuid primary key references public.profiles(id),
 paused boolean not null default false,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table private.crm_followup_preferences (
 profile_id uuid primary key references public.profiles(id),
 interval_days integer not null check(interval_days between 1 and 90),
 reminder_minutes integer not null check(reminder_minutes between 0 and 1440),
 priority text not null check(priority in ('low','normal','high'))
);
revoke all on private.crm_assignment_preferences,private.crm_followup_preferences from public,anon,authenticated;
alter table private.crm_assignment_preferences enable row level security;
alter table private.crm_followup_preferences enable row level security;
create function public.get_crm_operational_settings()
returns table(profile_id uuid,full_name text,role text,team text,sales_region text,paused boolean,revision integer,can_edit boolean,last_synced_at timestamptz,last_tested_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles a where a.id=auth.uid() and a.active and not a.is_test_data and a.data_environment='production' and a.role in ('owner','sales_manager','marketing')) then raise exception '无权查看业务设置'; end if;
 return query select p.id,p.full_name::text,p.role::text,p.team::text,
 coalesce((select string_agg(distinct t.sales_region,'、' order by t.sales_region) from public.sales_target_people t where t.profile_id=p.id),''),
 coalesce(s.paused,false),coalesce(s.revision,0),
 p.active and p.role='sales' and ((select a.role='owner' from public.profiles a where a.id=auth.uid()) or private.crm_manager_covers_user(auth.uid(),p.id)),
 m.last_synced_at,m.last_tested_at
 from public.profiles p left join private.crm_assignment_preferences s on s.profile_id=p.id
 left join public.mailbox_connections m on m.user_id=p.id and m.mailbox_kind='personal'
 where not p.is_test_data and p.data_environment='production' order by p.full_name,p.id;
end $$;
create function public.save_crm_assignment_settings(target_profile uuid,target_region text,target_paused boolean,expected_revision integer,change_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; a public.profiles; old_region text; actual_revision integer; old_paused boolean; mappings integer;
begin
 select * into a from public.profiles where id=auth.uid();
 if a.id is null or not a.active or a.is_test_data or a.data_environment<>'production' or a.role not in ('owner','sales_manager') then raise exception '无权修改分配设置'; end if;
 select * into p from public.profiles where id=target_profile for update;
 if p.id is null or not p.active or p.role<>'sales' or p.is_test_data or p.data_environment<>'production' or not (a.role='owner' or private.crm_manager_covers_user(a.id,p.id)) then raise exception '只能修改管理范围内的在职业务员'; end if;
 if target_region is null or target_region not in ('中东非大区','中东非大区-中东','中东非大区-非洲','中亚大区','美洲大区','欧洲大区','东南亚大区-东南亚','东南亚大区-南亚') then raise exception '请选择有效负责区域'; end if;
 if target_paused is null or expected_revision is null or length(btrim(coalesce(change_reason,''))) not between 3 and 500 then raise exception '请填写3至500字修改原因'; end if;
 select coalesce(s.revision,0),coalesce(s.paused,false) into actual_revision,old_paused from public.profiles x left join private.crm_assignment_preferences s on s.profile_id=x.id where x.id=p.id;
 if actual_revision<>expected_revision then raise exception '设置已被他人更新，请刷新后重试'; end if;
 select count(*),min(t.sales_region) into mappings,old_region from public.sales_target_people t where t.profile_id=p.id;
 if mappings>1 then raise exception '成员存在多条区域档案，请管理员先核对'; end if;
 if mappings=0 then
 insert into public.sales_target_people(display_name,profile_id,department,sales_region,job_title) values(p.full_name,p.id,coalesce(p.team,''),target_region,p.job_title);
 else update public.sales_target_people set sales_region=target_region where profile_id=p.id; end if;
 insert into private.crm_assignment_preferences(profile_id,paused,revision) values(p.id,target_paused,actual_revision+1)
 on conflict(profile_id) do update set paused=excluded.paused,revision=excluded.revision,updated_at=now();
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data) values(a.id,'profile',p.id,'assignment_settings',btrim(change_reason),jsonb_build_object('region',old_region,'paused',old_paused,'revision',actual_revision),jsonb_build_object('region',target_region,'paused',target_paused,'revision',actual_revision+1));
end $$;
create function public.get_my_followup_preferences() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.is_test_data and p.data_environment='production') then raise exception '请使用有效账号'; end if;
 return coalesce((select jsonb_build_object('interval_days',interval_days,'reminder_minutes',reminder_minutes,'priority',priority) from private.crm_followup_preferences where profile_id=auth.uid()),jsonb_build_object('interval_days',3,'reminder_minutes',30,'priority','normal'));
end $$;
create function public.save_my_followup_preferences(target_days integer,target_minutes integer,target_priority text) returns void
language plpgsql security definer set search_path='' as $$
declare before_state jsonb;
begin
 before_state:=public.get_my_followup_preferences();
 if target_days is null or target_days not between 1 and 90 or target_minutes is null or target_minutes not between 0 and 1440 or target_priority is null or target_priority not in ('low','normal','high') then raise exception '跟进设置超出有效范围'; end if;
 insert into private.crm_followup_preferences values(auth.uid(),target_days,target_minutes,target_priority)
 on conflict(profile_id) do update set interval_days=excluded.interval_days,reminder_minutes=excluded.reminder_minutes,priority=excluded.priority;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data) values(auth.uid(),'profile',auth.uid(),'followup_preferences','本人修改新建跟进默认值',before_state,public.get_my_followup_preferences());
end $$;
revoke all on function public.get_crm_operational_settings(),public.save_crm_assignment_settings(uuid,text,boolean,integer,text),public.get_my_followup_preferences(),public.save_my_followup_preferences(integer,integer,text) from public,anon;
grant execute on function public.get_crm_operational_settings(),public.save_crm_assignment_settings(uuid,text,boolean,integer,text),public.get_my_followup_preferences(),public.save_my_followup_preferences(integer,integer,text) to authenticated;
commit;
