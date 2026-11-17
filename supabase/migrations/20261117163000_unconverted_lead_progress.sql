-- Extend the existing audited, owner-only sales lead note to unconverted leads.
-- No grants, RLS, ownership, timestamp or statistical rules are changed.
begin;
do $$ begin
 if md5(pg_get_functiondef('public.update_sales_lead_progress(uuid,text)'::regprocedure))<>'d2494d589e64e0f338faf986b59244b7' then raise exception '线索跟进接口已变化，停止迁移并重新核对'; end if;
end $$;
create or replace function public.update_sales_lead_progress(target_id uuid,note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();
begin
 if a.role<>'sales' or length(btrim(coalesce(note,''))) not between 4 and 2000 then raise exception '仅业务员可更新本人线索或商机的跟进摘要（4—2000字）'; end if;
 update private.sales_leads set progress_note=btrim(note),progress_at=clock_timestamp() where id=target_id and sales_id=a.id;
 if not found then raise exception '线索不存在或不属于本人'; end if;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,target_id,'progress_updated',jsonb_build_object('note',btrim(note)));
end $$;
commit;
