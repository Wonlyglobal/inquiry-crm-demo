-- Read-only country grouping. No customer/source/ownership rewrite; own sales scope only.
begin;
create function private.sales_lead_country_key(value text) returns text language plpgsql immutable set search_path='' as $$
declare raw text:=normalize(btrim(coalesce(value,'')),NFKC); aliases jsonb:='{"brasil":"巴西","brazil":"巴西","巴西":"巴西","argentina":"阿根廷","阿根廷":"阿根廷","china":"中国","中国":"中国","usa":"美国","united states":"美国","美国":"美国","canada":"加拿大","加拿大":"加拿大","mexico":"墨西哥","墨西哥":"墨西哥","chile":"智利","智利":"智利","peru":"秘鲁","秘鲁":"秘鲁","colombia":"哥伦比亚","哥伦比亚":"哥伦比亚","germany":"德国","德国":"德国","france":"法国","法国":"法国","italy":"意大利","意大利":"意大利","spain":"西班牙","西班牙":"西班牙","united kingdom":"英国","uk":"英国","英国":"英国","australia":"澳大利亚","澳大利亚":"澳大利亚","india":"印度","印度":"印度","japan":"日本","日本":"日本","south korea":"韩国","韩国":"韩国","indonesia":"印度尼西亚","印度尼西亚":"印度尼西亚","vietnam":"越南","越南":"越南","thailand":"泰国","泰国":"泰国","malaysia":"马来西亚","马来西亚":"马来西亚","philippines":"菲律宾","菲律宾":"菲律宾","singapore":"新加坡","新加坡":"新加坡","saudi arabia":"沙特阿拉伯","沙特阿拉伯":"沙特阿拉伯","uae":"阿联酋","united arab emirates":"阿联酋","阿联酋":"阿联酋","egypt":"埃及","埃及":"埃及","south africa":"南非","南非":"南非","gabon":"加蓬","加蓬":"加蓬","kosovo":"科索沃","科索沃":"科索沃","kyrgyzstan":"吉尔吉斯斯坦","吉尔吉斯斯坦":"吉尔吉斯斯坦","nigeria":"尼日利亚","尼日利亚":"尼日利亚","russia":"俄罗斯","俄罗斯":"俄罗斯","austria":"奥地利","奥地利":"奥地利","belarus":"白俄罗斯","白俄罗斯":"白俄罗斯","portugal":"葡萄牙","葡萄牙":"葡萄牙","ghana":"加纳","加纳":"加纳","kenya":"肯尼亚","肯尼亚":"肯尼亚","morocco":"摩洛哥","摩洛哥":"摩洛哥","tanzania":"坦桑尼亚","坦桑尼亚":"坦桑尼亚","israel":"以色列","以色列":"以色列","iraq":"伊拉克","伊拉克":"伊拉克","costa rica":"哥斯达黎加","哥斯达黎加":"哥斯达黎加","turkey":"土耳其","土耳其":"土耳其","ethiopia":"埃塞俄比亚","埃塞俄比亚":"埃塞俄比亚","senegal":"塞内加尔","塞内加尔":"塞内加尔","sierra leone":"塞拉利昂","塞拉利昂":"塞拉利昂","panama":"巴拿马","巴拿马":"巴拿马","mongolia":"蒙古","蒙古":"蒙古","bangladesh":"孟加拉国","孟加拉国":"孟加拉国","pakistan":"巴基斯坦","巴基斯坦":"巴基斯坦","ecuador":"厄瓜多尔","厄瓜多尔":"厄瓜多尔","zimbabwe":"津巴布韦","津巴布韦":"津巴布韦","méxico":"墨西哥","沙特":"沙特阿拉伯","孟加拉":"孟加拉国","türkiye":"土耳其"}'::jsonb; direct text; parts text[]; candidate text; part text;
begin
 if raw='' or lower(raw) in ('未知','未填写','待补充','待确认','—','-','unknown','n/a') then return '__missing';end if;
 direct:=aliases->>lower(raw);if direct is not null then return direct;end if;
 if raw~*'^(尼日利亚|nigeria)([[:space:]]+.+|拉各斯|阿布贾|哈科特港|奥尼查)$' then return '尼日利亚';end if;
 parts:=regexp_split_to_array(raw,'[[:space:]]*/[[:space:]]*');
 if cardinality(parts)>1 then
  foreach part in array parts loop
   direct:=aliases->>lower(part);
   if direct is null or (candidate is not null and direct<>candidate) then return '__review:'||lower(raw);end if;
   candidate:=direct;
  end loop;return candidate;
 end if;
 return '__review:'||lower(raw);
