-- Enrich only the explicitly tagged September demonstration reports.
-- Real reports and dates occupied by real reports remain untouched.
do $$
declare
  chloe constant uuid:='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
  shiyishu constant uuid:='a1894570-830d-45b1-8428-5e12dba6c7d6';
  changed integer:=0;
begin
  update public.daily_sales_reports r
  set
    new_leads_count=case when r.sales_id=chloe then 2+(extract(day from r.report_date)::int%4) else 1+(extract(day from r.report_date)::int%3) end,
    follow_up_count=case when r.sales_id=chloe then 5+(extract(day from r.report_date)::int%5) else 4+(extract(day from r.report_date)::int%6) end,
    key_progress=case (extract(day from r.report_date)::int%6)
      when 0 then '完成阿联酋酒店项目防火门五金清单核对；向客户确认门厚、开启方向和锁体背距，并在 CRM 更新联系人及下一步节点。'
      when 1 then '跟进沙特经销商年度采购计划；整理 3 个主推锁具型号的英文参数、MOQ 与交期，客户已确认进入首轮选型。'
      when 2 then '复盘越南公寓项目报价；补齐 120 套样板房门锁的表面处理与包装要求，并把客户最新反馈同步至商机记录。'
      when 3 then '完成英国工程客户 CE/EN 认证资料匹配；发送测试报告索引，电话确认技术负责人和预计采购月份。'
      when 4 then '推进墨西哥酒店翻新项目；核实客房门数量、消防等级和分批交货计划，已安排技术团队校对配置表。'
      else '整理当天新增客户并完成去重；对重点商机逐一补充公司、联系人、需求、预算与计划时间，明确下一次跟进动作。' end,
    blockers=case (extract(day from r.report_date)::int%5)
      when 0 then '客户尚未提供完整门表和五金节点图；需要技术部在收到图纸后 1 个工作日内协助核对锁体、合页与闭门器配置。'
      when 1 then '海运价格有效期较短，客户希望同时比较 CIF 与 FOB；需要供应链确认本周舱位及两套运费口径。'
      when 2 then '客户对认证适用范围存在疑问；需要质量部确认现有证书覆盖型号，并提供可对外发送的英文说明。'
      when 3 then '部分产品颜色缺少实物效果图；需要市场部补充黑色、古铜色和拉丝不锈钢的高清项目照片。'
      else '客户内部预算审批尚未完成；当前无公司内部阻塞，继续按约定日期跟进决策人并记录反馈。' end,
    tomorrow_plan=case (extract(day from r.report_date)::int%6)
      when 0 then '上午完成配置表复核并发客户确认；下午跟进两位未回复联系人，更新预计成交日期和风险说明。'
      when 1 then '准备经销商分级报价与样品清单；约客户进行 20 分钟视频会议，确认首单数量、付款方式和交期。'
      when 2 then '根据客户反馈修订报价版本；与技术部确认样品可行性，并在 CRM 建立下一次跟进提醒。'
      when 3 then '发送认证说明及对应测试报告；电话确认是否需要第三方验货，并补充采购决策链信息。'
      when 4 then '完成酒店项目分批交付建议；核对包装唛头、目的港和预计开工时间，推动客户确认正式询价范围。'
      else '优先处理高意向商机回复；完成新线索背景核验和联系人补全，逐项关闭当天到期的跟进任务。' end,
    updated_at=now()
  where r.is_simulated
    and r.simulation_batch='september-2026-manager-demo-v1'
    and r.sales_id in(chloe,shiyishu)
    and r.report_date between date '2026-09-01' and date '2026-09-22';
  get diagnostics changed=row_count;

  insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
  values(chloe,'profile',chloe,'simulated_daily_reports_enriched',jsonb_build_object('batch','september-2026-manager-demo-v1','updated_count',changed,'counts_nonzero',true,'real_reports_untouched',true),'项目负责人要求模拟日报使用非零、可读且按日期变化的详细业务数据；仅更新明确标记的模拟记录');
end $$;
