-- Execute in a transaction only after independent review of this exact release.
-- Caller sets LOCAL crm.team_scope_review to the verified GitHub approval URL.
do $$
declare manager uuid; matches integer; review_url text:=current_setting('crm.team_scope_review',true);
begin
 if coalesce(review_url,'') not like 'https://github.com/Wonlyglobal/inquiry-crm-demo/pull/%#pullrequestreview-%' then
  raise exception '必须记录本次独立复核链接';
 end if;
 select count(*),min(id::text)::uuid into matches,manager from public.profiles
 where full_name='凌子学' and role='sales_manager' and active=true and team='销售部';
 if matches<>1 then raise exception '凌子学有效主管账号不唯一或组织信息已变化，停止授权'; end if;
 if exists(select 1 from private.crm_export_manager_teams where manager_id=manager) then
  raise exception '该主管已存在明确范围，请先复核现有授权，禁止静默覆盖';
 end if;
 insert into private.crm_export_manager_teams(manager_id,team,reason,approval_reference)
 values(manager,'海外业务部','用户于 2026-09-21 确认直属主管均为凌子学；仅受控询盘导出范围',review_url),
       (manager,'海外工程部','用户于 2026-09-21 确认直属主管均为凌子学；仅受控询盘导出范围',review_url);
end $$;
