# Post-wake voice dialogue

The private agent room uses on-device English recognition for the wake phrase. The approved post-wake dialogue uses the existing authenticated Beijing Bailian transcription endpoint, so it does not require a working local Chinese language pack.

After greeting playback completes, local audio energy detection starts a single utterance recording. A 1.4-second pause submits it; each clip is limited to 60 seconds and 2.4 MB. Silence returns no clip. Audio is released before transcription, model requests and playback; listening resumes after the answer. An already active conversation continues when switching browser tabs; browser suspension, closing or reloading can still interrupt it. Stop, leaving the room and session reset cancel capture and pending requests. Transcription/capture errors stop the loop visibly. Audio is held in memory only, not persisted by this frontend. Energy detection can mistake other nearby speech or noise for a question during an active dialogue; the listening indicator and stop control remain visible.

No new backend credentials, endpoint, customer data scope, database permissions or model provider. Existing exact-account server authorization remains required. The user-facing voice note explains post-wake transmission. The private authorization and deployment evidence are recorded outside the public repository.

Validation: offline state-machine/capture tests cover wake-before-upload, greeting ordering, Chinese-pack independence, cancellation including late microphone permission, silence, utterance release, spoken exit and transcription failure. Live microphone accuracy and audio playback require a real-device check; offline success does not establish those results.

Rollback: revert this frontend change; preserve the private authorization/audit record. The previous manual recording path remains available.


## Explicit continuous phone mode (2026-10-15)

The separate Start call button keeps the existing Hello workflow unchanged. During an explicit call, Grace captures the next utterance after the preceding answer audio ends, without another wake word. The same exact-account authorization, voiceprint proof, Beijing ASR, signed material gateway and private-document containment apply. No new provider or public material upload is introduced. Internal material bodies remain outside cloud TTS; only the existing fixed non-sensitive receipt is spoken.

Local PCM capture reuses one microphone/context, keeps 250 ms of pre-roll, discards silence, and encodes accepted clips as 16 kHz WAV. The default silence endpoint is 750 ms (previous wake clips use 1,400 ms); each utterance is limited to 45 seconds. Sixty seconds of no speech ends the call; each call is capped at 20 minutes. Mute cancels the pending turn and disables the input track; resume starts one listener. Hangup, spoken hangup, room exit, offline and microphone failure stop capture/requests/playback and release resources. Browser suspension can interrupt a call; the mobile app stops when hidden. No audio is persisted by this frontend.

Interruption is an explicit button action: it cancels a pending answer or playback and returns to listening. This is sequential turn-taking with manual barge-in, not full-duplex speech-over-speech. Playback is not captured as a new question. Automatic spoken barge-in and bidirectional streaming are not implemented. The design reference is Doubao's published description of interruptible voice interaction: https://www.doubao.com/legal/feature_intro .

For call requests only, the existing model receives a shorter conversational-output instruction and a 1,400-token output budget, without enabling model reasoning. Spoken lead is capped at 140 characters; the written answer is displayed when answer audio starts. Cached acknowledgement playback is cancelled when the answer arrives, rather than delaying it. Local diagnostic attributes contain only phase, turn count and timing, not transcripts or audio. Request-to-first-audio timing starts after transcription; it is not end-of-speech latency.

Offline tests cover serial turns, interrupt/mute races, voiceprint rejection, silence, late permission cleanup, timeout and network shutdown, PCM pre-roll and policy validation. Synthetic browser integration checks use injected local capture/transcription and a short generated WAV; they do not validate real speech recognition or noisy-device echo behavior. No fixed end-to-end latency SLA or Doubao-equivalent quality is claimed. Rollback the phone frontend and phone-only policy/spoken-lead changes together, preserving existing audit records; no schema/RLS change is needed.
