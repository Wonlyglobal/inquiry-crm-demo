-- Company-level research staging only. Never inserts inquiries or personal leads on import.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.record_sales_leads(jsonb,text)'::regprocedure))<>'e0eb3b12d4fda7217d33dcfb41bc7154'
 or md5(pg_get_functiondef('private.sales_lead_actor()'::regprocedure))<>'b395ab92c0d753653867f5ad69e5ce07' then raise exception '线索入口或角色边界已变化，停止迁移并重新核对'; end if;
end $$;
create table private.company_candidates(
 id uuid primary key default gen_random_uuid(), external_id text not null,
 company_candidate text not null,country_candidate text not null,country_key text not null,name_key text not null,
 country_code text not null default '',region_candidate text not null default '',city_candidate text not null default '',
 category_candidate text not null default '',website_candidate text not null default '',domain_key text not null default '',
 source_url text not null,source_kind text not null,source_snapshot_date text not null,
 review_status text not null default 'pending' check(review_status in('pending','verified','rejected')),
 official_url text,review_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 imported_by uuid not null references public.profiles(id),imported_at timestamptz not null default clock_timestamp(),
 claimed_by uuid references public.profiles(id),claimed_at timestamptz,lead_id uuid references private.sales_leads(id),
 unique(external_id),unique(country_key,name_key)
);
create unique index candidate_country_domain on private.company_candidates(country_key,domain_key) where domain_key<>'';
create table private.company_candidate_sources(
 candidate_id uuid not null references private.company_candidates(id),source_url text not null,source_kind text not null,
 snapshot_date text not null,added_by uuid not null,added_at timestamptz not null default clock_timestamp(),
 primary key(candidate_id,source_url,snapshot_date)
);
create table private.company_candidate_batches(
 id uuid primary key,actor_id uuid not null,input_hash text not null,receipt jsonb not null,at timestamptz not null default clock_timestamp()
);
create table private.company_candidate_events(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null,candidate_id uuid,
 action text not null,at timestamptz not null default clock_timestamp(),details jsonb not null
);
alter table private.company_candidates enable row level security;
alter table private.company_candidate_sources enable row level security;
alter table private.company_candidate_batches enable row level security;
alter table private.company_candidate_events enable row level security;
revoke all on private.company_candidates,private.company_candidate_sources,private.company_candidate_batches,private.company_candidate_events from public,anon,authenticated,service_role;
create trigger company_candidate_events_immutable before update or delete on private.company_candidate_events for each row execute function private.reject_risk_event_mutation();
create trigger company_candidate_batches_immutable before update or delete on private.company_candidate_batches for each row execute function private.reject_risk_event_mutation();
create trigger company_candidate_sources_immutable before update or delete on private.company_candidate_sources for each row execute function private.reject_risk_event_mutation();

create function private.candidate_key(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(btrim(coalesce(value,''))),'[[:space:][:punct:]]','','g')
$$;
create function private.candidate_domain(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(substring(lower(btrim(coalesce(value,''))) from '^https://([^/:?#]+)')),'^www[.]','','i')
$$;
create function private.candidate_public_url(value text,optional boolean default false) returns boolean language sql immutable set search_path='' as $$
 select case when optional and coalesce(value,'')='' then true else
 coalesce(value,'') ~* '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.]([A-Za-z]{2,}|xn--[A-Za-z0-9-]{2,})(/[^[:space:]<>]*)?$'
 and coalesce(value,'') !~* 'google[[:space:]]*maps|maps[.]google|google[.][^/]+/maps|g[.]page|@|%40|[?#]'
 and coalesce(private.candidate_domain(value),'') not in('gmail.com','mail.ru','web3forms.com','outlook.com','yahoo.com','hotmail.com') end
$$;
-- Returns only existing responsible people, never customer/contact/trade content.
create function private.candidate_existing_owners(item private.company_candidates) returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct x.owner_id),'{}'::uuid[]) from (
  select case when l.inquiry_id is null then l.sales_id else i.owner_id end owner_id from private.sales_leads l left join public.inquiries i on i.id=l.inquiry_id
  where private.candidate_key(l.company)=item.name_key and private.candidate_key(l.country)=item.country_key
  union select i.owner_id from public.inquiries i join public.companies c on c.id=i.company_id
  where not coalesce(i.is_test_data,false) and i.data_environment='production'
  and ((private.candidate_key(c.name)=item.name_key and private.candidate_key(c.country)=item.country_key)
   or (item.domain_key<>'' and private.candidate_domain(case when c.domain ~ '^https?://' then regexp_replace(c.domain,'^http://','https://') else 'https://'||c.domain end)=item.domain_key))
 ) x left join public.profiles p on p.id=x.owner_id
 where x.owner_id is null or (p.id is not null and not coalesce(p.is_test_data,false) and p.data_environment='production')