end $$;
revoke all on function private.sales_lead_country_key(text) from public,anon,authenticated,service_role;
create function public.personal_sales_lead_country_list(search_text text default '',lead_state text default 'pending',page_offset integer default 0,country_key text default '',sort_order text default 'recent') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.profiles:=private.sales_lead_actor(); items jsonb; total integer; due integer; countries jsonb;
begin
 if a.role<>'sales' then raise exception '仅业务员可查看本人历史线索';end if;
 if search_text is null or length(search_text)>300 or lead_state is null or lead_state not in('all','pending','converted','due') or page_offset is null or page_offset<0 or page_offset>100000 or page_offset%50<>0 or country_key is null or length(country_key)>400 or sort_order is null or sort_order not in('recent','country') then raise exception '筛选或分页参数不正确';end if;
 select count(*) into due from private.sales_leads l where l.sales_id=a.id and l.next_due_at<=clock_timestamp() and l.next_done_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('country',country,'count',n) order by country),'[]') into countries from (select l.country,count(*) n from private.sales_leads l where l.sales_id=a.id group by l.country) x;
 with filtered as (select l.* from private.sales_leads l where l.sales_id=a.id and (lead_state='all' or lead_state='pending' and l.inquiry_id is null or lead_state='converted' and l.inquiry_id is not null or lead_state='due' and l.next_due_at<=clock_timestamp() and l.next_done_at is null) and (country_key='' or private.sales_lead_country_key(l.country)=country_key) and (btrim(search_text)='' or strpos(lower(concat_ws(' ',l.company,l.contact,l.country,l.email,l.phone,l.demand)),lower(btrim(search_text)))>0)) select count(*) into total from filtered;
 select coalesce(jsonb_agg(doc order by n),'[]') into items from (
 select private.personal_lead_json(l) doc,row_number() over(order by case when sort_order='country' then left(private.sales_lead_country_key(l.country),2)='__' end asc,case when sort_order='country' then private.sales_lead_country_key(l.country) end asc,l.recorded_at desc,l.id desc) n
 from private.sales_leads l where l.sales_id=a.id and (lead_state='all' or lead_state='pending' and l.inquiry_id is null or lead_state='converted' and l.inquiry_id is not null or lead_state='due' and l.next_due_at<=clock_timestamp() and l.next_done_at is null) and (country_key='' or private.sales_lead_country_key(l.country)=country_key) and (btrim(search_text)='' or strpos(lower(concat_ws(' ',l.company,l.contact,l.country,l.email,l.phone,l.demand)),lower(btrim(search_text)))>0)
 order by n limit 50 offset page_offset) x;
 insert into private.sales_lead_events(actor_id,target_id,action,details) values(a.id,a.id,'personal_list_read',jsonb_build_object('state',lead_state,'offset',page_offset,'total',total,'country',country_key,'sort',sort_order));
 return jsonb_build_object('items',items,'total',total,'offset',page_offset,'limit',50,'due',due,'countries',countries,'as_of',clock_timestamp());
end $$;
revoke all on function public.personal_sales_lead_country_list(text,text,integer,text,text) from public,anon,service_role;
grant execute on function public.personal_sales_lead_country_list(text,text,integer,text,text) to authenticated;
commit;
