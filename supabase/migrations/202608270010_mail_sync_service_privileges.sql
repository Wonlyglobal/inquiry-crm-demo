grant select, insert, update on table
  public.companies,
  public.contacts,
  public.inquiries,
  public.email_intake,
  public.notifications,
  public.follow_ups,
  public.outreach_drafts
to service_role;

grant usage, select on all sequences in schema public to service_role;