$$;

create function private.candidate_rate(action_name text,cap integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('candidate-actor:'||auth.uid()::text,0));
 if (select count(*) from private.company_candidate_events where actor_id=auth.uid() and action=action_name and at>clock_timestamp()-interval '1 minute')>=cap then raise exception '候选操作过于频繁，请稍后再试'; end if;
end $$;
revoke all on function private.candidate_rate(text,integer) from public,anon,authenticated,service_role;

create function public.import_company_candidates(rows jsonb,batch_id uuid,batch_label text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();r jsonb;c private.company_candidates;old private.company_candidate_batches;
 n integer:=0;added integer:=0;dedup integer:=0;conflicts integer;receipt jsonb;ck text;nk text;dk text;h text:=md5(rows::text);
begin
 if a.role not in('owner','marketing') then raise exception '仅市场部或老板可导入公司级候选'; end if;
 if batch_id is null or length(btrim(coalesce(batch_label,''))) not between 2 and 120 or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 or length(rows::text)>500000 then raise exception '每批1—200条公司级候选，需批次名称'; end if;
 perform pg_advisory_xact_lock(hashtextextended('company-candidate-import',0));
 select * into old from private.company_candidate_batches where id=batch_id;
 if old.id is not null then
  if old.actor_id<>a.id or old.input_hash<>h then raise exception '导入批次与原内容不一致'; end if;
  return old.receipt;
 end if;
 perform private.candidate_rate('imported',20);
 for r in select value from jsonb_array_elements(rows) loop
  n:=n+1;
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in('lead_id','company_candidate','country_candidate','country_code','region_candidate','city_candidate','category_candidate','website_candidate','source_url','source_kind','review_status','current_status','source_snapshot_date')) then raise exception '第%条含非公司级字段，禁止导入联系方式或私人备注',n; end if;
  if length(btrim(coalesce(r->>'company_candidate',''))) not between 2 and 300 or length(btrim(coalesce(r->>'country_candidate',''))) not between 2 and 100
   or length(coalesce(r->>'lead_id','')) not between 8 and 80 or length(r::text)>6000
   or length(coalesce(r->>'source_snapshot_date','')) not between 4 and 40
   or length(coalesce(r->>'country_code',''))>20 or length(coalesce(r->>'region_candidate',''))>100 or length(coalesce(r->>'city_candidate',''))>150 or length(coalesce(r->>'category_candidate',''))>300 or length(coalesce(r->>'source_url',''))>2000 or length(coalesce(r->>'website_candidate',''))>1000
   or coalesce(r->>'source_kind','') not in('company_site_candidate','third_party_source_candidate','customs_record_candidate')
   or not private.candidate_public_url(r->>'source_url') or not private.candidate_public_url(coalesce(r->>'website_candidate',''),true)
   or concat_ws(' ',r->>'company_candidate',r->>'country_candidate',r->>'country_code',r->>'region_candidate',r->>'city_candidate',r->>'category_candidate') ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|[+][0-9][0-9 ()-]{7,}'
   then raise exception '第%条公司、国家或公开HTTPS来源不正确，不能含邮箱',n; end if;
  ck:=private.candidate_key(r->>'country_candidate');nk:=private.candidate_key(r->>'company_candidate');dk:=coalesce(private.candidate_domain(r->>'website_candidate'),'');
  if ck='' or nk='' then raise exception '第%条公司或国家不能只填符号',n; end if;
  select count(*) into conflicts from private.company_candidates x where x.external_id=r->>'lead_id' or (x.country_key=ck and (x.name_key=nk or (dk<>'' and x.domain_key=dk)));
  if conflicts>1 then raise exception '第%条公司名与域名指向不同候选，需人工核对，未合并',n; end if;
  select * into c from private.company_candidates x where x.external_id=r->>'lead_id' or (x.country_key=ck and (x.name_key=nk or (dk<>'' and x.domain_key=dk))) limit 1;
  if c.id is not null then
   if c.country_key<>ck or c.name_key<>nk or (dk<>'' and c.domain_key<>'' and dk<>c.domain_key) then raise exception '第%条公司名称与域名身份冲突，未自动合并，需人工核对',n; end if;
   dedup:=dedup+1;
  else
   insert into private.company_candidates(external_id,company_candidate,country_candidate,country_key,name_key,country_code,region_candidate,city_candidate,category_candidate,website_candidate,domain_key,source_url,source_kind,source_snapshot_date,imported_by)
   values(r->>'lead_id',btrim(r->>'company_candidate'),btrim(r->>'country_candidate'),ck,nk,coalesce(r->>'country_code',''),coalesce(r->>'region_candidate',''),coalesce(r->>'city_candidate',''),coalesce(r->>'category_candidate',''),coalesce(r->>'website_candidate',''),dk,r->>'source_url',r->>'source_kind',r->>'source_snapshot_date',a.id) returning * into c;
   added:=added+1;
  end if;
  insert into private.company_candidate_sources(candidate_id,source_url,source_kind,snapshot_date,added_by) values(c.id,r->>'source_url',r->>'source_kind',r->>'source_snapshot_date',a.id) on conflict do nothing;
 end loop;
 receipt:=jsonb_build_object('batch_id',batch_id,'processed',n,'added',added,'deduplicated',dedup,'recorded_at',clock_timestamp());
 insert into private.company_candidate_batches(id,actor_id,input_hash,receipt) values(batch_id,a.id,h,receipt);
 insert into private.company_candidate_events(actor_id,action,details) values(a.id,'imported',receipt||jsonb_build_object('label',btrim(batch_label)));
 return receipt;
