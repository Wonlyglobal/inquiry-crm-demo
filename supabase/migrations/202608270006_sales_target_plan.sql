-- Imported 2026 overseas division target plans from the user-provided source tables.
-- Rows are append-only revisions: corrections create a new revision and retain the
-- previous value, editor, timestamp, reason and source reference.
create table if not exists public.sales_target_people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  profile_id uuid references public.profiles(id),
  department text not null,
  sales_region text not null,
  job_title text,
  note text,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sales_target_plan_items (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.sales_target_people(id),
  target_year smallint not null check (target_year between 2000 and 2100),
  target_month smallint not null check (target_month between 1 and 12),
  metric text not null check (metric in ('contract_count','customer_development','crm_collection')),
  target_value numeric(18,2) not null check (target_value >= 0),
  revision integer not null default 1 check (revision > 0),
  is_current boolean not null default true,
  source_label text not null,
  change_reason text not null,
  changed_by uuid references public.profiles(id),
  previous_item_id uuid references public.sales_target_plan_items(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (person_id,target_year,target_month,metric,revision)
);

alter table public.sales_target_people enable row level security;
alter table public.sales_target_plan_items enable row level security;
drop policy if exists sales_target_people_read on public.sales_target_people;
drop policy if exists sales_target_plan_items_read on public.sales_target_plan_items;
drop policy if exists sales_target_people_write on public.sales_target_people;
drop policy if exists sales_target_plan_items_insert on public.sales_target_plan_items;
create policy sales_target_people_read on public.sales_target_people for select to authenticated using (true);
create policy sales_target_plan_items_read on public.sales_target_plan_items for select to authenticated using (true);
create policy sales_target_people_write on public.sales_target_people for all to authenticated
  using (private.current_crm_role() in ('owner','sales_manager'))
  with check (private.current_crm_role() in ('owner','sales_manager'));
create policy sales_target_plan_items_insert on public.sales_target_plan_items for insert to authenticated
  with check (private.current_crm_role() in ('owner','sales_manager'));
grant select,insert,update on public.sales_target_people to authenticated;
grant select,insert on public.sales_target_plan_items to authenticated;

insert into public.sales_target_people(display_name,profile_id,department,sales_region,job_title,note)
values
  ('李文生',(select id from public.profiles where full_name='李文生' limit 1),'海外业务部','中东非大区','中东非大区总监',null),
  ('刘智',(select id from public.profiles where full_name='刘智' limit 1),'海外业务部','中东非大区','国家经理','7月入职'),
  ('石奕舒',(select id from public.profiles where full_name in ('石奕舒','石舒') order by full_name='石奕舒' desc limit 1),'海外业务部','中东非大区','客户经理','源表姓名已统一为石奕舒；6月入职'),
  ('陈敏慧',(select id from public.profiles where full_name='陈敏慧' limit 1),'海外业务部','中亚大区','客户经理',null),
  ('李浩东',(select id from public.profiles where full_name='李浩东' limit 1),'海外业务部','中亚大区','客户经理','8月转岗'),
  ('唐玉珍',(select id from public.profiles where full_name='唐玉珍' limit 1),'海外业务部','中亚大区','客户经理','7月入职'),
  ('王大平',(select id from public.profiles where full_name='王大平' limit 1),'海外业务部','东南亚大区','客户经理','7月入职'),
  ('郝晓阳',(select id from public.profiles where full_name='郝晓阳' limit 1),'海外业务部','东南亚大区','客户经理','7月入职')
on conflict(display_name) do update set profile_id=excluded.profile_id,department=excluded.department,sales_region=excluded.sales_region,job_title=excluded.job_title,note=excluded.note;

with source(display_name,metric,vals) as (values
 ('李文生','contract_count',array[0,0,0,0,0,0,25,50,50,75,100,100]::numeric[]),
 ('刘智','contract_count',array[0,0,0,0,0,0,0,25,25,25,50,50]::numeric[]),
 ('石奕舒','contract_count',array[0,0,0,0,0,0,25,25,25,50,50,50]::numeric[]),
 ('陈敏慧','contract_count',array[5,5,15,35,40,45,52,52,52,57,57,57]::numeric[]),
 ('李浩东','contract_count',array[0,0,0,0,0,0,25,25,25,50,50,50]::numeric[]),
 ('唐玉珍','contract_count',array[0,0,0,0,0,0,0,25,25,25,50,50]::numeric[]),
 ('王大平','contract_count',array[0,0,0,0,0,0,0,25,25,25,50,50]::numeric[]),
 ('郝晓阳','contract_count',array[0,0,0,0,0,0,0,25,25,25,50,50]::numeric[]),
 ('李文生','customer_development',array[0,0,0,0,0,0,1,2,2,3,3,3]::numeric[]),
 ('刘智','customer_development',array[0,0,0,0,0,0,0,1,1,1,1,1]::numeric[]),
 ('石奕舒','customer_development',array[0,0,0,0,0,0,1,1,1,2,2,2]::numeric[]),
 ('陈敏慧','customer_development',array[0,0,0,0,0,1,1,1,1,1,2,2]::numeric[]),
 ('李浩东','customer_development',array[0,0,0,0,0,0,1,1,1,1,1,1]::numeric[]),
 ('唐玉珍','customer_development',array[0,0,0,0,0,0,0,1,1,1,2,2]::numeric[]),
 ('王大平','customer_development',array[0,0,0,0,0,0,0,1,1,1,2,2]::numeric[]),
 ('郝晓阳','customer_development',array[0,0,0,0,0,0,0,1,1,1,1,1]::numeric[]),
 ('李文生','crm_collection',array[0,0,0,0,0,0,30,60,60,60,60,60]::numeric[]),
 ('刘智','crm_collection',array[0,0,0,0,0,0,0,30,30,30,30,30]::numeric[]),
 ('石奕舒','crm_collection',array[0,0,0,0,0,0,30,30,30,30,30,30]::numeric[]),
 ('陈敏慧','crm_collection',array[0,0,0,0,0,15,15,15,15,30,30,30]::numeric[]),
 ('李浩东','crm_collection',array[0,0,0,0,0,0,30,30,30,30,30,30]::numeric[]),
 ('唐玉珍','crm_collection',array[0,0,0,0,0,0,0,30,30,30,30,30]::numeric[]),
 ('王大平','crm_collection',array[0,0,0,0,0,0,0,30,30,30,30,30]::numeric[]),
 ('郝晓阳','crm_collection',array[0,0,0,0,0,0,0,30,30,30,30,30]::numeric[])
), expanded as (
 select p.id person_id,s.metric,m.month_no,m.val target_value
 from source s join public.sales_target_people p on p.display_name=s.display_name
 cross join lateral unnest(s.vals) with ordinality as m(val,month_no)
)
insert into public.sales_target_plan_items(person_id,target_year,target_month,metric,target_value,source_label,change_reason)
select person_id,2026,month_no,metric,target_value,'目标文件夹截图（2026海外事业部指标）','首次导入用户提供的年度目标表'
from expanded where target_value>0
on conflict(person_id,target_year,target_month,metric,revision) do nothing;
