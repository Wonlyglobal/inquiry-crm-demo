-- Bounded private product page evidence, original exact-owner JWT/RLS/audit only.
-- No table, actor, sync, receipt, grant or source-authority expansion. Never load real payloads in tests.
begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='public.private_intelligence_actor()'::regprocedure) is distinct from 'c617bc29eacf90f04518d488500a456a'
 or (select md5(prosrc) from pg_proc where oid='public.validate_private_intelligence(jsonb)'::regprocedure) is distinct from '9de44afd45fc6e8dffce9901b6dca8a3'
 or (select md5(prosrc) from pg_proc where oid='public.sync_agent_private_intelligence(jsonb)'::regprocedure) is distinct from 'a4ced508cd37a074f1ba4bf95c2d8cb1'
 or (select md5(prosrc) from pg_proc where oid='public.read_agent_private_intelligence(text,date,date,text,integer)'::regprocedure) is distinct from '446bf3168e1016f4c49ee47ebab1ade5'
 or (select md5(prosrc) from pg_proc where oid='public.receipt_agent_private_intelligence(uuid)'::regprocedure) is distinct from '83fa176b5711ee4dfa065dc6379c70fb'
 then raise exception 'Private intelligence definitions drifted; stop migration'; end if;
end $$;

create function public.private_product_bbox_valid(b jsonb,w numeric,h numeric,p jsonb default null) returns boolean
language plpgsql immutable set search_path='' as $$
declare n numeric; item jsonb;
begin
 if jsonb_typeof(b) is distinct from 'array' then return false; end if;
 if jsonb_array_length(b)<>4 then return false; end if;
 for item in select value from jsonb_array_elements(b) loop
  if jsonb_typeof(item) is distinct from 'number' then return false; end if;
  n:=(item#>>'{}')::numeric;
  if n<0 or n>30000 or n<>round(n,4) then return false; end if;
 end loop;
 if (b->>0)::numeric>=(b->>2)::numeric or (b->>1)::numeric>=(b->>3)::numeric
  or (b->>2)::numeric>w or (b->>3)::numeric>h then return false; end if;
 if p is not null and ((b->>0)::numeric<(p->>0)::numeric or (b->>1)::numeric<(p->>1)::numeric
  or (b->>2)::numeric>(p->>2)::numeric or (b->>3)::numeric>(p->>3)::numeric) then return false; end if;
 return true;
end; $$;
revoke all on function public.private_product_bbox_valid(jsonb,numeric,numeric,jsonb) from public,anon,authenticated;

create function public.validate_private_product_page_evidence(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare e jsonb; r jsonb; s jsonb; item jsonb; model_key text; pat text; matches text[]; cursor_at integer; named boolean;
 n numeric; w numeric; h numeric; start_at integer; end_at integer; source_text text; identity_text text; identity_start integer; identity_end integer; stamp text;
begin
 if d is null or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>100000
  or d->>'schema' is distinct from 'grace-private-intelligence-v1' or d->>'kind' is distinct from 'product'
  or jsonb_typeof(d->'title') is distinct from 'string' or char_length(d->>'title') not between 2 and 160
  or d->'human_verified' is distinct from 'false'::jsonb
  or jsonb_typeof(d->'source_sha256') is distinct from 'string' or coalesce(d->>'source_sha256','') !~ '^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_object_keys(d) k where k not in ('schema','key','kind','title','generated_at','period','sections','evidence','source_sha256','human_verified','product_evidence'))
 then raise exception '产品证据元数据无效'; end if;
 e:=d->'product_evidence';
 if jsonb_typeof(e) is distinct from 'object' then raise exception '产品证据结构无效'; end if;
 if e->>'schema' is distinct from 'grace-product-page-evidence-v1'
  or jsonb_typeof(e->'model') is distinct from 'string' or char_length(e->>'model') not between 3 and 60
  or jsonb_typeof(e->'source_name') is distinct from 'string' or char_length(e->>'source_name') not between 1 and 180
  or jsonb_typeof(e->'source_edition') is distinct from 'string' or char_length(e->>'source_edition') not between 1 and 60
  or jsonb_typeof(e->'source_sha256') is distinct from 'string' or e->>'source_sha256' is distinct from d->>'source_sha256'
  or not(e ?& array['source_published_at','source_updated_at','extracted_at','regions','gaps'])
  or exists(select 1 from jsonb_object_keys(e) k where k not in ('schema','model','source_name','source_edition','source_sha256','source_published_at','source_updated_at','extracted_at','regions','gaps'))
 then raise exception '产品证据范围无效'; end if;
 model_key:=upper(regexp_replace(normalize(e->>'model',NFKC),'[[:space:]_/.-]+','','g'));
 if model_key !~ '^[A-Z][A-Z0-9]{2,59}$' or model_key !~ '[0-9]' or model_key ~ '^(V[0-9]+|ISO[0-9]+|EN[0-9]+|UL[0-9]+)$'
  or d->>'key' is distinct from 'product-'||encode(sha256(convert_to('grace-product-page-evidence-v1|'||(d->>'source_sha256')||'|'||model_key,'UTF8')),'hex')
 then raise exception '产品完整型号或知识编号无效'; end if;
 for stamp in select value from (values(d->>'generated_at'),(e->>'extracted_at')) t(value) loop
  if coalesce(stamp,'') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' or stamp::timestamptz is null then raise exception '产品证据时间无效'; end if;
 end loop;
 if (e->>'extracted_at')::timestamptz>(d->>'generated_at')::timestamptz then raise exception '提取时间晚于组包时间'; end if;
 if jsonb_typeof(e->'source_published_at') is distinct from 'null' then
  if jsonb_typeof(e->'source_published_at') is distinct from 'string' or e->>'source_published_at' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or (e->>'source_published_at')::date is null then raise exception '来源发布日期无效'; end if;
 end if;
 if jsonb_typeof(e->'source_updated_at') is distinct from 'null' then
  stamp:=e->>'source_updated_at';
  if jsonb_typeof(e->'source_updated_at') is distinct from 'string' or stamp !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' or stamp::timestamptz is null then raise exception '来源更新时间无效'; end if;
 end if;
 if jsonb_typeof(d->'period') is distinct from 'object' then raise exception '产品证据组包期间无效'; end if;
 if coalesce(d#>>'{period,from}','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or d#>>'{period,to}' is distinct from d#>>'{period,from}'
  or (d#>>'{period,from}')::date is null or exists(select 1 from jsonb_object_keys(d->'period') k where k not in ('from','to')) then raise exception '产品证据组包期间无效'; end if;
 if d->'sections' is distinct from '[{"title":"产品证据边界","body":"仅保存授权产品原文区域，机器整理，未经人工事实核验；来源、型号、页码和配置需回查原件，不证明当前版次、认证或市场适配。"}]'::jsonb
  or d->'evidence' is distinct from '[]'::jsonb then raise exception '产品证据边界说明无效'; end if;
 if jsonb_typeof(e->'regions') is distinct from 'array' or jsonb_typeof(e->'gaps') is distinct from 'array' then raise exception '产品证据区域或缺口无效'; end if;
 if jsonb_array_length(e->'regions') not between 1 and 12 or jsonb_array_length(e->'gaps')>12 then raise exception '产品证据区域或缺口超限'; end if;
 for item in select value from jsonb_array_elements(e->'gaps') loop
  if jsonb_typeof(item) is distinct from 'string' or char_length(item#>>'{}') not between 1 and 500 then raise exception '产品证据缺口无效'; end if;
 end loop;
 select string_agg(ch,'[[:space:]_/.-]*' order by ord) into pat from regexp_split_to_table(model_key,'') with ordinality t(ch,ord);
 pat:='(?<![A-Z0-9])'||pat||'(?![A-Z0-9]|[[:space:]_/.-]+(?:PRO|MAX|PLUS|ULTRA|LITE|BASIC|STANDARD)(?:$|[^A-Z0-9]))';
 for r in select value from jsonb_array_elements(e->'regions') loop
  if jsonb_typeof(r) is distinct from 'object' then raise exception '产品证据区域无效'; end if;
  if r->>'schema' is distinct from 'native_region_v1' or r->>'source_kind' is distinct from 'native_text'
   or jsonb_typeof(r->'source_sha256') is distinct from 'string' or r->>'source_sha256' is distinct from d->>'source_sha256'
   or r->>'offset_unit' is distinct from 'unicode_codepoint' or r->>'coordinate_system' is distinct from 'pdf_points_top_left' or r->'rotation' is distinct from '0'::jsonb
   or jsonb_typeof(r->'page') is distinct from 'number' or coalesce(r->>'page','') !~ '^[0-9]+$' or (r->>'page')::numeric not between 1 and 500
   or jsonb_typeof(r->'native_text') is distinct from 'string' or char_length(r->>'native_text') not between 1 and 2550
   or jsonb_typeof(r->'region_id') is distinct from 'string' or char_length(r->>'region_id') not between 1 and 100
   or exists(select 1 from jsonb_object_keys(r) k where k not in ('schema','source_kind','source_sha256','page','page_width','page_height','coordinate_system','offset_unit','rotation','panel_bbox','native_text','headings','field','region_id'))
  then raise exception '产品证据区域元数据无效'; end if;
  for item in select value from (values(r->'page_width'),(r->'page_height')) t(value) loop
   if jsonb_typeof(item) is distinct from 'number' then raise exception '产品证据页面尺寸无效'; end if;
   n:=(item#>>'{}')::numeric;
   if n<=0 or n>30000 or n<>round(n,4) then raise exception '产品证据页面尺寸无效'; end if;
  end loop;
  w:=(r->>'page_width')::numeric; h:=(r->>'page_height')::numeric;
  if not public.private_product_bbox_valid(r->'panel_bbox',w,h) then raise exception '产品证据区域坐标无效'; end if;
  if jsonb_typeof(r->'headings') is distinct from 'array' then raise exception '产品型号标题无效'; end if;
  if jsonb_array_length(r->'headings') not between 1 and 3 or jsonb_typeof(r->'field') is distinct from 'object' then raise exception '产品标题或字段超限'; end if;
  source_text:=r->>'native_text'; identity_text:=normalize(source_text,NFKC);
  for s in select value from jsonb_array_elements(r->'headings') union all select r->'field' loop
   if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'quote') is distinct from 'string' or char_length(s->>'quote') not between 1 and 500
    or jsonb_typeof(s->'start') is distinct from 'number' or coalesce(s->>'start','') !~ '^[0-9]+$'
    or jsonb_typeof(s->'end') is distinct from 'number' or coalesce(s->>'end','') !~ '^[0-9]+$'
   then raise exception '产品证据引用无效'; end if;
   if (s->>'start')::numeric>char_length(source_text) or (s->>'end')::numeric>char_length(source_text) then raise exception '产品引用位置无效'; end if;
   start_at:=(s->>'start')::integer; end_at:=(s->>'end')::integer;
   if end_at<=start_at or substring(source_text from start_at+1 for end_at-start_at) is distinct from s->>'quote'
    or not public.private_product_bbox_valid(s->'bbox',w,h,r->'panel_bbox') then raise exception '产品引用原文或坐标无效'; end if;
  end loop;
  for s in select value from jsonb_array_elements(r->'headings') loop
   if jsonb_typeof(s->'model') is distinct from 'string' or char_length(s->>'model') not between 3 and 60 or upper(regexp_replace(normalize(s->>'model',NFKC),'[[:space:]_/.-]+','','g'))<>model_key
    or exists(select 1 from jsonb_object_keys(s) k where k not in ('model','quote','start','end','bbox')) then raise exception '产品标题完整型号无效'; end if;
   named:=false; cursor_at:=0;
   identity_start:=char_length(normalize(substring(source_text from 1 for (s->>'start')::integer),NFKC));
   identity_end:=char_length(normalize(substring(source_text from 1 for (s->>'end')::integer),NFKC));
   -- Raw spans above remain exact. Only identity uses NFKC, with mapped prefix bounds.
   -- Offsets are zero-based Unicode code points, matching PostgreSQL/Python, not UTF-16 units.
   for matches in select regexp_matches(identity_text,'(.*?)('||pat||')','gis') loop
    start_at:=cursor_at+char_length(matches[1]); end_at:=start_at+char_length(matches[2]);
    if start_at>=identity_start and end_at<=identity_end then named:=true; exit; end if;
    cursor_at:=end_at;
   end loop;
   if not named then raise exception '产品标题原文完整型号不匹配'; end if;
  end loop;
  s:=r->'field';
  if jsonb_typeof(s->'name') is distinct from 'string' or char_length(s->>'name') not between 1 and 60
   or exists(select 1 from jsonb_object_keys(s) k where k not in ('name','quote','start','end','bbox')) then raise exception '产品参数字段无效'; end if;
 end loop;
 if (select count(distinct (entry.value->>'page')::integer) from jsonb_array_elements(e->'regions') entry(value))>6
  or exists(select 1 from jsonb_array_elements(e->'regions') entry(value) group by entry.value->>'page' having count(*)>4)
  or exists(select 1 from jsonb_array_elements(e->'regions') entry(value) group by entry.value->>'page' having count(distinct jsonb_build_array(entry.value->'page_width',entry.value->'page_height'))>1)
  or exists(select 1 from (select distinct entry.value->>'page' page,entry.value->'panel_bbox' panel,entry.value->>'native_text' body from jsonb_array_elements(e->'regions') entry(value)) u group by page having sum(char_length(body))>2550)
 then raise exception '产品证据页面或原文展示预算超限'; end if;
 if d::text ~* 'sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{20,}\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(password|access_token|service_role|密钥|密码)["[:space:]]*[:=：]'
 then raise exception '知识包疑似含联系方式或凭据，已拒绝'; end if;
end; $$;
revoke all on function public.validate_private_product_page_evidence(jsonb) from public,anon,authenticated;

create or replace function public.validate_private_intelligence(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare part jsonb; k text;
begin
 if d->>'kind'='product' then perform public.validate_private_product_page_evidence(d); return; end if;
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
 if p_kind is not null and p_kind not in ('weekly','daily','evidence','tiktok','instagram','facebook','youtube','product') then raise exception '知识类型无效'; end if;
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
-- Rollback: use a reviewed forward migration to restore the prior validator and retain a
-- bounded compatible reader; legacy untyped reads must exclude product rows if its UI no
-- longer recognizes product keys. Blindly restoring the old untyped reader can break receipts.
-- Restore the 20261023110000 validator/read semantics for the seven old kinds;
-- revoke/drop only these two helper functions after restoring the validator. Retain all product
-- versions and audit logs, original actor/RLS/ACL/sync/receipt and existing read/write budgets.
-- Do not revert the schema by deleting evidence or by widening permissions.
