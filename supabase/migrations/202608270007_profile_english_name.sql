alter table public.profiles add column if not exists english_name text;

update public.profiles
set english_name = 'Shawn Hao', updated_at = clock_timestamp()
where email = 'shawnhao@wonlyglobal.com';

