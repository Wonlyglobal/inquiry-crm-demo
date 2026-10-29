-- Same actor, masking, paging and audit rules as the original candidate workspace.
begin;
create function public.filter_company_candidates(search_text text default '',state_filter text default 'all',page_offset integer default 0,country_filter text default '',category_filter text default '',source_filter text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor();c private.company_candidates;owners uuid[];masked boolean;item_state text;items jsonb:='[]';total integer:=0;pending integer:=0;verified integer:=0;names text;
begin
 if length(coalesce(country_filter,''))>100 or length(coalesce(category_filter,''))>100 or coalesce(source_filter,'') not in ('','company_site_candidate','third_party_source_candidate','customs_record_candidate') then raise exception '筛选条件不正确'; end if;
 if length(coalesce(search_text,''))>100 or page_offset<0 or page_offset>10000 or state_filter not in('all','pending','verified','rejected','claimed','promoted','existing','mine') then raise exception '筛选条件不正确'; end if;
 perform private.candidate_rate('workspace_read',60);
 for c in select * from private.company_candidates order by imported_at desc,id loop
  owners:=private.candidate_existing_owners(c);
  if c.claimed_by is not null and cardinality(owners)=0 then owners:=array_append(owners,c.claimed_by); end if;
  masked:=cardinality(owners)>0 and a.role<>'owner' and not coalesce(a.id=any(owners),false);
  item_state:=case when c.lead_id is not null then 'promoted' when c.claimed_by is not null then 'claimed' when cardinality(owners)>0 then 'existing' else c.review_status end;
  -- No company/source/country search oracle for masked rows.
  if masked and (btrim(coalesce(search_text,''))<>'' or btrim(coalesce(country_filter,''))<>'' or btrim(coalesce(category_filter,''))<>'' or coalesce(source_filter,'')<>'') then continue; end if;
  if not masked and btrim(coalesce(country_filter,''))<>'' and private.candidate_key(c.country_candidate)<>private.candidate_key(country_filter) then continue; end if;
  if not masked and btrim(coalesce(category_filter,''))<>'' and position(lower(btrim(category_filter)) in lower(c.category_candidate))=0 then continue; end if;
  if not masked and coalesce(source_filter,'')<>'' and c.source_kind<>source_filter then continue; end if;
  if not masked and btrim(coalesce(search_text,''))<>'' and position(lower(btrim(search_text)) in lower(c.company_candidate||' '||c.country_candidate||' '||c.website_candidate))=0 then continue; end if;
  if state_filter='mine' and not coalesce(a.id=any(owners),false) then continue; end if;
  if state_filter not in('all','mine') and state_filter<>item_state then continue; end if;
  total:=total+1;
  if item_state='pending' then pending:=pending+1; end if;
  if item_state='verified' then verified:=verified+1; end if;
  if total<=page_offset or total>page_offset+50 then continue; end if;
  if masked then
   select string_agg(distinct p.full_name,'、' order by p.full_name) into names from public.profiles p where p.id=any(owners);
   items:=items||jsonb_build_array(jsonb_build_object('masked',true,'state',item_state,'responsible_name',coalesce(names,'已有客户，待主管分配')));
  else
   items:=items||jsonb_build_array(jsonb_build_object('id',c.id,'masked',false,'state',item_state,'company',c.company_candidate,'country',c.country_candidate,'website',c.website_candidate,'category',c.category_candidate,'source_url',c.source_url,'source_kind',c.source_kind,'snapshot_date',c.source_snapshot_date,'review_note',c.review_note,'official_url',c.official_url,'reviewed_at',c.reviewed_at,'claimed_at',c.claimed_at,'mine',c.claimed_by=a.id and coalesce(a.id=any(owners),false),'lead_id',case when c.claimed_by=a.id and coalesce(a.id=any(owners),false) then c.lead_id else null end,'existing',cardinality(private.candidate_existing_owners(c))>0,'can_review',a.role in('owner','marketing') and cardinality(owners)=0,'can_claim',a.role='sales' and c.review_status='verified' and cardinality(owners)=0));
  end if;
 end loop;
 insert into private.company_candidate_events(actor_id,action,details) values(a.id,'workspace_read',jsonb_build_object('filter',state_filter,'country',country_filter,'category',category_filter,'source',source_filter,'offset',page_offset,'returned',jsonb_array_length(items)));
 return jsonb_build_object('actor',jsonb_build_object('id',a.id,'role',a.role),'items',items,'total',total,'pending',pending,'verified',verified,'offset',page_offset,'as_of',clock_timestamp());
end $$;

revoke all on function public.filter_company_candidates(text,text,integer,text,text,text) from public,anon,service_role;
grant execute on function public.filter_company_candidates(text,text,integer,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
