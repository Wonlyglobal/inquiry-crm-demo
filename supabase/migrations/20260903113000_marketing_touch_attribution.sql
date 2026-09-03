-- MTL phase 3: multi-touch marketing attribution with auditable evidence.

create table if not exists public.inquiry_marketing_touches (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  touch_at timestamptz not null,
  channel text not null,
  program_name text,
  campaign_name text,
  tactic_name text,
  offer_name text,
  landing_page text,
  evidence_note text,
  is_primary boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists inquiry_marketing_touches_inquiry_idx
  on public.inquiry_marketing_touches(inquiry_id,touch_at desc);
create unique index if not exists inquiry_marketing_touches_one_primary_idx
  on public.inquiry_marketing_touches(inquiry_id) where is_primary;

alter table public.inquiry_marketing_touches enable row level security;
drop policy if exists inquiry_marketing_touches_read_scope on public.inquiry_marketing_touches;
create policy inquiry_marketing_touches_read_scope on public.inquiry_marketing_touches for select to authenticated
using (
  exists (
    select 1 from public.inquiries i where i.id=inquiry_id
      and (private.current_crm_role() in ('owner','sales_manager','marketing') or i.owner_id=auth.uid())
  )
);
grant select on public.inquiry_marketing_touches to authenticated;

create or replace function public.add_inquiry_marketing_touch(
  target_inquiry_id uuid,
  touched_at timestamptz,
  touch_channel text,
  program text,
  campaign text,
  tactic text,
  offer text,
  landing_url text,
  evidence text,
  make_primary boolean,
  change_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare touch_id uuid; item public.inquiries;
begin
  if private.current_crm_role() not in ('owner','sales_manager','marketing') then raise exception '仅市场部、主管或老板可维护营销归因'; end if;
  if touched_at is null then raise exception '请选择触点时间'; end if;
  if nullif(trim(touch_channel),'') is null then raise exception '请选择触点渠道'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写新增触点原因'; end if;
  select * into item from public.inquiries where id=target_inquiry_id;
  if not found then raise exception '询盘不存在'; end if;
  if item.excluded_from_dashboard then raise exception '已排除记录不能进入营销归因'; end if;
  if make_primary then update public.inquiry_marketing_touches set is_primary=false where inquiry_id=target_inquiry_id and is_primary; end if;
  insert into public.inquiry_marketing_touches(inquiry_id,touch_at,channel,program_name,campaign_name,tactic_name,offer_name,landing_page,evidence_note,is_primary,created_by)
  values(target_inquiry_id,touched_at,trim(touch_channel),nullif(trim(program),''),nullif(trim(campaign),''),nullif(trim(tactic),''),nullif(trim(offer),''),nullif(trim(landing_url),''),nullif(trim(evidence),''),make_primary,auth.uid())
  returning id into touch_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'marketing_touch_added',trim(change_reason),
    jsonb_build_object('touch_id',touch_id,'touch_at',touched_at,'channel',trim(touch_channel),'program',nullif(trim(program),''),'campaign',nullif(trim(campaign),''),'tactic',nullif(trim(tactic),''),'offer',nullif(trim(offer),''),'landing_page',nullif(trim(landing_url),''),'evidence',nullif(trim(evidence),''),'is_primary',make_primary));
  return touch_id;
end;
$$;

revoke all on function public.add_inquiry_marketing_touch(uuid,timestamptz,text,text,text,text,text,text,text,boolean,text) from public;
grant execute on function public.add_inquiry_marketing_touch(uuid,timestamptz,text,text,text,text,text,text,text,boolean,text) to authenticated;
