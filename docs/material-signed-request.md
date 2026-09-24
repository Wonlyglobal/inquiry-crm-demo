# Material lookup signed request

The material server cannot reach the CRM authentication host. CRM continues to validate the live session and active eligible profile for every conversation request before signing a material query. The material server verifies a P-256/SHA-256 signature and its existing local member permissions. No fallback accepts unsigned requests, forwards session tokens, or sends internal search results to a model.

The signed payload binds issuer, audience, exact actor, POST method, fixed route, SHA-256 of the exact request body, issue/expiry times and a random request ID. Lifetime is 30 seconds; future issue times beyond 3 seconds are rejected. The material database claims the ID using a primary key and `ON CONFLICT DO NOTHING RETURNING`, before reading any materials. IDs persist across workers/restarts. Audit records remain separate. An account revoked after issuance has at most the remaining 30-second lifetime; material member state is checked at consumption.

## Deployment order

1. Apply the reviewed `deploy/crm-knowledge-requests.sql` on the material service database. It adds only a nonce table and expiry index; no document, identity or permission changes.
2. Generate a dedicated P-256 key pair via the normal secret-management workflow. Store private JWK only as CRM `MATERIAL_SIGNING_PRIVATE_JWK`; store public JWK only as material `CRM_KNOWLEDGE_PUBLIC_JWK`. Never put either config in the public repository. Retain the existing bridge credential as a second check.
3. Deploy source verifier helper and knowledge route using material safe-deploy. No source changes to unrelated dirty files.
4. Deploy the CRM function through normal tested PR release. Missing signing config fails closed. Requests during staggered rollout may temporarily fail.
5. Check anonymous denial, authorized UI lookup and material link; verify audit exists without logging query/document contents. No external model receives internal results.

Rollback: withdraw CRM signing config and revert both coordinated code versions; retain nonce/audit records. The former source implementation still has its known network failure, so rollback restores denial, not successful lookup. Rotate using a coordinated key switch; old requests must expire before removing the previous key. This first version has one configured key and no multi-key overlap.

## Validation

CRM 495 offline tests pass, including exact-body binding, expiry, future timestamp, wrong key, actor denial, no JWT forwarding and returned-field minimization. Material route tests use synthetic database behavior to verify replay claim precedes lookup, two worker simulations consume only one ID, invalid proofs never query the database, and no outbound authentication/model request occurs. The SQL uniqueness guarantee still requires production migration and integration acceptance; offline tests are not deployment evidence.
