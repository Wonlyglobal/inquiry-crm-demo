begin;
create table public.business_public_companies (
 domain text primary key,
 version integer not null check(version>0),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now()
);
create table public.business_public_research_versions (
 request_id uuid primary key,
 domain text not null references public.business_public_companies(domain),
 version integer not null,
 payload jsonb not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(domain,version)
);
alter table public.business_public_companies enable row level security;
alter table public.business_public_research_versions enable row level security;
revoke all on public.business_public_companies,public.business_public_research_versions from public,anon,authenticated;
grant select on public.business_public_companies,public.business_public_research_versions to service_role;
create or replace function public.save_business_public_research(p_actor uuid,p_domain text,p_payload jsonb,p_expected integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare previous public.business_public_companies; repeated public.business_public_research_versions; n integer;
begin
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=p_actor and lower(u.email)='chloelee@wonlyglobal.com' and p.active is true) then raise exception 'business_owner_required'; end if;
 if p_domain is null or p_payload is null or p_expected is null or p_request is null or p_expected<0 or length(p_domain)>253 or p_domain !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' or p_payload->>'domain' is distinct from p_domain or jsonb_typeof(p_payload->'facts') is distinct from 'array' or jsonb_array_length(p_payload->'facts')<1 then raise exception 'invalid_submission'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_domain,0));
 select * into repeated from public.business_public_research_versions where request_id=p_request;
 if found then
  if repeated.domain<>p_domain or repeated.payload<>p_payload or repeated.actor_id<>p_actor then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('domain',p_domain,'version',repeated.version,'status','replayed');
 end if;
 select * into previous from public.business_public_companies where domain=p_domain for update;
 n:=coalesce(previous.version,0);
 if n<>p_expected then raise exception 'version_conflict'; end if;
 if n>0 and previous.payload=p_payload then return jsonb_build_object('domain',p_domain,'version',n,'status','unchanged'); end if;
 -- Updates submit a complete reviewed snapshot; missing historical facts must not be silently erased.
 if n>0 and exists(select 1 from jsonb_array_elements(previous.payload->'facts') f where not (p_payload->'facts' @> jsonb_build_array(f))) then raise exception 'historical_evidence_must_be_retained'; end if;
 insert into public.business_public_companies(domain,version,payload) values(p_domain,n+1,p_payload)
 on conflict(domain) do update set version=excluded.version,payload=excluded.payload,updated_at=now();
 insert into public.business_public_research_versions(request_id,domain,version,payload,actor_id) values(p_request,p_domain,n+1,p_payload,p_actor);
 return jsonb_build_object('domain',p_domain,'version',n+1,'status',case when n=0 then 'created' else 'updated' end);
end $$;
revoke all on function public.save_business_public_research(uuid,text,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_business_public_research(uuid,text,jsonb,integer,uuid) to service_role;
commit;
