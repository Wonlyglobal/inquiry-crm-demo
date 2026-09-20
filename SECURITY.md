# Security reporting and release policy

Do not publish credentials, customer records, or exploit details in public issues or pull requests. Use GitHub private vulnerability reporting for security findings.

Production changes must use a pull request and pass CRM regression and secret scanning. Require an independent review, resolve review conversations and repeat approval after changes. Do not bypass branch protection to deliver a routine change.

Keep credentials in server-side secret storage. Never commit customer exports or production logs. Use synthetic data for tests. Dependabot changes require review and must not auto-merge.

Frontend-only rollbacks use a reviewed revert pull request. Database or permission changes require a separate approved migration and recovery plan.
