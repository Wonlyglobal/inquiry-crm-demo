# Material evidence gate

2026-09-26: Integrated gateMaterialEvidence after authorized material retrieval and relevance filtering, before concise/full renderers and returned assets. It removes unlocated excerpts and derived profiles, invalid-page or missing-hash document evidence, facts not present verbatim in a page chunk, and failed/queued/processing video evidence. This deliberately reduces profile summaries; the separately labelled series catalogue remains source-provided metadata.

The gate validates response structure, not live source hash freshness, semantic relevance, product truth, or catalogue completeness. Raw source pages are not re-fetched. Public-knowledge model answers are outside this change. No credentials, roles, source database, external AI policy or audit behavior changed. Internal material content remains on the internal branch. Roll back the new wrapper/import and module to restore previous behavior.

Validation: 537 offline tests including six new gate cases passed; browser syntax passed. Not deployed or production verified. User requested integration; implementation by Codex. Production publication requires the project owner's explicit release approval under the security baseline.
