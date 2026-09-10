-- Persist and atomically review won-deal applications with server-side evidence validation.

create table if not exists public.inquiry_won_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  won_amount numeric(18,2) not null check (won_amount>0),
  won_currency text not null check (won_currency ~ '^[A-Z]{3}$'),
  evidence_bucket text not null default 'research-attachments',
  evidence_path text not null,
  evidence_name text not null,
  request_reason text not null check (length(trim(request_reason))>=2),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  locked_exchange_rate numeric(18,8),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists inquiry_won_one_pending_idx on public.inquiry_won_requests(inquiry_id) where status='pending';
create index if not exists inquiry_won_review_idx on public.inquiry_won_requests(status,created_at) where status='pending';
alter table public.inquiry_won_requests enable row level security;
drop policy if exists inquiry_won_requests_read on public.inquiry_won_requests;
create policy inquiry_won_requests_read on public.inquiry_won_requests for select to authenticated
using (requested_by=(select auth.uid()) or private.current_crm_role() in ('owner','sales_manager'));
grant select on public.inquiry_won_requests to authenticated;
grant select,insert,update,delete on public.inquiry_won_requests to service_role;

create or replace function public.request_inquiry_won(target_inquiry_id uuid,amount numeric,currency text,evidence_path text,evidence_name text,request_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.inquiries; request_id uuid; normalized_currency text:=upper(trim(currency)); manager record;
begin
  if private.current_crm_role()<>'sales' then raise exception '仅业务员可提交成交申请'; end if;
  if amount is null or amount<=0 then raise exception '成交金额必须大于 0'; end if;
  if normalized_currency !~ '^[A-Z]{3}$' then raise exception '成交币种必须为三位代码'; end if;
  if nullif(trim(request_reason),'') is null then raise exception '请填写成交申请说明'; end if;
  select * into item from public.inquiries where id=target_inquiry_id for update;
  if not found or item.owner_id is distinct from auth.uid() then raise exception '只能提交本人负责商机的成交申请'; end if;
  if item.validity<>'valid' or item.status in ('won','lost') then raise exception '当前商机不能提交成交申请'; end if;
  if evidence_path not like target_inquiry_id::text||'/'||auth.uid()::text||'/%' then raise exception '成交凭证路径与申请人不匹配'; end if;
  if not exists(select 1 from storage.objects where bucket_id='research-attachments' and name=evidence_path) then raise exception '成交凭证文件不存在'; end if;
  if exists(select 1 from public.inquiry_won_requests where inquiry_id=target_inquiry_id and status='pending') then raise exception '该商机已有待审核成交申请'; end if;
  insert into public.inquiry_won_requests(inquiry_id,requested_by,won_amount,won_currency,evidence_path,evidence_name,request_reason)
  values(target_inquiry_id,auth.uid(),amount,normalized_currency,evidence_path,trim(evidence_name),trim(request_reason)) returning id into request_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',target_inquiry_id,'won_requested',jsonb_build_object('status',item.status),jsonb_build_object('requested_status','won','request_id',request_id,'won_amount',amount,'won_currency',normalized_currency,'evidence_path',evidence_path,'evidence_name',trim(evidence_name)),trim(request_reason));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body) values(manager.id,target_inquiry_id,'won_approval_requested','新的成交申请待审核',normalized_currency||' '||amount::text||' · '||trim(request_reason));
  end loop;
  return request_id;
end $$;

create or replace function public.review_inquiry_won(target_request_id uuid,approve boolean,review_comment text)
returns void language plpgsql security definer set search_path='' as $$
declare req public.inquiry_won_requests; item public.inquiries; locked_rate numeric; locked_at timestamptz:=clock_timestamp();
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核成交申请'; end if;
  if nullif(trim(review_comment),'') is null then raise exception '请填写审核意见'; end if;
  select * into req from public.inquiry_won_requests where id=target_request_id for update;
  if not found or req.status<>'pending' then raise exception '当前没有待审核的成交申请'; end if;
  select * into item from public.inquiries where id=req.inquiry_id for update;
  if approve then
    if not exists(select 1 from storage.objects where bucket_id=req.evidence_bucket and name=req.evidence_path) then raise exception '成交凭证文件已不存在'; end if;
    if req.won_currency='CNY' then locked_rate:=1; else
      select rate into locked_rate from public.exchange_rates where base_currency=req.won_currency and quote_currency='CNY' order by rate_date desc limit 1;
    end if;
    if locked_rate is null or locked_rate<=0 then raise exception '缺少该币种兑人民币汇率'; end if;
    perform set_config('app.inquiry_workflow_rpc','on',true);
    update public.inquiries set status='won',won_amount=req.won_amount,won_currency=req.won_currency,won_exchange_rate=locked_rate,won_at=locked_at,next_follow_up_at=null,updated_by=auth.uid(),last_change_reason='主管确认成交：'||trim(review_comment),updated_at=locked_at where id=req.inquiry_id;
  end if;
  update public.inquiry_won_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),review_note=trim(review_comment),reviewed_at=locked_at,locked_exchange_rate=case when approve then locked_rate else null end,updated_at=locked_at where id=req.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'inquiry',req.inquiry_id,case when approve then 'won_approved' else 'won_rejected' end,jsonb_build_object('status',item.status,'request_id',req.id),jsonb_build_object('status',case when approve then 'won' else item.status::text end,'request_id',req.id,'won_amount',req.won_amount,'won_currency',req.won_currency,'evidence_reviewed',approve),trim(review_comment));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(req.requested_by,req.inquiry_id,case when approve then 'won_approval_approved' else 'won_approval_rejected' end,case when approve then '成交申请已通过' else '成交申请被驳回' end,trim(review_comment));
end $$;

revoke all on function public.request_inquiry_won(uuid,numeric,text,text,text,text) from public,anon;
revoke all on function public.review_inquiry_won(uuid,boolean,text) from public,anon;
grant execute on function public.request_inquiry_won(uuid,numeric,text,text,text,text) to authenticated;
grant execute on function public.review_inquiry_won(uuid,boolean,text) to authenticated;
