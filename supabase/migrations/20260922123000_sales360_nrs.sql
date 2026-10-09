-- NRS 0-10 behavior questions; keep legacy scores intact and normalize at aggregation.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.submit_sales_360_evaluation(uuid,jsonb,text,text)'::regprocedure)) <> 'b38e20c5c60d6aba0179e3ec0f38c5dc' then raise exception '提交函数已变化'; end if;
 if md5(pg_get_functiondef('private.validate_sales360_questionnaire(text,jsonb)'::regprocedure)) <> '0357f99302f4685e853d294f3993274a' then raise exception '题库校验已变化'; end if;
 if md5(pg_get_functiondef('public.calculate_sales_360_cycle(uuid)'::regprocedure)) <> 'fb99e31d3e342d68e64bc84276e21eac' then raise exception '汇总函数已变化'; end if;
end $$;
create or replace function private.sales360_questionnaire_nrs_v3() returns jsonb
language sql immutable set search_path='' as $bank$ select $json${"version": "360-nrs-v3", "scale": [{"value": 0, "label": "严重未达到要求，有明确事实依据"}, {"value": 1, "label": "绝大多数情况下未达到要求"}, {"value": 2, "label": "明显未达到要求"}, {"value": 3, "label": "多次未达到要求"}, {"value": 4, "label": "部分达到，仍需明显改进"}, {"value": 5, "label": "接近要求，表现尚不稳定"}, {"value": 6, "label": "基本达到岗位要求"}, {"value": 7, "label": "稳定达到岗位要求"}, {"value": 8, "label": "达到并经常超出要求"}, {"value": 9, "label": "明显超出要求，有可核实案例"}, {"value": 10, "label": "持续显著超出要求，有可核实案例"}, {"value": "na", "label": "不了解／本月未观察（不计分）"}], "groups": {"owner": [{"id": "performance_contribution_1", "dimension": "performance_contribution", "text": "能围绕重点客户和商机投入精力，推动有价值的业务进展。"}, {"id": "performance_contribution_2", "dimension": "performance_contribution", "text": "能在追求成交的同时考虑利润、回款和履约质量。"}, {"id": "performance_contribution_3", "dimension": "performance_contribution", "text": "能把个人经验沉淀为团队可复用的方法或资料。"}, {"id": "values_1", "dimension": "values", "text": "向团队如实说明客户进展、风险和失误，不隐瞒关键事实。"}, {"id": "values_2", "dimension": "values", "text": "遵守客户资料、报价授权和商业信息保护要求。"}, {"id": "values_3", "dimension": "values", "text": "面对短期利益与公司承诺冲突时，能按规则处理并及时报告。"}, {"id": "responsibility_1", "dimension": "responsibility", "text": "对承诺的交付负责，遇到困难主动寻求解决方案。"}, {"id": "responsibility_2", "dimension": "responsibility", "text": "对跨部门问题明确责任、推动处理并反馈结果。"}, {"id": "responsibility_3", "dimension": "responsibility", "text": "发现重大业务风险后及时上报并持续跟踪。"}], "manager": [{"id": "execution_1", "dimension": "execution", "text": "能将本月重点任务拆分为明确的行动、责任和时间节点。"}, {"id": "execution_2", "dimension": "execution", "text": "按约定完成客户响应和跟进，遇到延期提前说明并补救。"}, {"id": "execution_3", "dimension": "execution", "text": "及时记录沟通结果、下一步行动和跟进时间，让工作可追溯。"}, {"id": "professionalism_1", "dimension": "professionalism", "text": "能准确理解客户的应用场景、产品规格和关键需求。"}, {"id": "professionalism_2", "dimension": "professionalism", "text": "能清楚说明产品价值，并在报价或技术承诺前核实依据。"}, {"id": "professionalism_3", "dimension": "professionalism", "text": "能针对客户异议提出有依据的回应，必要时协调技术或工程支持。"}, {"id": "goal_delivery_1", "dimension": "goal_delivery", "text": "能依据月度目标明确重点客户、商机及推进计划。"}, {"id": "goal_delivery_2", "dimension": "goal_delivery", "text": "能识别商机卡点，采取具体行动推动阶段进展。"}, {"id": "goal_delivery_3", "dimension": "goal_delivery", "text": "能客观复盘目标差距，区分资源限制与自身可改进事项。"}, {"id": "growth_1", "dimension": "growth", "text": "能把主管或同事的反馈转化为可观察的行为改进。"}, {"id": "growth_2", "dimension": "growth", "text": "能主动学习产品、市场或销售知识并在工作中应用。"}, {"id": "growth_3", "dimension": "growth", "text": "能复盘成功与失败案例，形成可复用的方法并检验效果。"}], "peer": [{"id": "collaboration_1", "dimension": "collaboration", "text": "交接工作时提供完整背景、明确责任和约定时间。"}, {"id": "collaboration_2", "dimension": "collaboration", "text": "在需要共同推进的事项中主动配合，避免推诿或重复劳动。"}, {"id": "collaboration_3", "dimension": "collaboration", "text": "意见不一致时围绕事实沟通并落实双方确认的方案。"}, {"id": "responsiveness_1", "dimension": "responsiveness", "text": "对协作请求及时确认，说明是否承接及预计完成时间。"}, {"id": "responsiveness_2", "dimension": "responsiveness", "text": "出现延期或阻碍时提前通知相关人员，不让对方反复催问。"}, {"id": "responsiveness_3", "dimension": "responsiveness", "text": "完成协作事项后反馈结果，确保对方能继续开展工作。"}, {"id": "knowledge_sharing_1", "dimension": "knowledge_sharing", "text": "愿意分享可复用的产品资料、客户问题解决方法或经验。"}, {"id": "knowledge_sharing_2", "dimension": "knowledge_sharing", "text": "能把经验整理清楚，便于同事理解和实际使用。"}, {"id": "knowledge_sharing_3", "dimension": "knowledge_sharing", "text": "发现共享资料过时或错误时主动提出并协助更新。"}], "marketing": [{"id": "lead_feedback_quality_1", "dimension": "lead_feedback_quality", "text": "能及时反馈询盘是否匹配、客户需求和后续处理方向。"}, {"id": "lead_feedback_quality_2", "dimension": "lead_feedback_quality", "text": "能清楚说明线索质量判断的事实依据，而非仅给出结论。"}, {"id": "lead_feedback_quality_3", "dimension": "lead_feedback_quality", "text": "能反馈渠道或推广内容与实际需求的偏差，帮助市场改进。"}, {"id": "handoff_collaboration_1", "dimension": "handoff_collaboration", "text": "接收线索后主动确认关键信息和跟进责任。"}, {"id": "handoff_collaboration_2", "dimension": "handoff_collaboration", "text": "发现交接信息缺失时一次性说明，配合市场补齐。"}, {"id": "handoff_collaboration_3", "dimension": "handoff_collaboration", "text": "对需要继续培育或联合推进的线索明确下一步和责任人。"}, {"id": "recycle_evidence_1", "dimension": "recycle_evidence", "text": "退回或判定线索不适合时说明原因及已进行的核实。"}, {"id": "recycle_evidence_2", "dimension": "recycle_evidence", "text": "能区分暂未回复、需求不匹配和无效线索，避免简单放弃。"}, {"id": "recycle_evidence_3", "dimension": "recycle_evidence", "text": "退回线索时提供可用于再次培育的建议或条件。"}], "self": [{"id": "goal_review_1", "dimension": "goal_review", "text": "我能用具体工作结果复盘本月目标的完成情况。"}, {"id": "goal_review_2", "dimension": "goal_review", "text": "我能说明目标差距的原因，并区分外部因素与自身责任。"}, {"id": "goal_review_3", "dimension": "goal_review", "text": "我能识别真正推动商机进展的行动，并总结经验。"}, {"id": "problem_identification_1", "dimension": "problem_identification", "text": "我能主动识别客户跟进、专业能力或协作中的不足。"}, {"id": "problem_identification_2", "dimension": "problem_identification", "text": "我能依据记录和反馈分析问题原因，避免只描述表面现象。"}, {"id": "problem_identification_3", "dimension": "problem_identification", "text": "我能及时暴露风险并寻求帮助，而不是等问题扩大。"}, {"id": "improvement_plan_1", "dimension": "improvement_plan", "text": "我为关键问题制定了明确、可执行的改进行动。"}, {"id": "improvement_plan_2", "dimension": "improvement_plan", "text": "我的改进计划包含完成时间和可验证的结果。"}, {"id": "improvement_plan_3", "dimension": "improvement_plan", "text": "我会持续检查改进效果，并根据结果调整行动。"}]}, "short_questions": [{"id": "strength", "text": "本月最值得肯定的表现是什么？请说明一个具体事例及结果。", "required": true}, {"id": "improvement", "text": "最需要改进的一项工作是什么？请说明具体情境、影响和建议；如暂无问题，请说明已观察的表现。", "required": true}, {"id": "action", "text": "建议下月采取什么行动？请写明行动、完成时间和验证标准。", "required": true}, {"id": "support", "text": "需要主管、团队或其他部门提供哪些支持？没有额外需求可填“暂无”。", "required": false}]}$json$::jsonb $bank$;
revoke all on function private.sales360_questionnaire_nrs_v3() from public,anon,authenticated;
alter table public.sales_360_evaluation_responses drop constraint sales_360_evaluation_responses_overall_score_check;
alter table public.sales_360_evaluation_responses add constraint sales_360_evaluation_responses_overall_score_check check (
 (questionnaire_version='360-nrs-v3' and overall_score between 0 and 10)
 or (questionnaire_version in ('legacy-v1','360-behavior-v2') and overall_score between 1 and 5));
