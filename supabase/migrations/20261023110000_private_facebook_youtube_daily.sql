-- User authorised Facebook/YouTube daily metrics-only private sync. Existing exact-owner gate, RLS and ACL remain unchanged.
-- No table/RLS/grant changes; add bounded per-platform documents without replacing other evidence.
begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='public.validate_private_intelligence(jsonb)'::regprocedure)<>'c4c83234cd85334890645065ea870360'
 or (select md5(prosrc) from pg_proc where oid='public.read_agent_private_intelligence(text,date,date,text,integer)'::regprocedure)<>'508e5a8c2db13acbf79590e2e21afab3'
 then raise exception 'Private intelligence definitions drifted; stop migration'; end if;
end $$;
create or replace function public.validate_private_intelligence(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare part jsonb; k text;
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>100000
  or d->>'schema' is distinct from 'grace-private-intelligence-v1'
  or d->>'kind' not in ('weekly','daily','evidence','tiktok','instagram','facebook','youtube') or d->>'kind' is null
  or d->>'key' is null or d->>'key' !~ '^(weekly|daily|evidence|tiktok|instagram|facebook|youtube)-20[0-9]{2}-[0-9]{2}-[0-9]{2}(-20[0-9]{2}-[0-9]{2}-[0-9]{2})?$'
  or split_part(d->>'key','-',1)<>d->>'kind'
  or coalesce(char_length(d->>'title'),0) not between 2 and 160
  or d->'human_verified' is distinct from 'false'::jsonb
  or coalesce(d->>'source_sha256','') !~ '^[a-f0-9]{64}$'
  or coalesce(d->>'generated_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
 then raise exception '私有知识元数据格式不正确'; end if;
 for k in select jsonb_object_keys(d) loop
  if k not in ('schema','key','kind','title','generated_at','period','sections','evidence','source_sha256','human_verified') then raise exception '知识包含未允许的字段'; end if;
 end loop;
 if jsonb_typeof(d->'period') is distinct from 'object'
  or coalesce(d#>>'{period,from}','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  or coalesce(d#>>'{period,to}','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  or (d#>>'{period,from}')::date>(d#>>'{period,to}')::date
  or (d->>'generated_at')::timestamptz is null
 then raise exception '知识包日期不正确'; end if;
 if d->>'key'<>(d->>'kind')||'-'||(d#>>'{period,from}')||(case when d->>'kind'='weekly' then '-'||(d#>>'{period,to}') else '' end)
  or (d->>'kind'<>'weekly' and d#>>'{period,from}'<>d#>>'{period,to}') then raise exception '知识编号与期间不一致'; end if;
 if exists(select 1 from jsonb_object_keys(d->'period') x where x not in ('from','to')) then raise exception '期间字段无效'; end if;
 if jsonb_typeof(d->'sections') is distinct from 'array' or jsonb_typeof(d->'evidence') is distinct from 'array' then raise exception '知识章节或证据无效'; end if;
 if jsonb_array_length(d->'sections') not between 1 and 8 or jsonb_array_length(d->'evidence')>12 then raise exception '知识章节或证据超限'; end if;
 for part in select value from jsonb_array_elements(d->'sections') loop
  if jsonb_typeof(part)<>'object' or coalesce(char_length(part->>'title'),0) not between 1 and 100 or coalesce(char_length(part->>'body'),0) not between 1 and 3000
   or exists(select 1 from jsonb_object_keys(part) x where x not in ('title','body')) then raise exception '知识章节无效'; end if;
 end loop;
 for part in select value from jsonb_array_elements(d->'evidence') loop
  if jsonb_typeof(part)<>'object' or coalesce(part->>'id','') !~ '^[a-z0-9_-]{3,100}$'
   or coalesce(char_length(part->>'title'),0) not between 1 and 160 or coalesce(char_length(part->>'fact'),0) not between 1 and 1600
   or coalesce(char_length(part->>'gap'),0)>1600 or coalesce(char_length(part->>'inference'),0)>1600
   or coalesce(char_length(part->>'url'),0)>1000 or coalesce(part->>'url','') !~ '^https://[a-zA-Z0-9.-]+(/[^[:space:]]*)?$'
   or coalesce(part->>'observed_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
   or (part->>'observed_at')::timestamptz is null
   or (part->>'published_at' is not null and (part->>'published_at' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or (part->>'published_at')::date is null))
   or exists(select 1 from jsonb_object_keys(part) x where x not in ('id','title','fact','inference','url','published_at','observed_at','gap'))
  then raise exception '私有证据格式不正确'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'evidence') x group by x->>'id' having count(*)>1) then raise exception '证据编号重复'; end if;
 if d::text ~* 'sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{20,}\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(password|access_token|service_role|密钥|密码)["[:space:]]*[:=：]'
 then raise exception '知识包疑似含联系方式或凭据，已拒绝'; end if;
end; $$;

create or replace function public.read_agent_private_intelligence(p_kind text default null,p_from date default null,p_to date default null,p_key text default null,p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.private_intelligence_actor(); result jsonb;
begin
 if p_kind is not null and p_kind not in ('weekly','daily','evidence','tiktok','instagram','facebook','youtube') then raise exception '知识类型无效'; end if;
 if coalesce(char_length(p_key),0)>100 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception '知识范围无效'; end if;
 if (select count(*) from public.audit_logs where actor_id=actor and action='agent_private_intelligence_read' and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception '读取过于频繁'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc),'[]'::jsonb) into result from (
  select z.id,z.digest,z.imported_at,z.document,z.generated_at from (
   select distinct on (v.document_key) v.id,v.digest,v.imported_at,v.document,(v.document->>'generated_at')::timestamptz generated_at
   from public.agent_private_intelligence_versions v where v.owner_id=actor
    and (p_kind is null or v.document->>'kind'=p_kind) and (p_key is null or v.document_key=p_key)
    and (p_from is null or (v.document#>>'{period,from}')::date=p_from)
    and (p_to is null or (v.document#>>'{period,to}')::date=p_to)
   order by v.document_key,(v.document->>'generated_at')::timestamptz desc,v.imported_at desc,v.id desc
  ) z order by z.generated_at desc limit least(greatest(coalesce(p_limit,5),1),5)
 ) x;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,after_data,reason) values(actor,'profile',actor,'agent_private_intelligence_read',jsonb_build_object('kind',p_kind,'from',p_from,'to',p_to,'count',jsonb_array_length(result)),'私有知识内部检索，不发送外部模型');
 return jsonb_build_object('documents',result);
end; $$;
commit;
-- Rollback: restore the two definitions from 20261022100000; retain all versions/audits.
