-- Immutable, actor-owned approved customer-copy snapshots; existing draft RLS remains unchanged.
begin;
create table public.outreach_final_copies (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null references public.outreach_drafts(id),
 inquiry_id uuid not null references public.inquiries(id),
 finalized_by uuid not null references public.profiles(id),
 finalized_at timestamptz not null default clock_timestamp(),
 subject text not null check(length(subject) between 1 and 500),
 body text not null check(length(body) between 1 and 12000),
 source_language text not null,
 source_hash text not null,
 unique(draft_id,source_hash)
);
alter table public.outreach_final_copies enable row level security;
revoke all on public.outreach_final_copies from public,anon,authenticated;
grant select,insert on public.outreach_final_copies to authenticated;
create policy own_final_customer_copy on public.outreach_final_copies for select to authenticated using (
 finalized_by=(select auth.uid()) and exists(select 1 from public.outreach_drafts d where d.id=draft_id and d.created_by=(select auth.uid()))
);
create policy finalize_own_customer_copy on public.outreach_final_copies for insert to authenticated with check (
 finalized_by=(select auth.uid()) and private.current_crm_role() in ('owner','sales')
 and exists(select 1 from public.outreach_drafts d where d.id=draft_id and d.created_by=(select auth.uid()))
);
create function private.capture_outreach_final_copy() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,private as $$
declare d public.outreach_drafts%rowtype;
begin
 if tg_op<>'INSERT' then raise exception 'final_copy_append_only'; end if;
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'crm_read_only','false')='true' then raise exception 'final_copy_forbidden'; end if;
 select * into d from public.outreach_drafts where id=new.draft_id and created_by=auth.uid();
 if not found or private.current_crm_role() not in ('owner','sales') or d.status='sent' then raise exception 'final_copy_forbidden'; end if;
 if position('【Grace 产品证据草稿｜仅内部审核，不可直接发送】' in coalesce(d.body,''))>0 then raise exception 'internal_evidence_not_customer_copy'; end if;
 new.inquiry_id=d.inquiry_id;new.finalized_by=auth.uid();new.finalized_at=clock_timestamp();
 new.subject=coalesce(nullif(d.selected_subject,''),nullif(d.subject_a,''));new.body=d.body;new.source_language=d.language;
 new.source_hash=encode(sha256(convert_to(jsonb_build_array(new.subject,new.body,new.source_language)::text,'UTF8')),'hex');
 return new;
end $$;
create trigger capture_outreach_final_copy before insert or update or delete on public.outreach_final_copies for each row execute function private.capture_outreach_final_copy();
alter table public.outreach_drafts add column source_final_copy_id uuid references public.outreach_final_copies(id), add column translation_request_key text;
create unique index outreach_translation_idempotency on public.outreach_drafts(created_by,translation_request_key) where translation_request_key is not null;
create function private.check_outreach_translation_source() returns trigger language plpgsql security invoker set search_path=pg_catalog,public,private as $$
begin
 if new.source_final_copy_id is not null and not exists(select 1 from public.outreach_final_copies f where f.id=new.source_final_copy_id and f.finalized_by=auth.uid() and f.inquiry_id=new.inquiry_id) then raise exception 'translation_source_forbidden'; end if;
 return new;
end $$;
create trigger check_outreach_translation_source before insert or update on public.outreach_drafts for each row execute function private.check_outreach_translation_source();
commit;
