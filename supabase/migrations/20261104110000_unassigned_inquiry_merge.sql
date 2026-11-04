-- Logical merge for unassigned official inbound inquiries only.
-- Retain source records and immutable merge evidence; never move private sales content.
begin;
alter table public.inquiries add column merged_into_id uuid references public.inquiries(id);
create table private.inquiry_merges(
 id uuid primary key default gen_random_uuid(),source_id uuid not null unique references public.inquiries(id),
 target_id uuid not null references public.inquiries(id),actor_id uuid not null references public.profiles(id),
 reason text not null check(length(btrim(reason)) between 8 and 1000),
 source_snapshot jsonb not null,target_snapshot jsonb not null,created_at timestamptz not null default clock_timestamp(),
 check(source_id<>target_id)
);
alter table private.inquiry_merges enable row level security;
revoke all on private.inquiry_merges from public,anon,authenticated,service_role;
create trigger inquiry_merges_immutable before update or delete on private.inquiry_merges for each row execute function private.reject_risk_event_mutation();
create function private.inquiry_merge_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then if new.merged_into_id is not null then raise exception '不可在新建时伪造合并关系'; end if;return new;end if;
 if new.merged_into_id is distinct from old.merged_into_id and coalesce(current_setting('app.inquiry_merge_rpc',true),'')<>'on' then raise exception '合并关系只能通过受控流程修改'; end if;
 if old.merged_into_id is not null and (new.archived_at is null or new.merged_into_id is distinct from old.merged_into_id) and coalesce(current_setting('app.inquiry_merge_restore',true),'')<>'on' then raise exception '已合并原记录须保留，不可单独恢复或改绑'; end if;
 return new;
end $$;
create trigger inquiries_merge_guard before insert or update on public.inquiries for each row execute function private.inquiry_merge_guard();
create function private.merge_actor() returns public.profiles language plpgsql stable security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();begin return a;end $$;
create function private.merge_email(i public.inquiries) returns text language sql stable security definer set search_path='' as $$
 select lower(coalesce(nullif(c.email,''),(regexp_match(coalesce(i.original_message,''),'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'))[1],'')) from (select 1) seed left join public.contacts c on c.id=i.contact_id;
$$;
create function private.merge_is_official(i public.inquiries) returns boolean language sql stable security definer set search_path='' as $$
 select i.source::text in('website','email','whatsapp','organic_search','social_media','google_ads','meta_ads','linkedin','exhibition','feishu')
 and not exists(select 1 from private.sales_leads l where l.inquiry_id=i.id)
 and not exists(select 1 from public.audit_logs a where a.entity_id=i.id and a.entity_type='inquiry' and a.action='multichannel_customer_opportunity_created');
