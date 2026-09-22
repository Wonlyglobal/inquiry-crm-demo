-- Project-owner-authorized demonstration data for the manager team-report list.
-- Rows are explicitly tagged, excluded from official KPIs by the client, and
-- removable by batch without touching real reports.
alter table public.daily_sales_reports
  add column if not exists is_simulated boolean not null default false,
  add column if not exists simulation_batch text;

create index if not exists daily_sales_reports_simulation_batch_idx
  on public.daily_sales_reports(simulation_batch) where is_simulated;

do $$
declare
  chloe constant uuid:='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
  shiyishu constant uuid:='a1894570-830d-45b1-8428-5e12dba6c7d6';
  batch constant text:='september-2026-manager-demo-v1';
  inserted_count integer:=0;
  total_inserted integer:=0;
begin
  if (select count(*) from public.profiles where id in(chloe,shiyishu) and active and not coalesce(is_test_data,false))<>2 then
    raise exception '模拟日报目标账号与批准范围不一致';
  end if;

  insert into public.daily_sales_reports(
    sales_id,report_date,new_leads_count,follow_up_count,key_progress,blockers,tomorrow_plan,
    status,draft_saved_at,submitted_at,updated_at,is_simulated,simulation_batch
  )
  select p.id,d.day,0,0,
    case extract(day from d.day)::int%4
      when 0 then '整理当日客户信息，完成重点项目资料核对。'
      when 1 then '复盘在手项目进度，补充下一步沟通要点。'
      when 2 then '更新客户需求记录，核对报价与技术资料准备情况。'
      else '梳理待推进事项，完成客户资料与项目阶段更新。' end,
    case extract(day from d.day)::int%3
      when 0 then '部分项目资料仍待客户确认，需要继续跟进。'
      when 1 then '暂无新增困难，按计划推进。'
      else '个别需求信息不完整，需补充确认规格与时间。' end,
    case extract(day from d.day)::int%4
      when 0 then '继续核实重点项目需求并更新 CRM 记录。'
      when 1 then '跟进待确认事项，准备所需产品资料。'
      when 2 then '复盘客户反馈并安排下一步沟通。'
      else '检查在手项目状态，补齐信息与行动计划。' end,
    'submitted',(d.day::timestamp+time '17:30') at time zone 'Asia/Shanghai',(d.day::timestamp+time '17:30') at time zone 'Asia/Shanghai',(d.day::timestamp+time '17:30') at time zone 'Asia/Shanghai',true,batch
  from (values(chloe),(shiyishu)) p(id)
  cross join generate_series(date '2026-09-01',date '2026-09-22',interval '1 day') g(day)
  cross join lateral (select g.day::date day) d
  where not exists(
    select 1 from public.daily_sales_reports r
    where r.sales_id=p.id and r.report_date=d.day and not r.is_simulated
  )
  on conflict(sales_id,report_date) do nothing;
  get diagnostics inserted_count=row_count;
  total_inserted:=inserted_count;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(chloe,'profile',chloe,'simulated_daily_reports_seeded',jsonb_build_object('batch',batch,'inserted_count',total_inserted,'period_start','2026-09-01','period_end','2026-09-22','targets',jsonb_build_array(chloe,shiyishu)),'项目负责人要求在主管团队日报列表增加9月模拟日报；模拟数据不计入正式绩效且不得覆盖真实日报');
end $$;
