# Production deployment audit

## 2026-09-18 — correct Li Huayan's CRM permission role

- Authorization: after the live smoke test exposed that the market-department account still had owner access, the user confirmed that Li Huayan should use the market role.
- Target: the single active production profile `chloelee@wonlyglobal.com` (`c43bd3c2-6e3a-4228-99c7-dc95f33643f2`).
- Change: updated only `profiles.role` from `owner` to `marketing`, guarded by the exact profile ID, normalized email and previous `owner` value; name, title, department and active state were left unchanged.
- Verification: the production `RETURNING` result reported `team=市场部`, `role=marketing`, `active=true`. A fresh production CRM load immediately used the corrected role.
- Live role acceptance: the navigation exposed only dashboard, market workbench, inquiry overview, scoped customer data, knowledge, role guide, email triage, nurture, research and 360. System settings, personal mailbox, WhatsApp, quotation, fulfillment, assignment pool, public pool and sales reports were absent. An assigned inquiry exposed only research, source/original review, validity, attribution, user-path and company-event tabs; sales communication, follow-up, quotation and fulfillment tabs were absent. The 360 page reported anonymous collaborative evaluation with no access to other employees' results.
- Safety: this acceptance was read-only. No email was classified or moved, no inquiry was converted, no research field was saved, no message was sent and no business record was changed.

## 2026-09-18 — publish audited CRM role responsibility boundaries

- Authorization: the user explicitly requested `发布生产` after the role-overlap implementation and local verification were complete.
- Target: Supabase project `plhverjihjilnuhlhlxi` (`WONLY Global / wonly-inquiry-crm / main / PRODUCTION`) and GitHub Pages repository `Wonlyglobal/inquiry-crm-demo`, branch `main`.
- Database: `20260918130000_role_function_overlap_optimization.sql` first passed a full transaction rollback dry-run through the authenticated Supabase Management API, then was applied to production successfully.
- Rollback acceptance: `production-role-function-overlap-rollback.sql` proved the market hand-off boundary, manager workflow boundary and assigned-sales document duty inside one rolled-back transaction. Final evidence: `trigger=t; market_assigned_message_scope=t; market_quote_scope=t; manager_document_write=f; rollback_audits=0; rollback_documents=0`.
- Frontend and policy scope: one central role matrix now gates navigation and direct view entry; market loses sales execution after assignment; managers retain assignment, approval, audit and qualification review without impersonating sales execution; knowledge authorship and historical import have one accountable role; legacy direct outreach-draft insertion is restricted to owner or assigned sales.
- Verification before publication: complete automated suite `254/254`, frontend ES-module syntax parsing and `git diff --check` passed.
- Publication: implementation commit `928e71a` was pushed to `main`; GitHub Pages workflow `35304582279` completed successfully. A cache-busted production fetch confirmed `roleViewAccess`, the manager-only assignment gate, public-mailbox status and market hidden-detail-tab rules are live.
- Safety: no real inquiry, customer, email, document or employee record was modified by acceptance; all acceptance writes were rolled back and residue counts were zero.

## 2026-09-17 — audited AI suggestion foundation and email-intake triage

- Authorization: the user explicitly confirmed production publication after reviewing the completed local implementation and its safety boundary.
- Database: `20260917094500_ai_suggestion_feedback_foundation.sql` was executed in the authenticated Supabase production SQL editor and returned `Success. No rows returned`.
- Function: `email-intake-ai` and the shared read-only guard were deployed to Supabase project `plhverjihjilnuhlhlxi`.
- Rollback acceptance: `production-ai-suggestion-feedback-rollback.sql` returned `ai_suggestion_feedback_rollback_passed`; suggestion review, modified applied data and audit persistence were proven inside a transaction, while direct authenticated table writes were rejected.
- Final ACL evidence: `table_exists=true; auth_select=true; auth_write=false; readonly_select=true; readonly_write=false; anon_review=false; auth_review=true; readonly_review=false; rollback_rows=0`.
- Safety: the AI treats email content as untrusted, retains only exact source quotes, caps suggestions without verified quotes below 50%, and never automatically converts, deletes, assigns or contacts a customer. No real inquiry was classified during deployment.
- Verification before publication: complete automated suite `218/218`, module syntax check and `git diff --check` passed.
- Publication: implementation commit `9fe3fe5` and rollout record `10b9b47` were pushed to `main`; GitHub Pages workflow `35172131821` completed successfully. A direct production source fetch confirmed `email-intake-ai`, `review_ai_suggestion` and the non-automatic safety message are published.
- Visible acceptance: the production CRM loaded under the existing authorized manager session; Mail Triage showed two pending messages, and opening the newest message displayed the `AI 分拣建议` card and `AI 分析` button. The button was deliberately not invoked, so no real email was classified or changed. Production function inventory reports `email-intake-ai` version `1`, `ACTIVE`, `verify_jwt=true`.

