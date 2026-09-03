-- MTL phase 5: inquiry-level contact consent, suppression and frequency controls.

create table if not exists public.inquiry_contact_policies (
  inquiry_id uuid primary key references public.inquiries(id) on delete cascade,
  consent_status text not null default 'unknown',
  do_not_contact boolean not null default false,
  min_interval_days integer not null default 7,
  next_allowed_at timestamptz,
  last_contact_at timestamptz,
  policy_note text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default clock_timestamp(),
  constraint inquiry_contact_policy_consent_check check (consent_status in ('unknown','legitimate_interest','opted_in','opted_out')),
  constraint inquiry_contact_policy_interval_check check (min_interval_days between 1 and 90)
);

alter table public.inquiry_contact_policies enable row level security;
drop policy if exists inquiry_contact_policies_read_scope on public.inquiry_contact_policies;
create policy inquiry_contact_policies_read_scope on public.inquiry_contact_policies for select to authenticated
using (exists(select 1 from public.inquiries i where i.id=inquiry_id and (private.current_crm_role() in ('owner','sales_manager','marketing') or i.owner_id=auth.uid())));
grant select on public.inquiry_contact_policies to authenticated;

create or replace function public.save_inquiry_contact_policy(target_inquiry_id uuid, consent text, suppress_contact boolean, interval_days integer, next_contact_at timestamptz, note text, change_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.inquiries; previous public.inquiry_contact_policies;
begin
  select * into item from public.inquiries where id=target_inquiry_id;
  if not found then raise exception '询盘不存在'; end if;
  if private.current_crm_role()='sales' and item.owner_id is distinct from auth.uid() then raise exception '只能维护本人负责询盘的触达规则'; end if;
  if private.current_crm_role() not in ('owner','sales_manager','marketing','sales') then raise exception '当前角色不能维护触达规则'; end if;
  if consent not in ('unknown','legitimate_interest','opted_in','opted_out') then raise exception '请选择有效的同意状态'; end if;
  if interval_days not between 1 and 90 then raise exception '频控间隔必须为 1–90 天'; end if;
  if nullif(trim(change_reason),'') is null then raise exception '请填写修改原因'; end if;
  select * into previous from public.inquiry_contact_policies where inquiry_id=target_inquiry_id;
  insert into public.inquiry_contact_policies(inquiry_id,consent_status,do_not_contact,min_interval_days,next_allowed_at,policy_note,updated_by)
  values(target_inquiry_id,consent,suppress_contact or consent='opted_out',interval_days,next_contact_at,nullif(trim(note),''),auth.uid())
  on conflict(inquiry_id) do update set consent_status=excluded.consent_status,do_not_contact=excluded.do_not_contact,min_interval_days=excluded.min_interval_days,next_allowed_at=excluded.next_allowed_at,policy_note=excluded.policy_note,updated_by=auth.uid(),updated_at=clock_timestamp();
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'contact_policy_updated',trim(change_reason),to_jsonb(previous),jsonb_build_object('consent_status',consent,'do_not_contact',suppress_contact or consent='opted_out','min_interval_days',interval_days,'next_allowed_at',next_contact_at,'policy_note',nullif(trim(note),'')));
end;
$$;

create or replace function public.check_inquiry_contact_allowed(target_inquiry_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare policy public.inquiry_contact_policies;
begin
  select * into policy from public.inquiry_contact_policies where inquiry_id=target_inquiry_id;
  if not found then return jsonb_build_object('allowed',false,'reason','尚未设置触达同意与频控规则'); end if;
  if policy.do_not_contact or policy.consent_status='opted_out' then return jsonb_build_object('allowed',false,'reason','客户已退订或被标记为禁止联系'); end if;
  if policy.consent_status='unknown' then return jsonb_build_object('allowed',false,'reason','客户联系依据尚未确认'); end if;
  if policy.next_allowed_at is not null and policy.next_allowed_at>clock_timestamp() then return jsonb_build_object('allowed',false,'reason','尚未到允许再次触达时间','next_allowed_at',policy.next_allowed_at); end if;
  return jsonb_build_object('allowed',true,'reason','触达规则校验通过');
end;
$$;

create or replace function public.record_inquiry_marketing_contact(target_inquiry_id uuid, contact_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare policy public.inquiry_contact_policies; occurred_at timestamptz:=clock_timestamp();
begin
  select * into policy from public.inquiry_contact_policies where inquiry_id=target_inquiry_id for update;
  if not found then raise exception '尚未设置触达规则'; end if;
  if not coalesce((public.check_inquiry_contact_allowed(target_inquiry_id)->>'allowed')::boolean,false) then raise exception '%',public.check_inquiry_contact_allowed(target_inquiry_id)->>'reason'; end if;
  update public.inquiry_contact_policies set last_contact_at=occurred_at,next_allowed_at=occurred_at+make_interval(days=>policy.min_interval_days),updated_by=auth.uid(),updated_at=occurred_at where inquiry_id=target_inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,reason,before_data,after_data)
  values(auth.uid(),'inquiry',target_inquiry_id,'marketing_contact_recorded',coalesce(nullif(trim(contact_reason),''),'发送开发信'),jsonb_build_object('last_contact_at',policy.last_contact_at,'next_allowed_at',policy.next_allowed_at),jsonb_build_object('last_contact_at',occurred_at,'next_allowed_at',occurred_at+make_interval(days=>policy.min_interval_days)));
end;
$$;

revoke all on function public.save_inquiry_contact_policy(uuid,text,boolean,integer,timestamptz,text,text) from public;
revoke all on function public.check_inquiry_contact_allowed(uuid) from public;
revoke all on function public.record_inquiry_marketing_contact(uuid,text) from public;
grant execute on function public.save_inquiry_contact_policy(uuid,text,boolean,integer,timestamptz,text,text) to authenticated;
grant execute on function public.check_inquiry_contact_allowed(uuid) to authenticated;
grant execute on function public.record_inquiry_marketing_contact(uuid,text) to authenticated;
