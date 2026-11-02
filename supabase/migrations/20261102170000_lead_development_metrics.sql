-- Period aggregates only. No access to private mail, no changes to daily lead facts.
begin;
create table private.lead_development_metrics (
 sales_id uuid not null references public.profiles(id), from_day date not null, to_day date not null,
 goals jsonb not null default '{}', actuals jsonb not null default '{}', revision integer not null default 1,
 updated_at timestamptz not null default clock_timestamp(), updated_by uuid not null references public.profiles(id),
 primary key(sales_id,from_day,to_day), check(to_day>=from_day and to_day-from_day<=92)
);
alter table private.lead_development_metrics enable row level security;
revoke all on private.lead_development_metrics from public,anon,authenticated,service_role;

create function public.lead_development_workspace(from_day date,to_day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); rows jsonb;
begin
 if $1 is null or $2 is null or $2<$1 or $2-$1>92 or $2>(clock_timestamp() at time zone 'Asia/Shanghai')::date then
  raise exception '请选择截至今天、不超过93天的周期';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('sales_id',p.id,'full_name',p.full_name,'team',p.team,
  'goals',coalesce(m.goals,'{}'::jsonb),'actuals',coalesce(m.actuals,'{}'::jsonb),'revision',coalesce(m.revision,0),
  'updated_at',m.updated_at,'ledger_count',(select count(*) from private.sales_leads l where l.sales_id=p.id and l.recorded_on between $1 and $2),
  'can_set_goals',a.role in('owner','marketing'),'can_record',a.role='sales' and p.id=a.id) order by p.team,p.full_name,p.id),'[]'::jsonb)
 into rows from public.profiles p left join private.lead_development_metrics m on m.sales_id=p.id and m.from_day=$1 and m.to_day=$2
 where p.role='sales' and p.active and not p.is_test_data and p.data_environment='production'
 and (a.role in('owner','marketing') or p.id=a.id or (a.role='sales_manager' and private.crm_manager_covers_user(a.id,p.id)));
 insert into private.sales_lead_events(actor_id,target_id,action,details)
 values(a.id,a.id,'development_metrics_read',jsonb_build_object('from',$1,'to',$2,'people_count',jsonb_array_length(rows)));
 return jsonb_build_object('rows',rows,'from_day',$1,'to_day',$2,'as_of',clock_timestamp());
end $$;

create function public.save_lead_development_metrics(target_sales uuid,from_day date,to_day date,section text,values_json jsonb,expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); before_row private.lead_development_metrics;
 saved private.lead_development_metrics; k text; v jsonb; mode text; sent integer; invalid integer; opened integer; replied integer;
begin
 if $1 is null or $2 is null or $3 is null or $3<$2 or $3-$2>92 or $3>(clock_timestamp() at time zone 'Asia/Shanghai')::date then
  raise exception '请选择截至今天、不超过93天的周期';
 end if;
 if $4 is null or $4 not in('goals','actuals') or $5 is null or jsonb_typeof($5)<>'object' or length($5::text)>4000
  or $6 is null or $6<0 then raise exception '统计填写参数不正确'; end if;
 if not exists(select 1 from public.profiles p where p.id=$1 and p.role='sales' and p.active and not p.is_test_data and p.data_environment='production') then
  raise exception '请选择正式在职业务员';
 end if;
 if ($4='goals' and a.role not in('owner','marketing')) or ($4='actuals' and (a.role<>'sales' or a.id<>$1)) then
  raise exception '目标仅市场部或老板可填写，实际统计仅业务员本人可填写';
 end if;
 if length(btrim(coalesce($5->>'note',''))) not between 4 and 1000 then raise exception '请填写4—1000字的数据来源或修改原因，不含客户及邮件正文'; end if;
 for k,v in select * from jsonb_each($5) loop
  if ($4='goals' and k not in('region','lead_target','send_target','note')) or
   ($4='actuals' and k not in('lead_mode','manual_leads','sent','invalid','opened','replied','note')) then raise exception '存在不支持的统计字段'; end if;
  if k in('lead_target','send_target','manual_leads','sent','invalid','opened','replied') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^(0|[1-9][0-9]{0,6})$' or (v::text)::numeric>1000000) then
    raise exception '数量须为0—1000000的整数，未知请留空';
   end if;
  elsif jsonb_typeof(v)<>'string' then raise exception '文字字段格式不正确';
  end if;
 end loop;
 if $4='goals' and length(coalesce($5->>'region',''))>100 then raise exception '大区名称过长'; end if;
 if $4='actuals' then
  mode:=$5->>'lead_mode';
  if mode is null or mode not in('ledger','manual') then raise exception '请选择线索实际数量的来源'; end if;
  if mode='ledger' and coalesce($5->'manual_leads','null'::jsonb)<>'null'::jsonb then raise exception '账本模式不可同时填写历史汇总'; end if;
  if mode='manual' and coalesce($5->'manual_leads','null'::jsonb)='null'::jsonb then raise exception '请填写历史汇总数量，未知请改用账本或暂不保存'; end if;
  sent:=($5->>'sent')::integer; invalid:=($5->>'invalid')::integer; opened:=($5->>'opened')::integer; replied:=($5->>'replied')::integer;
  if invalid>sent or opened>sent or replied>sent or opened>sent-invalid or replied>sent-invalid or replied>opened then
   raise exception '请核对发送、失效、已读和回复数量；须满足失效≤发送、回复≤已读≤发送成功（已知值之间）';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended($1::text||':'||$2::text||':'||$3::text,0));
 select * into before_row from private.lead_development_metrics m where m.sales_id=$1 and m.from_day=$2 and m.to_day=$3 for update;
 if coalesce(before_row.revision,0)<>$6 then raise exception '数据已被其他操作更新，请刷新后重新核对填写'; end if;
 insert into private.lead_development_metrics(sales_id,from_day,to_day,goals,actuals,updated_by)
 values($1,$2,$3,case when $4='goals' then $5 else '{}'::jsonb end,case when $4='actuals' then $5 else '{}'::jsonb end,a.id)
 on conflict on constraint lead_development_metrics_pkey do update set
 goals=case when $4='goals' then $5 else lead_development_metrics.goals end,
 actuals=case when $4='actuals' then $5 else lead_development_metrics.actuals end,
 revision=lead_development_metrics.revision+1,updated_at=clock_timestamp(),updated_by=a.id returning * into saved;
 insert into private.sales_lead_events(actor_id,target_id,action,details)
 values(a.id,$1,'development_metrics_saved',jsonb_build_object('from',$2,'to',$3,'section',$4,'before',to_jsonb(before_row),'after',to_jsonb(saved)));
 return jsonb_build_object('revision',saved.revision,'updated_at',saved.updated_at);
end $$;
revoke all on function public.lead_development_workspace(date,date),public.save_lead_development_metrics(uuid,date,date,text,jsonb,integer) from public,anon,service_role;
grant execute on function public.lead_development_workspace(date,date),public.save_lead_development_metrics(uuid,date,date,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