## 2026-09-17 — send and synchronize the accepted #000080 reply

- Scope: controlled internal acceptance reply for inquiry `#000080`; recipient `chloelee@wonlyglobal.com`; subject `Re: RFQ-CRM-20260917-A: 12 Steel Security Doors for Training Center`.
- Authorization: the operator reviewed the recipient, subject and body in CRM and explicitly confirmed sending. The first blocked attempt did not transmit a message.
- Root cause: the original message existed as both a personal Sent copy and a shared-inbox copy. Classifying by the latest copy's stored `direction` incorrectly treated a legitimate reply as proactive outreach.
- Fix: `mailbox-send` now compares the latest message sender with the verified original intake/customer sender, preserving correct reply classification when inbound and outbound mailbox copies coexist. Regression coverage includes this duplicate-copy case.
- Verification: complete automated suite passed 213/213 tests. Production Edge Function `mailbox-send` was deployed from commit `bca3ff2` (`Classify email replies by verified sender`). The direct-reply UI was previously published from commit `e1699b4`; Pages workflow `35169156778` succeeded.
- Send result: CRM reported `Sent · 2026-09-17 09:15:11`; the persisted draft is `sent` with no error.
- Synchronization result: linked messages increased `2→4`; the new Sent and Inbox copies share one RFC Message-ID and both reference the original Message-ID; email follow-ups increased `1→3`; communication-summary versions increased `1→3`.
- Safety: this was an internal controlled acceptance message, not a production-customer communication. No customer record or email was deleted.

## 2026-09-17 — link manually converted mailbox messages to inquiries

- Target: Supabase production project `plhverjihjilnuhlhlxi` and GitHub Pages source `Wonlyglobal/inquiry-crm-demo` branch `main`.
- Reason: converting a reviewed shared-inbox email only updated `email_intake.inquiry_id`; the synchronized `email_messages` copies remained `pending`, so the inquiry could not show the original email, record email follow-up evidence, generate a communication summary, or reliably match later replies.
- Database change: `20260917090000_link_manual_email_conversion_messages.sql` links only exact non-empty RFC Message-ID copies and refuses to overwrite a copy already linked to another inquiry. All mailbox copies are linked for threading; one inbound/shared copy is selected as the canonical follow-up and initial summary source. Existing converted intakes are backfilled idempotently.
- Production application: Supabase CLI dry-run was attempted through both the saved pooler and linked project, but the remote closed both database connections before SQL validation. The saved migration was therefore executed in the authenticated production SQL editor and returned `Success. No rows returned`.
- Acceptance inquiry: `#000080` / `b175fd07-3e21-4060-aeda-e3c869c11847`. Before: `linked messages=0; summaries=0; subject copies=2; states=pending:null,pending:null`. After: `linked messages=2; email-sync follow-ups=1; summaries=1; both copies=matched:manual_intake_conversion; helper installed=true`.
- Frontend change: after a successful conversion, unique inquiry IDs invoke `email-communication-ai` with the `mail_sync` trigger so future conversions receive a complete thread summary in addition to the transaction-safe rules fallback.
- Verification: complete automated suite passed 210/210 tests; `git diff --check` passed. No test inquiry or email was deleted.
- Publication: source commit `a216d6a` (`Link converted emails to inquiry threads`) was pushed to `main`; GitHub Pages workflow `35168509608` completed successfully. A direct production fetch confirmed the published `convertEmailIntakes` invokes `email-communication-ai` after conversion.
- Visible acceptance: after refreshing production CRM and opening #000080 → “分配与跟进”, the page displayed the rules summary, the inbound customer email, the outbound sent copy, and one email-sync timeline item. The optional DeepSeek refresh did not add a second version during this run, but the transaction-safe rules summary remains available and the linkage/reply-thread state is complete.

