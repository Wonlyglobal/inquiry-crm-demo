# Production deployment audit

## 2026-09-02 14:39:10 +08:00 — exclude quarantined warm-up records

- Target: GitHub Pages production site `http://crm.foreverdoodle.com/`.
- Executor: Codex acting through the authenticated `Wonlyglobal` GitHub account.
- Reason: prevent the 48 quarantined Instantly warm-up records from appearing in inquiry management, the management dashboard, sales daily reporting, or historical lead reporting.
- Before commit: `79a9429a94508400bb5485abf58168d97201fbdc`.
- Before `index.html` SHA-256: `2accbd34c49f50ed1995375e9175aaaded46f30da646bff785b1c177780daf77`.
- Before content retention: the complete prior `index.html` remains recoverable from the Git parent commit above.
- Change summary: add `excluded_from_dashboard = false` to every list/statistics query that feeds the four affected UI surfaces; keep direct-detail and duplicate-detection queries unchanged because they are not dashboard/list output and historical duplicate evidence must remain discoverable.
