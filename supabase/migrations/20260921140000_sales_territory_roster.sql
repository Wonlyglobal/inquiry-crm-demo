-- User supplied 2026-09-21 roster. Business metadata only; never change role/team/active.
begin;
create temporary table territory_roster(name text, english_name text, job_title text, sales_region text, profile_id uuid) on commit drop;
insert into territory_roster values
('李文生','Kevin','大区总监','中东非大区','92acb764-b79a-4129-888e-9e448912371b'),
('刘智','Jackson','国家经理','中东非大区-中东','b151ff3e-192c-4cdb-86a3-3c6a9202afdc'),
('邓盛文','Amanda','管培生','中东非大区-中东',null),
('石奕舒','Alice','客户经理','中东非大区-非洲','a1894570-830d-45b1-8428-5e12dba6c7d6'),
('李亚莹','Lily','管培生','中东非大区-非洲',null),
('陈敏慧','Megan','客户经理','中亚大区','496bcc7e-7404-4188-b088-e03dcf1711a0'),
('唐玉珍','Yuna','客户经理','美洲大区','6752a5db-92d2-4bf9-b521-18e55a9dfcf9'),
('李晨晨','Cheryl','管培生','美洲大区','d3d0eaa6-999c-4335-b737-0ba6805925d3'),
('李浩东','Leon','客户经理','欧洲大区','b364bf30-d379-4abf-9c92-a8fa76a61bb0'),
('王大平','Lawrence','客户经理','东南亚大区-东南亚','ac206ba3-2f20-4089-8483-a7f828a1bbc0'),
('郝晓阳','Shawn','客户经理','东南亚大区-南亚','8d07ab7f-236c-48d7-b9fe-28ecf863bf03'),
('李益邦','Benson','管培生','东南亚大区-南亚','d21758bb-bdcd-4adf-a01e-cb238537a1f7');
do $$
declare r record; p public.profiles; old_person jsonb; new_person jsonb;
begin
 for r in select * from territory_roster loop
  if r.profile_id is not null then
   select * into strict p from public.profiles where id=r.profile_id for update;
   if p.full_name<>r.name then raise exception 'Roster identity mismatch: %',r.name; end if;
   if p.english_name is distinct from r.english_name or p.job_title is distinct from r.job_title then
   update public.profiles set english_name=r.english_name,job_title=r.job_title,updated_at=clock_timestamp() where id=r.profile_id;
   insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
   values(null,'profile',p.id,'sales_roster_metadata_updated',jsonb_build_object('english_name',p.english_name,'job_title',p.job_title),jsonb_build_object('english_name',r.english_name,'job_title',r.job_title),'User authorized 2026-09-21 roster; operator Codex; business metadata only; role, team and active unchanged');
   end if;
  end if;
  select to_jsonb(t) into old_person from public.sales_target_people t where display_name=r.name for update;
  if old_person is not null and old_person->>'profile_id' is distinct from r.profile_id::text then raise exception 'Existing roster account mismatch: %',r.name; end if;
  if old_person->>'sales_region'=r.sales_region and old_person->>'job_title'=r.job_title and old_person->>'department'='海外业务部' and old_person->>'note' like '%2026-09-21 用户区域表%' then continue; end if;
  insert into public.sales_target_people(display_name,profile_id,department,sales_region,job_title,note)
  values(r.name,r.profile_id,'海外业务部',r.sales_region,r.job_title,'2026-09-21 用户区域表；英文名 '||r.english_name) 
  on conflict(display_name) do update set department=excluded.department,sales_region=excluded.sales_region,job_title=excluded.job_title,
  note=concat_ws(E'\n',sales_target_people.note,excluded.note);
  select to_jsonb(t) into new_person from public.sales_target_people t where display_name=r.name;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(null,'sales_target_person',(new_person->>'id')::uuid,'sales_territory_updated',coalesce(old_person,'{}'::jsonb),new_person,'User authorized 2026-09-21 roster; operator Codex; no account creation or security team change');
 end loop;
end $$;
commit;
