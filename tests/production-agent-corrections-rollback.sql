-- Production-safe proof for reviewed agent correction memory. Run as a privileged operator. Every write is rolled back.
begin;
do $$
declare
  owner_id constant uuid := 'c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
  other_id uuid;
  saved public.agent_knowledge_corrections;
  denied boolean := false; sensitive_rejected boolean := false; double_review_rejected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select * into saved from public.submit_agent_correction('Grace','45mm','TEST-ONLY 门扇厚度为 50mm','回滚验收合成出处');
  if saved.status<>'pending' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  select * into saved from public.review_agent_correction(saved.id,'approve','回滚验收');
  if saved.status<>'approved' or saved.reviewed_by<>owner_id then raise exception 'CORRECTION_NOT_APPROVED'; end if;
  begin perform public.review_agent_correction(saved.id,'approve',null); exception when others then double_review_rejected := true; end;
  if not double_review_rejected then raise exception 'DOUBLE_APPROVE_ACCEPTED'; end if;
  begin perform public.submit_agent_correction('Grace',null,'联系 test@example.com','x1'); exception when others then sensitive_rejected := sqlerrm like '%联系方式%'; end;
  if not sensitive_rejected then raise exception 'SENSITIVE_CORRECTION_ACCEPTED'; end if;
  if (select count(*) from public.audit_logs where actor_id=owner_id and action in ('agent_correction_submitted','agent_correction_approved') and after_data->>'correction_id'=saved.id::text)<2
  then raise exception 'CORRECTION_AUDIT_MISSING'; end if;
  select p.id into other_id from public.profiles p where p.active=true and p.id<>owner_id order by p.created_at limit 1;
  if other_id is not null then
    perform set_config('request.jwt.claim.sub',other_id::text,true);
    begin perform public.list_agent_corrections('approved'); exception when others then denied := sqlerrm like '%无权%'; end;
    if not denied then raise exception 'NON_REVIEWER_CAN_LIST'; end if;
  end if;
end $$;
rollback;
select concat('table=',to_regclass('public.agent_knowledge_corrections') is not null,
 '; anon_select=',has_table_privilege('anon','public.agent_knowledge_corrections','select'),
 '; auth_select=',has_table_privilege('authenticated','public.agent_knowledge_corrections','select'),
 '; auth_submit=',has_function_privilege('authenticated','public.submit_agent_correction(text,text,text,text)','execute'),
 '; anon_submit=',has_function_privilege('anon','public.submit_agent_correction(text,text,text,text)','execute'));
