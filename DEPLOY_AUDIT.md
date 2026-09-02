# Production deployment audit

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
