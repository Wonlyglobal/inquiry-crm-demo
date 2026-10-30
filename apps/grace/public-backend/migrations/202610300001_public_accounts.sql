-- ONLY for the independent Grace project. Never apply to CRM or website.
begin;
do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.inquiries') is not null then
    raise exception 'Grace public backend requires a separate project';
  end if;
end $$;
create schema if not exists grace_private;
revoke all on schema grace_private from public, anon, authenticated;

create table grace_private.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table grace_private.quota (
  scope text not null,
  period text not null,
  used integer not null default 0 check (used >= 0),
  primary key (scope, period)
);
alter table grace_private.accounts enable row level security;
alter table grace_private.quota enable row level security;
revoke all on all tables in schema grace_private from public, anon, authenticated;

-- No role, email domain or user_metadata can grant enterprise access.
create function grace_private.register_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into grace_private.accounts(user_id) values(new.id);
  return new;
end $$;
revoke all on function grace_private.register_account() from public, anon, authenticated;
create trigger grace_public_account_created after insert on auth.users
for each row execute function grace_private.register_account();

create function grace_private.remove_account_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from grace_private.quota where scope=old.user_id::text;
  return old;
end $$;
revoke all on function grace_private.remove_account_quota() from public, anon, authenticated;
create trigger grace_public_account_deleted after delete on grace_private.accounts
for each row execute function grace_private.remove_account_quota();

create function public.grace_public_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from grace_private.accounts a join auth.users u on u.id=a.user_id
    where a.user_id=p_user and a.active and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now()));
$$;
revoke all on function public.grace_public_account(uuid) from public, anon, authenticated;
grant execute on function public.grace_public_account(uuid) to service_role;

-- Serialize global then user counters; checks and debit share one transaction.
-- Conservative launch limits: 500 requests/month globally, 20/day/account.
-- Limits are counts, not a monetary guarantee; no automatic quota increases.
create function public.grace_public_consume(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  month_key text := to_char(now() at time zone 'UTC','YYYY-MM');
  day_key text := to_char(now() at time zone 'UTC','YYYY-MM-DD');
  global_used integer;
  account_used integer;
begin
  if not public.grace_public_account(p_user) then return false; end if;
  insert into grace_private.quota(scope,period) values('global',month_key) on conflict do nothing;
  select used into global_used from grace_private.quota where scope='global' and period=month_key for update;
  if global_used >= 500 then return false; end if;
  insert into grace_private.quota(scope,period) values(p_user::text,day_key) on conflict do nothing;
  select used into account_used from grace_private.quota where scope=p_user::text and period=day_key for update;
  if account_used >= 20 then return false; end if;
  update grace_private.quota set used=used+1 where (scope='global' and period=month_key) or (scope=p_user::text and period=day_key);
  return true;
end $$;
revoke all on function public.grace_public_consume(uuid) from public, anon, authenticated;
grant execute on function public.grace_public_consume(uuid) to service_role;

-- Disable before deleting Auth identity, so an old JWT cannot keep using AI.
create function public.grace_public_disable(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update grace_private.accounts set active=false where user_id=p_user;
$$;
revoke all on function public.grace_public_disable(uuid) from public, anon, authenticated;
grant execute on function public.grace_public_disable(uuid) to service_role;
commit;
