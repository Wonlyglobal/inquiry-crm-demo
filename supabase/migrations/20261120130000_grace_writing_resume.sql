begin;
-- Only the existing service handler can call this append-only, actor-scoped CAS.
create or replace function public.save_grace_writing_turn(p_actor uuid,p_expected uuid,p_thread text,p_question text,p_answer text,p_material text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare current_turn uuid;
begin
 if p_actor is distinct from 'c43bd3c2-6e3a-4228-99c7-dc95f33643f2'::uuid then raise exception 'writing actor denied'; end if;
 if p_thread !~ '^[0-9a-f-]{36}$' or length(p_question) not between 1 and 3000 or length(p_answer) not between 1 and 150000 or length(p_material)>500 or p_material not like 'work-writing:v1.%' then raise exception 'invalid draft'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('grace-writing:'||p_actor::text,0));
 select turn_id into current_turn from public.grace_chat_turns where actor=p_actor and memory_note='grace-company-draft-v1' order by created_at desc,turn_id desc limit 1;
 if current_turn is distinct from p_expected then return false; end if;
 insert into public.grace_chat_turns(actor,thread_id,turn_id,question,answer,material_context,memory_note)
 values(p_actor,p_thread,gen_random_uuid(),p_question,p_answer,p_material,'grace-company-draft-v1');
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason)
 values(p_actor,'profile',p_actor,'agent_bailian_request',jsonb_build_object('operation','saved_company_draft','provider','internal','external_model_called',false),'本人稿件追加保存及版本核验；修改后重新确认，不向外部模型发送');
 return true;
end $$;
revoke all on function public.save_grace_writing_turn(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_grace_writing_turn(uuid,uuid,text,text,text,text) to service_role;
commit;
