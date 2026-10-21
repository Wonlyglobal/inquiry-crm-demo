-- A website lead's company identity must come from explicit form email-body
-- fields, never from the notification provider or the sender's email domain.
-- Patch the deployed RPC only when its expected structure is present.
begin;

do $$
declare
  definition text := pg_get_functiondef('public.ingest_website_inquiry(jsonb)'::regprocedure);
  marker text;
begin
  marker := '  if customer_name is null then raise exception ''客户姓名不能为空''; end if;';
  if position(marker in definition)=0 then raise exception 'ingest_website_inquiry source drift: customer validation marker missing'; end if;
  definition := replace(definition, marker, marker || E'\n  if company_name ~* ''(^|[^a-z0-9])web3forms([^a-z0-9]|$)'' then company_name:=null; end if;');

  marker := E'    select c.id,c.company_id into contact_id_value,company_id_value\n    from public.contacts c where lower(c.email)=customer_email\n    order by c.created_at limit 1;';
  if position(marker in definition)=0 then raise exception 'ingest_website_inquiry source drift: existing-contact marker missing'; end if;
  definition := replace(definition, marker, E'    if company_name is not null then\n' || marker || E'\n    end if;');

  marker := E'    domain_value:=split_part(customer_email,''@'',2);\n    if domain_value in (''gmail.com'',''googlemail.com'',''outlook.com'',''hotmail.com'',''live.com'',''yahoo.com'',''icloud.com'',''qq.com'',''163.com'',''126.com'') then\n      domain_value:=null;\n    end if;';
  if position(marker in definition)=0 then raise exception 'ingest_website_inquiry source drift: email-domain fallback marker missing'; end if;
  definition := replace(definition, marker, E'    domain_value:=nullif(lower(btrim(coalesce(nullif(payload->>''company_domain'',''''),nullif(payload->>''company_website'',''''),nullif(payload->>''website'',''''),nullif(payload->>''website_url'',''''),nullif(payload->>''domain'','''')))),'''');\n    domain_value:=regexp_replace(domain_value,''^https?://(www\\.)?'','''');\n    domain_value:=split_part(domain_value,''/'',1);\n    if domain_value ~* ''(^|\\.)web3forms\\.com$'' then domain_value:=null; end if;');

  marker := E'    if company_id_value is null then\n      insert into public.companies(name,domain,country,created_by)\n      values(coalesce(company_name,domain_value,customer_email),domain_value,country_value,actor_id)\n      returning id into company_id_value;\n    else\n      update public.companies set\n        country=coalesce(country,country_value),\n        updated_at=clock_timestamp()\n      where id=company_id_value;\n    end if;';
  if position(marker in definition)=0 then raise exception 'ingest_website_inquiry source drift: company-creation marker missing'; end if;
  definition := replace(definition, marker, E'    if company_id_value is null and company_name is not null then\n      insert into public.companies(name,domain,country,created_by)\n      values(company_name,domain_value,country_value,actor_id)\n      returning id into company_id_value;\n    elsif company_id_value is not null then\n      update public.companies set\n        country=coalesce(country,country_value),\n        updated_at=clock_timestamp()\n      where id=company_id_value;\n    end if;');

  marker := '    if contact_id_value is null then';
  if position(marker in definition)=0 then raise exception 'ingest_website_inquiry source drift: contact-creation marker missing'; end if;
  definition := replace(definition, marker, '    if contact_id_value is null and company_id_value is not null then');

  execute definition;
end;
$$;

commit;