create or replace function private.validate_sales360_questionnaire(group_name text, payload jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare bank jsonb:=private.sales360_questionnaire_nrs_v3(); questions jsonb; question jsonb; answer jsonb;
 dimension text; value numeric; totals jsonb:='{}'; counts jsonb:='{}'; scores jsonb:='{}';
 short_answer text; summary_text text:=''; evidence_text text:=''; key text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'version' is distinct from bank->>'version' then raise exception '请刷新页面，使用完整360问卷提交'; end if;
 if jsonb_typeof(payload->'choices') is distinct from 'object' or jsonb_typeof(payload->'short_answers') is distinct from 'object' then raise exception '问卷答案格式不正确'; end if;
 if octet_length(payload::text)>40000 then raise exception '问卷内容过长'; end if;
 questions:=bank->'groups'->group_name;
 if questions is null then raise exception '不支持的评价类型'; end if;
 if (select count(*) from jsonb_object_keys(payload->'choices')) <> jsonb_array_length(questions) then raise exception '选择题数量不正确'; end if;
 for question in select * from jsonb_array_elements(questions) loop
  answer:=payload->'choices'->(question->>'id'); dimension:=question->>'dimension';
  if jsonb_typeof(answer) is distinct from 'object' then raise exception '缺少选择题：%',question->>'text'; end if;
  if answer->>'value'='na' then continue; end if;
  if jsonb_typeof(answer->'value') is distinct from 'number' then raise exception '请选择0到10分或未观察'; end if;
  value:=(answer->>'value')::numeric;
  if value<0 or value>10 or value<>trunc(value) then raise exception 'NRS选择题必须为0到10的整数'; end if;
  if answer ? 'evidence' and jsonb_typeof(answer->'evidence') is distinct from 'string' then raise exception '事实依据必须为文字'; end if;
  if char_length(coalesce(answer->>'evidence',''))>500 then raise exception '单题事实依据最多500字'; end if;
  if (value<=4 or value>=9) and char_length(btrim(coalesce(answer->>'evidence','')))<8 then raise exception '0—4分或9—10分需要至少8字的逐题事例：%',question->>'text'; end if;
  totals:=jsonb_set(totals,array[dimension],to_jsonb(coalesce((totals->>dimension)::numeric,0)+value));
  counts:=jsonb_set(counts,array[dimension],to_jsonb(coalesce((counts->>dimension)::integer,0)+1));
  if nullif(btrim(answer->>'evidence'),'') is not null then evidence_text:=evidence_text||(question->>'id')||'：'||(answer->>'evidence')||E'
'; end if;
 end loop;
 foreach dimension in array private.sales_360_dimensions(group_name) loop
  if coalesce((counts->>dimension)::integer,0)<2 then raise exception '每个维度至少需要2题有实际观察，暂无法完成该维度：%',dimension; end if;
  scores:=jsonb_set(scores,array[dimension],to_jsonb(round((totals->>dimension)::numeric/(counts->>dimension)::numeric,2)));
 end loop;
 for key in select jsonb_object_keys(payload->'short_answers') loop
  if not exists(select 1 from jsonb_array_elements(bank->'short_questions') q where q->>'id'=key) then raise exception '未知简答题'; end if;
 end loop;
 for question in select * from jsonb_array_elements(bank->'short_questions') loop
  if (payload->'short_answers') ? (question->>'id') and jsonb_typeof(payload->'short_answers'->(question->>'id')) is distinct from 'string' then raise exception '简答题必须为文字'; end if;
  short_answer:=btrim(coalesce(payload->'short_answers'->>(question->>'id'),''));
  if (question->>'required')::boolean and char_length(short_answer)<8 then raise exception '请完整填写简答题（至少8字）：%',question->>'text'; end if;
  if char_length(short_answer)>1000 then raise exception '每道简答题最多1000字'; end if;
  summary_text:=summary_text||(question->>'text')||E'
'||short_answer||E'
';
 end loop;
 return jsonb_build_object('scores',scores,'summary',summary_text,'evidence',evidence_text);
end $$;
revoke all on function private.validate_sales360_questionnaire(text,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_sales_360_evaluation(target_assignment_id uuid, target_scores jsonb, target_summary text DEFAULT NULL::text, target_evidence text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); task public.sales_360_evaluation_assignments; cycle public.sales_360_cycles;
  required_dimensions text[]; dimension text; score_value numeric; total numeric:=0; score_count integer:=0; overall numeric; response_id uuid; extreme boolean:=false; questionnaire jsonb; validated jsonb;
begin
  select * into task from public.sales_360_evaluation_assignments where id=target_assignment_id for update;
  if actor is null or task.id is null or task.evaluator_id is distinct from actor then raise exception '评价任务不存在或不属于当前账号'; end if;
  if task.evaluator_group='manager' and not private.sales360_can_evaluate(actor,task.subject_id) then raise exception '该评分对象已不在主管授权团队范围内'; end if;
  select * into cycle from public.sales_360_cycles where id=task.cycle_id;
  if cycle.period_start < date '2026-07-01' then raise exception '成员评价从2026年第三季度开始'; end if;
  if cycle.status<>'collecting' or task.status<>'pending' or clock_timestamp()>task.due_at then raise exception '该评价任务已经截止或完成'; end if;
  if jsonb_typeof(coalesce(target_scores,'null'::jsonb))<>'object' then raise exception '请提交完整的维度评分'; end if;
  questionnaire:=target_scores->'_questionnaire';
  validated:=private.validate_sales360_questionnaire(task.evaluator_group,questionnaire);
  target_scores:=validated->'scores';
  target_summary:=validated->>'summary'; target_evidence:=validated->>'evidence';
  required_dimensions:=private.sales_360_dimensions(task.evaluator_group);
  foreach dimension in array required_dimensions loop
    if not target_scores ? dimension or jsonb_typeof(target_scores->dimension)<>'number' then raise exception '缺少评分维度：%',dimension; end if;
    score_value:=(target_scores->>dimension)::numeric;
    if score_value<0 or score_value>10 then raise exception 'NRS评分必须在 0 到 10 之间'; end if;
    total:=total+score_value; score_count:=score_count+1;
  end loop;
  overall:=round(total/greatest(score_count,1),2);
  insert into public.sales_360_evaluation_responses(assignment_id,dimension_scores,overall_score,summary,evidence,questionnaire_version,questionnaire_answers)
  values(task.id,target_scores,overall,nullif(btrim(target_summary),''),nullif(btrim(target_evidence),''),questionnaire->>'version',questionnaire) returning id into response_id;
  update public.sales_360_evaluation_assignments set status='submitted',submitted_at=clock_timestamp() where id=task.id;
  insert into public.sales_360_events(cycle_id,result_id,actor_id,event_type,after_data,reason)
  values(task.cycle_id,task.result_id,null,'evaluation_submitted',jsonb_build_object('assignment_id',task.id,'response_id',response_id,'evaluator_group',task.evaluator_group),'提交匿名 360 评价');
  return jsonb_build_object('assignment_id',task.id,'status','submitted','overall_score',overall);
end $function$;



-- Normalize raw NRS /10 into the existing /5 weighted aggregation only on future calculations.
-- Existing locked results and stored legacy responses are not updated.
do $$ declare definition text; needle text:='select a.evaluator_group,r.overall_score from public.sales_360_evaluation_assignments a';
begin
 definition:=pg_get_functiondef('public.calculate_sales_360_cycle(uuid)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception '无法定位评分归一化入口'; end if;
 definition:=replace(definition,needle,'select a.evaluator_group,case when r.questionnaire_version=''360-nrs-v3'' then r.overall_score/2 else r.overall_score end as overall_score from public.sales_360_evaluation_assignments a');
 definition:=replace(definition,'end as relative_rank','end::numeric as relative_rank');
 execute definition;
end $$;
commit;
