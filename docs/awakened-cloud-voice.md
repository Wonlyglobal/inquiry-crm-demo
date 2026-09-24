# Post-wake voice dialogue

The private agent room uses on-device English recognition for the wake phrase. The approved post-wake dialogue uses the existing authenticated Beijing Bailian transcription endpoint, so it does not require a working local Chinese language pack.

After greeting playback completes, local audio energy detection starts a single utterance recording. A 1.4-second pause submits it; each clip is limited to 60 seconds and 2.4 MB. Silence returns no clip. Audio is released before transcription, model requests and playback; listening resumes after the answer. An already active conversation continues when switching browser tabs; browser suspension, closing or reloading can still interrupt it. Stop, leaving the room and session reset cancel capture and pending requests. Transcription/capture errors stop the loop visibly. Audio is held in memory only, not persisted by this frontend. Energy detection can mistake other nearby speech or noise for a question during an active dialogue; the listening indicator and stop control remain visible.

No new backend credentials, endpoint, customer data scope, database permissions or model provider. Existing exact-account server authorization remains required. The user-facing voice note explains post-wake transmission. The private authorization and deployment evidence are recorded outside the public repository.

Validation: offline state-machine/capture tests cover wake-before-upload, greeting ordering, Chinese-pack independence, cancellation including late microphone permission, silence, utterance release, spoken exit and transcription failure. Live microphone accuracy and audio playback require a real-device check; offline success does not establish those results.

Rollback: revert this frontend change; preserve the private authorization/audit record. The previous manual recording path remains available.
