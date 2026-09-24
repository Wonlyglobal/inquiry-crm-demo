# Internal document/product evidence

Internal product questions route to the material service, never the external dialogue model. Signed requests carry bounded query terms; results preserve document version and page/worksheet references. Parameters and certification statements remain attributed excerpts, not verified product claims. The response reports extraction coverage separately from knowledge verification.

Source service adds an independent document index (page text + OCR, spreadsheet coordinates). It requires the existing live CRM authorization, single-use signature, and active verified source member. Deleted or replaced files do not expose old evidence. The background worker only reads file location/deletion metadata and originals; it writes its own index, with no asset or membership mutations, in an isolated internal network. New files are discovered periodically. Unsupported formats and extraction failures remain visible.

Limits: extracted text is not complete visual understanding; cached spreadsheet formulas are not recalculated; OCR/table order requires review; Office page references refer to converted PDF. No verified cross-model fact merging or automatic certification decision. Product-owner review with real questions remains necessary. Rollback the formatter/source route and stop the indexer; preserve evidence and audit.

Checks: CRM offline routing/evidence tests, source authorization tests, source build, rollback-only SQL EXPLAIN, and isolated synthetic PDF/OCR/DOCX runtime test. Production status is tracked in private deployment audit; tests alone do not imply release.