## 2026-09-16 — deploy audited contact avatar workflow to production

- Target source: GitHub repository `Wonlyglobal/inquiry-crm-demo`, branch `main`.
- Source commit: `4175e89` (`Lock contact writes to audited workflows`). GitHub Pages workflow `35063465724` completed successfully.
- Verification: the complete automated suite passed 206/206 tests before publication.
- Change summary: replace the browser's direct `contacts` update with `set_customer_contact_avatar`; validate active role, current customer scope, caller-owned storage path and uploaded object; write `contact_avatar_updated` audit evidence; prepare revocation of direct authenticated contact mutations.
- Production migration: after the user's explicit confirmation, `20260916100000_lock_contacts_to_workflows.sql` was executed in the authenticated Supabase SQL editor; Supabase returned `Success. No rows returned`.
- Rollback acceptance: the first attempt exposed an ambiguity in the acceptance script's local `actor_id` variable and aborted without committing. The variable was renamed to `test_actor_id`, the transaction was explicitly rolled back, and the corrected acceptance passed with `function=t; anon_execute=f; authenticated_execute=t; authenticated_insert=f; authenticated_update=f; authenticated_delete=f; rollback_objects=0; rollback_audits=0`.
- Safety state: direct authenticated contact mutations are revoked; audited avatar updates remain available; no rollback-test storage object or audit row remains.

## 2026-09-16 — deploy audited follow-up workflow to production

- Target source: GitHub repository `Wonlyglobal/inquiry-crm-demo`, branch `main`.
- Source commit: `9cb639d` (`Lock follow-ups to audited workflows`). GitHub Pages workflow `35062638916` completed successfully.
- Verification: the complete automated suite passed 203/203 tests before publication.
- Production database before deployment: read-only privilege query returned `anon_create=f; auth_insert=t; auth_update=f; auth_delete=f`.
- Production migration: after the user's explicit confirmation, `20260916000000_lock_followups_to_workflows.sql` was executed in the authenticated Supabase SQL editor; Supabase returned `Success. No rows returned`.
- Rollback acceptance: `table=t; anon_create_execute=f; authenticated_create_execute=t; authenticated_insert=f; authenticated_update=f; rollback_followups=0`. The audited create/complete flow and both audit entries were proved inside the transaction; direct insert/update were rejected and no test follow-up remains.
- Final combined permission check: `follow_create=t; follow_complete=t; follow_insert=f; follow_update=f; follow_delete=f; contact_avatar=t; contact_insert=f; contact_update=f; contact_delete=f`.

## 2026-09-03 09:35:41 +08:00 — redefine company events as sourced online milestones

- Targets: GitHub Pages production site and Supabase company record linked to inquiry #000002.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account and the existing production mail-sync service role.
- Reason: company events incorrectly duplicated CRM inquiry signals and even displayed research failures as events; the business owner defined this view as sourced online company milestones with an explicit relationship judgement against the current inquiry.
- Before commit: `9333878a25beaa266c20c20261098773e5e854b7`.
- Before `index.html` SHA-256: `b45c1afe036b5e5b183f7e054927dd58ec759dd37b96e90c1403a056186feb39`.
- Before data retention: the prior and resulting `company_events`, execution time and reason are stored in `audit_logs` under action `company_events_online_research`.
- Change summary: remove operational failure placeholders and duplicate inquiry-derived signals; keep the inquiry only as a timeline anchor; add `direct`, `possible`, `none` and `unknown` relationship judgements with reasons; display source links and preserve manual events.
- #000002 result: online founding event dated 2004-04-20 (`none`) and official mining-license event dated 2020-04-24 (`possible`), plus the current inquiry anchor (`direct`) generated in the UI.
- Reproducibility: the guarded population script is retained at `mail-sync/scripts/populate-mineracao-company-events.mjs`.

## 2026-09-03 09:27:13 +08:00 — reject public-email domains and repair Mineracao Canaa research

