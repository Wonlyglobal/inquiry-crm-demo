begin;

do $$
begin
  if to_regclass('public.risk_cases') is null then raise exception 'risk_cases missing'; end if;
  if to_regclass('public.risk_case_events') is null then raise exception 'risk_case_events missing'; end if;
  if to_regclass('public.risk_user_controls') is null then raise exception 'risk_user_controls missing'; end if;
  if has_table_privilege('authenticated','public.risk_cases','INSERT') then raise exception 'AUTHENTICATED_RISK_INSERT_ALLOWED'; end if;
  if has_table_privilege('authenticated','public.risk_case_events','UPDATE') then raise exception 'AUTHENTICATED_RISK_EVENT_UPDATE_ALLOWED'; end if;
  if has_function_privilege('anon','public.review_risk_case(uuid,text,text)','EXECUTE') then raise exception 'ANON_RISK_REVIEW_ALLOWED'; end if;
  if not has_function_privilege('authenticated','public.get_my_risk_review_workspace()','EXECUTE') then raise exception 'AUTHENTICATED_RISK_WORKSPACE_MISSING'; end if;
end $$;

select
  to_regclass('public.risk_cases') is not null as risk_cases,
  to_regclass('public.risk_case_events') is not null as immutable_events,
  has_function_privilege('authenticated','public.review_risk_case(uuid,text,text)','EXECUTE') as reviewed_rpc,
  has_function_privilege('anon','public.review_risk_case(uuid,text,text)','EXECUTE') as anon_review_denied;

rollback;
