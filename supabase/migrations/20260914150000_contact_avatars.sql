alter table public.contacts
  add column if not exists avatar_url text;

comment on column public.contacts.avatar_url is
  'CRM 联系人公开头像地址，用于客户资料和 WhatsApp 会话展示。';

notify pgrst, 'reload schema';