- Targets: GitHub Pages production site and Supabase company record linked to inquiry #000002.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account and the existing production mail-sync service role.
- Reason: the autonomous research flow incorrectly treated the contact's Gmail domain as the company's website domain, leaving the company identity and evidence empty.
- Before commit: `bc21bb2439d134f77e1016751d1f39b722e11ea8`.
- Before `index.html` SHA-256: `2d930436eeca4a1aa8af2fc3c6ed8edbcc927c372993ede4c4fb4aa49bc9bed8`.
- Before data retention: the complete company row before and after the correction, executor context, timestamp and reason are stored in `audit_logs` under action `company_research_corrected`.
- Change summary: block public mailbox providers from company-domain matching; fall back to unique company-name plus country matching; correct #000002 to `mineracaocanaa.com.br`; store four confirmed facts, one inbound demand signal and three evidence sources while keeping `research_required` because the website is unavailable and the Gmail contact still requires verification.
- Reproducibility: the guarded one-off repair is retained at `mail-sync/scripts/repair-mineracao-canaa-research.mjs` and refuses to overwrite a later domain correction.

## 2026-09-02 16:50:28 +08:00 — color every inquiry pipeline stage

- Target: GitHub Pages production site `http://crm.foreverdoodle.com/`.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account.
- Reason: historical inquiries can lack an explicit `pending_assignment` history row, which left an already-passed pipeline step looking unentered; the business owner also requested visible color blocks for every stage.
- Before commit: `0d4e0b25b1eb3093f653edde8ed02cba61fc4811`.
- Before `index.html` SHA-256: `9275fce248d49733bc741eaa3328018efce52279aaf7fbc911a84b7cac8c877d`.
- Before content retention: the complete prior `index.html` remains recoverable from the Git parent commit above.
- Change summary: give every stage a distinct pastel block, infer already-passed stages from the current stage order, label missing historical timestamps as `流程已通过`, and retain the stronger current-stage border without inventing timestamps.

## 2026-09-02 16:08:43 +08:00 — bilingual country display

- Target: GitHub Pages production site `http://crm.foreverdoodle.com/`.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account.
- Reason: business owner requested country/region values be displayed in both Chinese and English.
- Before commit: `cc82547a3e7d1b7df6a7dcd2e7ec489af655259a`.
- Before `index.html` SHA-256: `3f0a2145200974696968903dfa1c77eb4c32eaf1a9d7e99d4c96388bbb19699c`.
- Before content retention: the complete prior `index.html` remains recoverable from the Git parent commit above.
- Change summary: add a normalized bilingual country display helper and apply it to inquiry/public-pool lists, dashboard country filters, sales profiles, daily reports, and historical lead lists without changing stored country values.

## 2026-09-02 15:51:50 +08:00 — correct the real-inquiry baseline

- Target: Supabase production project `plhverjihjilnuhlhlxi`.
- Executor: Codex acting through the authenticated `Wonlyglobal` Supabase account after explicit user confirmation.
- Reason: business owner confirmed only #000001 and Mineracao Canaa are real inquiries, and Mineracao Canaa must be the second business inquiry.
- Before content retention: complete before/after snapshots and reasons are retained in `audit_logs`; the executable transaction is retained in `supabase/migrations/20260902070000_reclassify_non_business_inquiries.sql`.
- Change summary: swap the quarantined warm-up #000002 with Mineracao Canaa #000046; exclude #000007/#000050/#000051; clear their related notifications; restore the workflow trigger and `GENERATED ALWAYS` identity before commit.
- Verification: visible inquiry count 2; five complete correction audit records; related test notifications 0; workflow trigger enabled; identity generation `ALWAYS`.

## 2026-09-02 14:49:00 +08:00 — filter the marketing workbench intake queue

- Target: GitHub Pages production site `http://crm.foreverdoodle.com/`.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account.
- Reason: the marketing workbench still surfaced quarantined warm-up subjects through `email_intake` after the inquiry and dashboard queries were filtered.
- Before commit: `7b9890e6f5715429b74b4ce2a0b76453aa02a384`.
- Before content retention: the complete prior `index.html` remains recoverable from the Git parent commit above.
- Change summary: restrict marketing workbench intake KPIs and tasks to unlinked intake items or inquiry IDs present in the already filtered dashboard row set.

## 2026-09-02 14:39:10 +08:00 — exclude quarantined warm-up records