$$;
create function public.inquiry_merge_workspace(target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();i public.inquiries; candidates jsonb;history jsonb;
begin
 select * into i from public.inquiries where id=target_id and archived_at is null and not coalesce(is_test_data,false) and data_environment='production';
 if i.id is null or not (a.role='owner' or (a.role='marketing' and i.owner_id is null) or i.owner_id=a.id or (a.role='sales_manager' and private.crm_manager_covers_inquiry(a.id,i.id))) then raise exception '无权查看该询盘合并记录'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',m.source_id,'source_no',m.source_snapshot->'inquiry_no','title',m.source_snapshot->'title','source',m.source_snapshot->'source','received_at',m.source_snapshot->'created_at','original_message',m.source_snapshot->'original_message','merged_at',m.created_at,'reason',m.reason) order by m.created_at),'[]') into history from private.inquiry_merges m where m.target_id=i.id and exists(select 1 from public.inquiries original where original.id=m.source_id and original.merged_into_id=i.id);
 candidates:='[]';
 if a.role in('owner','marketing') and i.owner_id is null and private.merge_is_official(i) then
 select coalesce(jsonb_agg(x),'[]') into candidates from(
 select j.id,j.inquiry_no,j.title,j.created_at,j.source,j.product_category,j.target_country,
 case when nullif(private.merge_email(i),'')=private.merge_email(j) then '客户邮箱相同，需核对产品与项目' else '公司相同，需核对产品与项目' end match_reason
 from public.inquiries j where j.id<>i.id and j.owner_id is null and j.archived_at is null and j.merged_into_id is null and not coalesce(j.is_test_data,false) and j.data_environment='production' and not coalesce(j.excluded_from_dashboard,false) and private.merge_is_official(j)
 and ((private.merge_email(i)<>'' and private.merge_email(j)=private.merge_email(i)) or (i.company_id is not null and j.company_id=i.company_id))
 order by j.created_at,j.id limit 30) x;
 end if;
 return jsonb_build_object('candidates',candidates,'history',history,'can_restore',a.role='owner','can_merge',a.role in('owner','marketing') and i.owner_id is null and private.merge_is_official(i));
end $$;
create function public.preview_inquiry_merge(source_id uuid,target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();s public.inquiries;t public.inquiries;token text;
begin
 if a.role not in('owner','marketing') then raise exception '本批仅允许市场部或老板合并未分配官方询盘'; end if;
 if source_id is null or target_id is null or source_id=target_id then raise exception '请选择不同的两条询盘'; end if;
 select * into s from public.inquiries where id=source_id;select * into t from public.inquiries where id=target_id;
 if s.id is null or t.id is null or s.owner_id is not null or t.owner_id is not null or s.archived_at is not null or t.archived_at is not null or s.merged_into_id is not null or t.merged_into_id is not null or coalesce(s.is_test_data,false) or coalesce(t.is_test_data,false) or s.data_environment is distinct from 'production' or t.data_environment is distinct from 'production' or coalesce(s.excluded_from_dashboard,false) or coalesce(t.excluded_from_dashboard,false) or not private.merge_is_official(s) or not private.merge_is_official(t) then raise exception '仅可合并当前可见、未分配、未归档的生产官方询盘'; end if;
 if s.created_at<t.created_at then raise exception '请保留更早来信为主询盘'; end if;
 if s.status::text in('won','lost') or t.status::text in('won','lost') then raise exception '已关闭询盘不可直接合并'; end if;
 if not ((private.merge_email(s)<>'' and private.merge_email(s)=private.merge_email(t)) or (s.company_id is not null and s.company_id=t.company_id)) then raise exception '客户身份没有共同证据，须先核验身份'; end if;
 if nullif(btrim(coalesce(s.product_category,'')),'') is not null and nullif(btrim(coalesce(t.product_category,'')),'') is not null and lower(btrim(s.product_category))<>lower(btrim(t.product_category)) then raise exception '产品类别不同，请保留独立询盘'; end if;
 if nullif(btrim(coalesce(s.project_name,'')),'') is not null and nullif(btrim(coalesce(t.project_name,'')),'') is not null and lower(btrim(s.project_name))<>lower(btrim(t.project_name)) then raise exception '项目不同，请保留独立询盘'; end if;
 if exists(select 1 from public.email_messages e join public.mailbox_connections c on c.id=e.mailbox_connection_id where e.inquiry_id in(s.id,t.id) and c.mailbox_kind<>'shared_inquiry') then raise exception '存在销售私有邮件，不可走未分配合并流程'; end if;
 if exists(select 1 from private.inquiry_merges m where m.source_id=s.id) then raise exception '该原记录已有合并审计，请先由管理员核对历史'; end if;
 if exists(select 1 from private.inquiry_merges m where m.target_id=s.id) then raise exception '被合并询盘已有合并历史，请逐条合入主询盘，避免链式丢失'; end if;
 token:=encode(sha256(convert_to((to_jsonb(s)||jsonb_build_object('target',to_jsonb(t)))::text,'UTF8')),'hex');
 return jsonb_build_object('source',jsonb_build_object('id',s.id,'number',s.inquiry_no,'title',s.title,'original',s.original_message,'created_at',s.created_at),'target',jsonb_build_object('id',t.id,'number',t.inquiry_no,'title',t.title,'original',t.original_message,'created_at',t.created_at),'hash',token);
end $$;
create function public.merge_unassigned_inquiries(source_id uuid,target_id uuid,merge_reason text,reviewed_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();s public.inquiries;t public.inquiries;p jsonb;result uuid;v_reason text:=btrim(coalesce(merge_reason,''));
begin
 -- Stable ordering prevents deadlock; revalidate both records after locking.
 perform id from public.inquiries where id in(source_id,target_id) order by id for update;
 p:=public.preview_inquiry_merge(source_id,target_id);
 if reviewed_hash is distinct from p->>'hash' or length(v_reason) not between 8 and 1000 then raise exception '预览已变化或原因不足8字，请重新核对'; end if;
 select * into s from public.inquiries where id=source_id;select * into t from public.inquiries where id=target_id;
 insert into private.inquiry_merges(source_id,target_id,actor_id,reason,source_snapshot,target_snapshot) values(s.id,t.id,a.id,v_reason,to_jsonb(s),to_jsonb(t)) returning id into result;
 perform set_config('app.inquiry_merge_rpc','on',true);perform set_config('app.inquiry_archive_rpc','on',true);perform set_config('app.inquiry_workflow_rpc','on',true);
 -- Keep original text and timestamps byte-for-byte in the source; target original
 -- also remains unchanged. Linked source text is exposed only through merge history.
 update public.inquiries set target_country=coalesce(nullif(target_country,''),nullif(s.target_country,'')),product_category=coalesce(nullif(product_category,''),nullif(s.product_category,'')),updated_at=clock_timestamp(),updated_by=a.id,last_change_reason='合并重复询盘 '||s.inquiry_no||'：'||v_reason where id=t.id;
 update public.inquiries set merged_into_id=t.id,archived_at=clock_timestamp(),archived_by=a.id,archive_reason='已合并至询盘 '||t.inquiry_no||'：'||left(v_reason,900),updated_at=clock_timestamp(),updated_by=a.id,last_change_reason='合并重复询盘：'||v_reason where id=s.id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(a.id,'inquiry',s.id,'inquiry_merged',jsonb_build_object('merged_into_id',null,'archived_at',s.archived_at),jsonb_build_object('merged_into_id',t.id,'merge_id',result,'source_number',s.inquiry_no,'target_number',t.inquiry_no),v_reason);
 return result;
end $$;

create function public.restore_inquiry_merge(source_id uuid,restoration_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.merge_actor();s public.inquiries;t public.inquiries;reason text:=btrim(coalesce(restoration_reason,''));
begin
 if a.role<>'owner' or length(reason) not between 8 and 1000 then raise exception '仅老板可撤销合并，须填写至少8字原因'; end if;
 select * into s from public.inquiries where id=source_id for update;
 if s.merged_into_id is null then raise exception '原记录未处于合并状态'; end if;
 select * into t from public.inquiries where id=s.merged_into_id for update;
 if s.owner_id is not null or t.owner_id is not null then raise exception '已分配后须先由主管核对归属，不可直接撤销'; end if;
 perform set_config('app.inquiry_merge_rpc','on',true);perform set_config('app.inquiry_merge_restore','on',true);perform set_config('app.inquiry_archive_rpc','on',true);perform set_config('app.inquiry_workflow_rpc','on',true);
 update public.inquiries set merged_into_id=null,archived_at=null,archived_by=null,archive_reason=null,updated_at=clock_timestamp(),updated_by=a.id,last_change_reason='撤销合并：'||reason where id=s.id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(a.id,'inquiry',s.id,'inquiry_merge_restored',jsonb_build_object('merged_into_id',t.id),jsonb_build_object('merged_into_id',null),reason);
end $$;
revoke all on function public.restore_inquiry_merge(uuid,text) from public,anon,service_role;
grant execute on function public.restore_inquiry_merge(uuid,text) to authenticated;
revoke all on function private.inquiry_merge_guard(),private.merge_actor(),private.merge_email(public.inquiries),private.merge_is_official(public.inquiries) from public,anon,authenticated,service_role;
revoke all on function public.inquiry_merge_workspace(uuid),public.preview_inquiry_merge(uuid,uuid),public.merge_unassigned_inquiries(uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.inquiry_merge_workspace(uuid),public.preview_inquiry_merge(uuid,uuid),public.merge_unassigned_inquiries(uuid,uuid,text,text) to authenticated;
commit;
