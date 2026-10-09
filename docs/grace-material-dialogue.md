# Grace material followups

Material retrieval gets its own per-persona, in-memory context containing the last resolved user query only. No material response/excerpt is added to external model history. The gateway validates a bounded materialHistory field and resolves internal followups separately; requestBody never serializes that field. Switching topics clears it; clearing the conversation removes it. There is no new persistent memory or database permission.

Model/property followups preserve a single explicit model. Multiple/no candidate models prompt clarification rather than guessing. Next page preserves search terms, and expand shows detailed evidence. Default answers show three sources with page/version evidence; coverage and empty-result requests have dedicated short answers. Video excerpt timestamps remain available.

Difference alerts are tentative: only current-version documents, a single explicit model declaration on a page, differing exact field quotations found in the returned page text, and distinct source IDs. They do not establish factual contradiction, compare all records, or resolve certification/conditions automatically. Returned evidence is bounded; lack of an alert does not mean consistency.

Validation uses synthetic model names and excerpts. No company document text is checked into the repository. Rollback the gateway and frontend together; no migration is involved.
