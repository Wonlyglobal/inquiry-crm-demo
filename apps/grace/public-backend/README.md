# Grace independent public backend — backend deployed, app not released

The user authorized a separate organization, Pro USD 25/month, one Micro,
no paid add-ons, without changing the CRM/website organization or projects.
Verified 2026-10-30: Grace AI organization hltpigkvvtaslycfqnge, Pro USD 25/month, Spend Cap enabled, one Micro project xzetwedmveglnjkxiuet in Singapore. CRM and website remain unchanged.

## Deployment boundary

Do not run the CRM migration tree against this project. This directory contains
only the independent public schema. Never deploy it to CRM
`plhverjihjilnuhlhlxi` or website `rpiviiyvbpwslyxywqcd`.
The SQL guard rejects a database with CRM profiles or inquiries. The HTTP
adapter and entry point additionally require an explicit separate project ref
matching SUPABASE_URL and reject both existing refs.

The public function is `supabase/functions/grace-public`. It has no enterprise
imports, signing keys, business tools or CRM database client. Public requests
are authenticated with the public project's Auth API, then checked against the
private account table. User metadata is not authorization. Existing enterprise
Grace remains on its current backend and original entitlement checks.

## Launch limits

Atomic DB quota: 20 requests/account/UTC day and 500 requests total/UTC month.
Model output capped at 1500 tokens; history and body bounded. A failed model
request still consumes a reservation, preventing failure/retry abuse. These
are conservative application limits, not a monetary spend guarantee. The
Supabase Spend Cap does not cap external model usage. No automatic upgrades.

The model key must be a server-only `GRACE_PUBLIC_DASHSCOPE_KEY`. Do not copy
CRM secret bundles. One synthetic production model question succeeded using the dedicated Beijing Qwen-Plus credential; no enterprise content was sent.

## Required before review submission

- Confirm Pro organization, one Micro, Spend Cap, no paid add-ons and invoice.
- Provision public Auth with email confirmation and working custom SMTP.
- Deploy schema and function only to verified public ref; set public client key
  in assets/grace-public-config.mjs. Empty config intentionally fails closed.
- Finish password recovery, account-deletion API and UI with reauthentication.
- Complete accurate privacy/terms/support pages; registration currently links
  to pages not yet created. Do not publish this incomplete flow.
- Test actual signup/email/login, persistence, public chat and model consent.
- Test cross-project public-token rejection on CRM; current tests use mocks
  and an isolated SQL database and do not prove production JWT isolation.
- Validate enterprise handoff, native voice, offline and keyboard behavior.
- Switch native start URL only after end-to-end acceptance, then archive,
  upload, provide real screenshots/metadata and submit App Store review.

## Validation 2026-10-30

21 Node tests pass (access, registration, handler and HTTP adapter). PGlite
0.3.14 in an empty in-memory database validates service-only RPC grants,
private schema denial, verified-email gate, daily/global quota, disabled
account rejection, account cascade and removal of personal quota counters.
The global aggregate is retained. This does not test concurrent independent
Postgres connections, production Auth, email delivery or external model.

The new grace-app.html shell is separate from CRM's generated grace.html;
it does not load CRM code or data. It uses a separate auth storage key, renders
answers as text, clears chat on account change and ignores a late answer after
an account switch. Public chat history is session memory only. The iOS storage
fix restores persistent WebKit storage but has not been rebuilt/reinstalled
in this turn. Independent public schema and grace-public function are deployed. Public frontend, rebuilt native app and App Store submission are not yet released.

Rollback: before launch keep native entry at existing grace.html. After launch
restore the previous native/web entry and disable the new public function;
retain existing accounts/audit and global quota records. Never delete or modify
CRM/website resources as part of public rollback.

## Live checks 2026-10-30

Synthetic confirmed-email public account: enterprise material action denied; CRM function and CRM database (limit 0, no business rows) rejected its public JWT; Qwen-Plus returned HTTP 200 with nonempty answer; password-reauthenticated deletion succeeded and the old token was rejected. The synthetic account was deleted through the app endpoint. This does not verify public email delivery.

Sender chosen by user: inquiry@wonlyglobal.com. Aliyun mailbox login and dedicated SMTP authorization remain pending; no existing mailbox password or CRM mail configuration changed.

## SMTP and build verification update

2026-10-30: user stored the dedicated Grace public auth SMTP credential directly in the independent project. Readback: custom SMTP enabled, Aliyun host/465, Grace sender name, stored password hidden. Actual signup to inquiry@wonlyglobal.com returned 200 without session; delivered confirmation email was opened and verified, subsequent password login returned confirmed email and session. Site URL now targets the standalone Grace page. Public web URL is not deployed yet; this verifies Auth, not the complete production UI callback.

1493 offline Node tests passed. Unsigned iPhone Release build 1.0.0(5) succeeded. No signed archive, upload, or App Store review submission yet. Independent bundle ID com.wonly.grace registered under the existing developer team.