- Target: GitHub Pages production site `http://crm.foreverdoodle.com/`.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account.
- Reason: prevent the 48 quarantined Instantly warm-up records from appearing in inquiry management, the management dashboard, sales daily reporting, or historical lead reporting.
- Before commit: `79a9429a94508400bb5485abf58168d97201fbdc`.
- Before `index.html` SHA-256: `2accbd34c49f50ed1995375e9175aaaded46f30da646bff785b1c177780daf77`.
- Before content retention: the complete prior `index.html` remains recoverable from the Git parent commit above.
- Change summary: add `excluded_from_dashboard = false` to every list/statistics query that feeds the four affected UI surfaces; keep direct-detail and duplicate-detection queries unchanged because they are not dashboard/list output and historical duplicate evidence must remain discoverable.

## 2026-09-16 — market read-only account

- User explicitly approved publishing the read-only feature and creating Chen Xiaoyu's account. Initial broad pre-request-hook proposal was rejected and was not applied. Final implementation introduces an independent role with SELECT-only copies of existing RLS visibility; no existing member privileges or request hook were changed.
- Prior frontend/source commit: `8dd18e9`. Database migration: `20260916090000_marketing_read_only_access.sql`. Edge functions keep their original JWT-gateway settings; the five pre-existing no-verify functions are crm-ai-assistant, email-communication-ai, mailbox-ai-draft, whatsapp-send and whatsapp-connection-admin.
- Live source backup: `/private/tmp/crm-readonly-live-backup`. Local original function bodies were compared with deployed source before wrapping them; the company-website-images download contained multiple source variants, including an exact match to the checked-in body.
- Validation uses `tests/production-marketing-read-only-rollback.sql`, which rolls back every test record and compares complete visible-row fingerprints internally without exporting customer/mail data. Business writes and RPCs are forbidden; initial password completion is the only scoped write exception.
- Account creation is recorded in production `audit_logs`. No password, service key or user session token is retained in repository files.

## 2026-09-17 — real-email AI triage production acceptance

- Targets: GitHub Pages production CRM and Supabase project `plhverjihjilnuhlhlxi`.
- Reason: execute an evidence-bearing AI analysis on a real website inquiry and verify the generic suggestion/audit foundation end to end.
- Source changes: `98b7ed6` disables obsolete gateway JWT verification for `email-intake-ai` while retaining verified internal user authorization; `f00db46` gives this 40-second model call a 50-second client timeout. Pages workflow `35176045900` completed successfully.
- Provider outcome: DeepSeek returned `Insufficient Balance` and no DeepSeek suggestion was persisted. Codex produced the fallback result and it is explicitly recorded as `provider=openai-codex`, `model=gpt-5`; no provider identity was falsified.
- Persisted evidence: classification `real_inquiry`, confidence `0.9900`, seven exact email evidence quotes, and a matching `ai_suggestion_generated` audit row attributed to the authenticated owner profile. Record identifiers remain in the production database rather than repository documentation.
- Verification: the production CRM visibly renders the result, extracted facts, confidence, evidence, and human accept/modify/reject controls. Full automated regression is 219/219. No customer communication or automatic business workflow mutation was performed.
- Outstanding: restore DeepSeek credit or configure an alternate production provider before relying on the automatic `AI 分析` button for future emails.

## 2026-09-18 — sales 360 scoring production foundation

- Targets: GitHub Pages production CRM and Supabase project `plhverjihjilnuhlhlxi`.
- Authorization: the business owner explicitly requested production release with “上线吧”.
- Database changes: applied `20260918110000_sales_360_score_foundation.sql` and `20260918120000_sales_360_reminders_and_talent_actions.sql` through the authenticated Supabase SQL Editor after the saved local pooler credential failed password validation.
- Safety result: migration-time reminder processing inserted `0` notifications; production contains `0` sales 360 cycles, so no test cycle, score, talent action or employee notification was created.
- Verification: both primary tables and both workspace/talent RPCs resolve; anonymous cycle creation is denied; authenticated cycle creation is granted; marketing read-only users are blocked from talent recommendations; the hourly reminder cron job exists.
- Regression: all automated tests pass (`248/248`), including `16/16` sales-360 tests; frontend module syntax and `git diff --check` pass.
- Frontend release: source commit `6f3de59` was pushed to `main`; GitHub Pages workflow `35299762144` completed successfully. The live HTML was fetched from `https://crm.foreverdoodle.com/?v=6f3de59` and contains the 360 center, shadow-cycle action and talent-review UI.
- Release boundary: this release installs the audited scoring, anonymous evaluation, calibration, appeal, reminder and talent-recommendation foundation only. Creating the first production cycle remains a separate, explicit business action and must begin in shadow mode.
