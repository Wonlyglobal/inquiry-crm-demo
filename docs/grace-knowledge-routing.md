# Grace knowledge and material retrieval candidate

## Behavior
- General questions bypass CRM/SEO/social reads and use a general-purpose system prompt.
- Business questions select relevant existing approved sources; a short follow-up carries the previous question's topic.
- Time-sensitive public questions use Beijing DashScope native search with source metadata. Mixed internal questions emit only fixed public topic tokens; search never receives history or CRM statistics. Provider search summaries are not independently verified page text, and missing publication dates stay unknown. Failure is explicit.
- Material requests use a separate internal-only branch, return catalogue/existing text-index excerpts directly, and are excluded from model history. No internal document text is submitted to the model, including TTS (which receives a fixed receipt only). Material source checks the exact active CRM owner and existing active material account on every request, excludes deleted assets, and audits reads. Pagination and historical-version labels remain visible; no claim to have read all files or watched videos.
- A fixed greeting is prefetched when entering Grace. An immediate status acknowledges a question; after 4.5 seconds a pending status is shown. This is feedback, not a promise that arbitrary model/search requests complete within 5 seconds.
- Already active voice persists across browser tab switches. Explicit stop, leaving the room, logout, page reload/close still end it; browser suspension remains outside app control.
- Provider branding is removed from normal status and answer footers; privacy/connection information retains the actual service disclosure.

## Boundaries and remaining work
No new CRM RLS, customer detail access, public posting, automated business execution, long-term memory or full document ingestion. Existing material text extraction covers some document/image formats but coverage and production backlog have not been verified. Newly added source endpoint is a separate material-server release; no source-system restart is included merely by merging the CRM PR. Source deployment must use its safe deployment procedure and respect active transfers.

Validation: offline routing, source parsing, missing-source failure, internal material field minimization, invalid-origin rejection, state cancellation and sub-five-second pending feedback. Real model/search latency, source deployment and human voice remain distinct production acceptance items.

Protocol reference (checked 2026-09-24): https://www.alibabacloud.com/help/en/model-studio/web-search . Native DashScope enables source metadata; no unsupported compatible-API source claims.

Rollback: revert CRM frontend/function together; remove the new material knowledge route if released, preserving read audits. Existing material integration, uploads, downloads and business permissions remain unchanged.
