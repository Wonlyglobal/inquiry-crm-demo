-- Read-only provenance flags, scoped to the same inquiry audience. No row rewrite.
create function public.get_inquiry_channel_origins(target_ids uuid[])
returns table(id uuid,origin text)
language plpgsql stable security definer set search_path=''
as $$
declare actor public.profiles%rowtype;
begin
 select * into actor from public.profiles where profiles.id=auth.uid() and active=true
   and not coalesce(is_test_data,false) and coalesce(data_environment,'production')='production';
 if actor.id is null or actor.role::text not in ('owner','sales_manager','marketing','sales') then
   raise exception '当前账号不可读取询盘来源口径';
 end if;
 if target_ids is null or cardinality(target_ids)>200 then raise exception '每批最多核对200条'; end if;
 return query select i.id,
   case when exists(select 1 from public.audit_logs a where a.entity_type='inquiry' and a.entity_id=i.id
       and a.action='multichannel_customer_opportunity_created')
     or exists(select 1 from private.sales_leads l where l.inquiry_id=i.id)
     then 'personal'
     when i.source::text in ('website','organic_search','email','whatsapp','feishu','social_media','google_ads','meta_ads','linkedin','exhibition')
     then 'official' else 'unknown' end
 from public.inquiries i
 where i.id=any(target_ids) and i.archived_at is null and not coalesce(i.is_test_data,false)
   and coalesce(i.data_environment,'production')='production' and not coalesce(i.excluded_from_dashboard,false)
   and (actor.role::text in ('owner','marketing') or (actor.role::text='sales' and i.owner_id=actor.id)
     or (actor.role::text='sales_manager' and private.crm_manager_covers_inquiry(actor.id,i.id)));
end;
$$;
revoke all on function public.get_inquiry_channel_origins(uuid[]) from public,anon,service_role;
grant execute on function public.get_inquiry_channel_origins(uuid[]) to authenticated;