end $$;

create function public.company_candidate_workspace(search_text text default '',state_filter text default 'all',page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();c private.company_candidates;owners uuid[];masked boolean;item_state text;items jsonb:='[]';total integer:=0;pending integer:=0;verified integer:=0;names text;
begin
 if length(coalesce(search_text,''))>100 or page_offset<0 or page_offset>10000 or state_filter not in('all','pending','verified','rejected','claimed','promoted','existing','mine') then raise exception '筛选条件不正确'; end if;
 perform private.candidate_rate('workspace_read',60);
 for c in select * from private.company_candidates order by imported_at desc,id loop
  owners:=private.candidate_existing_owners(c);
  if c.claimed_by is not null and cardinality(owners)=0 then owners:=array_append(owners,c.claimed_by); end if;
  masked:=cardinality(owners)>0 and a.role<>'owner' and not coalesce(a.id=any(owners),false);
  item_state:=case when c.lead_id is not null then 'promoted' when c.claimed_by is not null then 'claimed' when cardinality(owners)>0 then 'existing' else c.review_status end;
  -- No company/source/country search oracle for masked rows.
  if masked and btrim(coalesce(search_text,''))<>'' then continue; end if;
  if not masked and btrim(coalesce(search_text,''))<>'' and position(lower(btrim(search_text)) in lower(c.company_candidate||' '||c.country_candidate||' '||c.website_candidate))=0 then continue; end if;
  if state_filter='mine' and not coalesce(a.id=any(owners),false) then continue; end if;
  if state_filter not in('all','mine') and state_filter<>item_state then continue; end if;
  total:=total+1;
  if item_state='pending' then pending:=pending+1; end if;
  if item_state='verified' then verified:=verified+1; end if;
  if total<=page_offset or total>page_offset+50 then continue; end if;
  if masked then
   select string_agg(distinct p.full_name,'、' order by p.full_name) into names from public.profiles p where p.id=any(owners);
   items:=items||jsonb_build_array(jsonb_build_object('masked',true,'state',item_state,'responsible_name',coalesce(names,'已有客户，待主管分配')));
  else
   items:=items||jsonb_build_array(jsonb_build_object('id',c.id,'masked',false,'state',item_state,'company',c.company_candidate,'country',c.country_candidate,'website',c.website_candidate,'category',c.category_candidate,'source_url',c.source_url,'source_kind',c.source_kind,'snapshot_date',c.source_snapshot_date,'review_note',c.review_note,'official_url',c.official_url,'reviewed_at',c.reviewed_at,'claimed_at',c.claimed_at,'mine',c.claimed_by=a.id and coalesce(a.id=any(owners),false),'lead_id',case when c.claimed_by=a.id and coalesce(a.id=any(owners),false) then c.lead_id else null end,'existing',cardinality(private.candidate_existing_owners(c))>0,'can_review',a.role in('owner','marketing') and cardinality(owners)=0,'can_claim',a.role='sales' and c.review_status='verified' and cardinality(owners)=0));
  end if;
 end loop;
 insert into private.company_candidate_events(actor_id,action,details) values(a.id,'workspace_read',jsonb_build_object('filter',state_filter,'offset',page_offset,'returned',jsonb_array_length(items)));
 return jsonb_build_object('actor',jsonb_build_object('id',a.id,'role',a.role),'items',items,'total',total,'pending',pending,'verified',verified,'offset',page_offset,'as_of',clock_timestamp());
end $$;

create function public.review_company_candidate(target_id uuid,decision text,official_url text,evidence_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();c private.company_candidates;owners uuid[];
begin
 if a.role not in('owner','marketing') then raise exception '仅市场部或老板可提交公司核验'; end if;
 if decision not in('verified','rejected','pending') or length(btrim(coalesce(evidence_note,''))) not between 4 and 800 or not private.candidate_public_url(official_url,decision<>'verified') or evidence_note ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}' then raise exception '需填写公司公开依据；确认通过须提供已核对的官网，不填联系方式'; end if;
 perform private.candidate_rate('reviewed',30);
 select * into c from private.company_candidates where id=target_id for update;
 if c.id is null then raise exception '候选不存在'; end if;
 owners:=private.candidate_existing_owners(c);
 if c.claimed_by is not null or c.lead_id is not null or (cardinality(owners)>0 and a.role<>'owner') then raise exception '候选已有人维护，不可修改核验状态'; end if;
 update private.company_candidates set review_status=decision,official_url=review_company_candidate.official_url,review_note=btrim(evidence_note),reviewed_by=a.id,reviewed_at=clock_timestamp() where id=c.id;
 insert into private.company_candidate_events(actor_id,candidate_id,action,details) values(a.id,c.id,'reviewed',jsonb_build_object('before',c.review_status,'after',decision,'official_url',official_url,'note',btrim(evidence_note)));
 return jsonb_build_object('id',c.id,'state',decision,'reviewed_at',clock_timestamp());
end $$;

create function public.claim_company_candidate(target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();c private.company_candidates;
begin
 if a.role<>'sales' then raise exception '仅业务员本人可领取已核实候选'; end if;
 perform private.candidate_rate('claimed',30);
 select * into c from private.company_candidates where id=target_id for update;
 if c.id is null then raise exception '候选不存在'; end if;
 if c.claimed_by=a.id then return jsonb_build_object('id',c.id,'claimed_at',c.claimed_at,'deduplicated',true); end if;
 if c.review_status<>'verified' or c.claimed_by is not null or cardinality(private.candidate_existing_owners(c))>0 then raise exception '候选尚未核实或已有负责人，不可重复领取'; end if;
 update private.company_candidates set claimed_by=a.id,claimed_at=clock_timestamp() where id=c.id;
 insert into private.company_candidate_events(actor_id,candidate_id,action,details) values(a.id,c.id,'claimed','{}');
 return jsonb_build_object('id',c.id,'claimed_at',clock_timestamp());
end $$;

create function public.promote_company_candidate(target_id uuid,demand text,acquired_on date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();c private.company_candidates;owners uuid[];receipt jsonb;lead uuid;
begin
 if a.role<>'sales' then raise exception '仅领取人本人可补充需求转为个人线索'; end if;
 perform private.candidate_rate('promoted',30);
 select * into c from private.company_candidates where id=target_id for update;
 if c.id is null or c.claimed_by is distinct from a.id or c.review_status<>'verified' then raise exception '候选未核验或不属于本人'; end if;
 owners:=private.candidate_existing_owners(c);
 if cardinality(owners)>0 and not coalesce(a.id=any(owners),false) then raise exception '公司已由其他负责人维护或等待主管分配'; end if;
 if c.lead_id is not null then return jsonb_build_object('lead_id',c.lead_id,'deduplicated',true); end if;
 if cardinality(owners)>0 then raise exception '公司已录入客户线索，请核对原记录，不可重复计入'; end if;
 if length(btrim(coalesce(demand,''))) not between 4 and 10000 then raise exception '请补充真实需求或下一步跟进方向，至少4字'; end if;
 receipt:=public.record_sales_leads(jsonb_build_array(jsonb_build_object('request_id',c.id,'company',c.company_candidate,'contact','','country',c.country_candidate,'email','','phone','','source','other','demand',btrim(demand),'acquired_on',acquired_on)),'manual');
 lead:=(receipt->0->>'id')::uuid;
 if not exists(select 1 from private.sales_leads l where l.id=lead and l.sales_id=a.id and private.candidate_key(l.company)=c.name_key and private.candidate_key(l.country)=c.country_key and l.demand=btrim(promote_company_candidate.demand)) then raise exception '个人线索归属或回执内容核对失败'; end if;
 update private.company_candidates set lead_id=lead where id=c.id;
 insert into private.company_candidate_events(actor_id,candidate_id,action,details) values(a.id,c.id,'promoted',jsonb_build_object('lead_id',lead,'receipt',receipt));
 return jsonb_build_object('lead_id',lead,'receipt',receipt);
end $$;
revoke all on function private.candidate_key(text),private.candidate_domain(text),private.candidate_public_url(text,boolean),private.candidate_existing_owners(private.company_candidates) from public,anon,authenticated,service_role;
revoke all on function public.import_company_candidates(jsonb,uuid,text),public.company_candidate_workspace(text,text,integer),public.review_company_candidate(uuid,text,text,text),public.claim_company_candidate(uuid),public.promote_company_candidate(uuid,text,date) from public,anon,service_role;
grant execute on function public.import_company_candidates(jsonb,uuid,text),public.company_candidate_workspace(text,text,integer),public.review_company_candidate(uuid,text,text,text),public.claim_company_candidate(uuid),public.promote_company_candidate(uuid,text,date) to authenticated;
notify pgrst,'reload schema';
commit;
