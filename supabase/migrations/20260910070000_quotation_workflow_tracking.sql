-- Secure quotation approval transitions and connect customer replies to the sent version.

alter table public.quotation_versions
  add column if not exists submitted_at timestamptz,
  add column if not exists submission_note text,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_message_id uuid references public.email_messages(id) on delete set null,
  add column if not exists customer_replied_at timestamptz,
  add column if not exists customer_reply_message_id uuid references public.email_messages(id) on delete set null;

create index if not exists quotation_versions_sent_reply_idx
  on public.quotation_versions(inquiry_id,sent_at desc)
  where status='sent';

drop policy if exists quotation_versions_update on public.quotation_versions;
drop policy if exists quotation_versions_update_managers on public.quotation_versions;
create policy quotation_versions_update_managers on public.quotation_versions for update to authenticated
using (private.current_crm_role() in ('owner','sales_manager'))
with check (private.current_crm_role() in ('owner','sales_manager'));

create or replace function public.submit_quotation_for_approval(target_quotation_id uuid,submit_note text)
returns void language plpgsql security definer set search_path='' as $$
declare quote public.quotation_versions; manager record;
begin
  if nullif(trim(submit_note),'') is null then raise exception '请填写提交审核说明'; end if;
  select q.* into quote from public.quotation_versions q join public.inquiries i on i.id=q.inquiry_id
  where q.id=target_quotation_id and (q.created_by=auth.uid() or i.owner_id=auth.uid()) for update of q;
  if not found then raise exception '只能提交本人创建或负责客户的报价'; end if;
  if quote.status not in ('draft','rejected') then raise exception '当前报价状态不能提交审核'; end if;
  update public.quotation_versions set status='pending_approval',submitted_at=clock_timestamp(),submission_note=trim(submit_note),reviewed_by=null,reviewed_at=null,review_note=null,updated_at=clock_timestamp() where id=quote.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'quotation',quote.id,'quotation_submitted',jsonb_build_object('status',quote.status),jsonb_build_object('status','pending_approval','inquiry_id',quote.inquiry_id),trim(submit_note));
  for manager in select id from public.profiles where role in ('owner','sales_manager') and active loop
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(manager.id,quote.inquiry_id,'quotation_review_requested','报价待审核',coalesce(quote.quote_no,'V'||quote.version_no)||' · '||trim(submit_note));
  end loop;
end $$;

create or replace function public.review_quotation(target_quotation_id uuid,approve boolean,review_note text)
returns void language plpgsql security definer set search_path='' as $$
declare quote public.quotation_versions;
begin
  if private.current_crm_role() not in ('owner','sales_manager') then raise exception '仅主管或老板可审核报价'; end if;
  if nullif(trim($3),'') is null then raise exception '请填写审核意见'; end if;
  select * into quote from public.quotation_versions where id=target_quotation_id for update;
  if not found or quote.status<>'pending_approval' then raise exception '当前没有待审核的报价'; end if;
  update public.quotation_versions set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=trim($3),updated_at=clock_timestamp() where id=quote.id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'quotation',quote.id,case when approve then 'quotation_approved' else 'quotation_rejected' end,jsonb_build_object('status','pending_approval'),jsonb_build_object('status',case when approve then 'approved' else 'rejected' end,'inquiry_id',quote.inquiry_id),trim($3));
  insert into public.notifications(recipient_id,inquiry_id,type,title,body)
  values(quote.created_by,quote.inquiry_id,case when approve then 'quotation_approved' else 'quotation_rejected' end,case when approve then '报价已批准' else '报价被驳回' end,coalesce(quote.quote_no,'V'||quote.version_no)||' · '||trim($3));
end $$;

create or replace function public.mark_quotation_sent(target_quotation_id uuid,target_message_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare quote public.quotation_versions; sent_time timestamptz:=clock_timestamp();
begin
  select q.* into quote from public.quotation_versions q join public.inquiries i on i.id=q.inquiry_id
  where q.id=target_quotation_id and (i.owner_id=auth.uid() or q.created_by=auth.uid() or private.current_crm_role() in ('owner','sales_manager')) for update of q;
  if not found then raise exception '无权发送该报价'; end if;
  if quote.status<>'approved' then raise exception '只有主管批准后的报价才能发送'; end if;
  if target_message_id is not null and not exists(select 1 from public.email_messages m where m.id=target_message_id and m.inquiry_id=quote.inquiry_id and m.direction='outbound') then raise exception '发送邮件与报价询盘不匹配'; end if;
  update public.quotation_versions set status='sent',sent_at=sent_time,sent_message_id=target_message_id,updated_at=sent_time where id=quote.id;
  update public.inquiries set
    status=case when status in ('received','qualified','contacted') then 'quoted' else status end,
    estimated_amount=coalesce(estimated_amount,quote.total_amount),
    currency=coalesce(currency,quote.currency),
    quoted_at=coalesce(quoted_at,sent_time),updated_at=sent_time
  where id=quote.inquiry_id;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
  values(auth.uid(),'quotation',quote.id,'quotation_sent',jsonb_build_object('status','approved'),jsonb_build_object('status','sent','inquiry_id',quote.inquiry_id,'sent_message_id',target_message_id),'报价已通过业务员邮箱发送');
end $$;

create or replace function private.track_quotation_customer_reply()
returns trigger language plpgsql security definer set search_path='' as $$
declare quote_id uuid; quote_creator uuid; affected integer; reply_time timestamptz:=coalesce(new.received_at,new.created_at,clock_timestamp());
begin
  if new.direction<>'inbound' or new.inquiry_id is null then return new; end if;
  select id,created_by into quote_id,quote_creator from public.quotation_versions
  where inquiry_id=new.inquiry_id and status='sent' and sent_at is not null and sent_at<=reply_time
  order by sent_at desc limit 1;
  if quote_id is null then return new; end if;
  update public.quotation_versions set customer_replied_at=reply_time,customer_reply_message_id=new.id,updated_at=clock_timestamp()
  where id=quote_id and (customer_replied_at is null or reply_time>customer_replied_at);
  get diagnostics affected=row_count;
  if affected>0 then
    insert into public.notifications(recipient_id,inquiry_id,type,title,body)
    values(quote_creator,new.inquiry_id,'quotation_customer_replied','客户已回复报价',coalesce(new.subject,'客户回复了已发送的报价'));
  end if;
  return new;
end $$;

drop trigger if exists email_message_track_quotation_reply on public.email_messages;
create trigger email_message_track_quotation_reply after insert or update of inquiry_id,direction,received_at on public.email_messages
for each row execute function private.track_quotation_customer_reply();

revoke all on function public.submit_quotation_for_approval(uuid,text) from public,anon;
revoke all on function public.review_quotation(uuid,boolean,text) from public,anon;
revoke all on function public.mark_quotation_sent(uuid,uuid) from public,anon;
grant execute on function public.submit_quotation_for_approval(uuid,text) to authenticated;
grant execute on function public.review_quotation(uuid,boolean,text) to authenticated;
grant execute on function public.mark_quotation_sent(uuid,uuid) to authenticated;
