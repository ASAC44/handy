/**
 * Pluggable ASR (speech -> transcript) seam. Each provider captures audio and
 * emits interim ("partial") and finalized ("final") transcript text; the caller
 * forwards those as `transcript.partial` / `transcript.final` events to the
 * server, which feeds the orchestrator. Providers: ElevenLabs Scribe v2 (cloud),
 * Web Speech (browser builtin), and Gemma 4 E4B (planned, on-device).
 */
export type AsrProviderId = "elevenlabs" | "webspeech" | "gemma-local" | "whisper-webgpu";

/** Per-utterance timing — providers with measurable segmentation (Gemma local). */
export interface AsrMetrics {
  /** Captured utterance length (ms). */
  segmentMs: number;
  /** Server round-trip to transcribe it (ms). */
  transcribeMs: number;
}

export interface AsrCallbacks {
  /** Interim, still-changing transcript for the in-flight utterance. */
  onPartial(text: string): void;
  /** A finalized utterance segment. */
  onFinal(text: string): void;
  /** Non-fatal error / status text for the UI. */
  onError(message: string): void;
  /** 0..1 mic input level for a live meter (providers with audio access only). */
  onLevel?(level: number): void;
  /** Timing for the just-finalized utterance, to surface the live latency. */
  onMetrics?(m: AsrMetrics): void;
  /** Engine setup progress (e.g. on-device model download/warm-up). */
  onStatus?(m: { text: string; progress?: number }): void;
}

export interface AsrProvider {
  readonly id: AsrProviderId;
  readonly label: string;
  /** Begin capturing + transcribing. Resolves once capture is live; throws on setup failure. */
  start(cb: AsrCallbacks): Promise<void>;
  /** Stop capture and release mic / sockets. Safe to call multiple times. */
  stop(): void;
  /** Gate transcription without tearing down the mic (push-to-talk). Mic stays warm;
   *  audio/results are suppressed while muted. No-op for providers that don't implement it. */
  setMuted?(muted: boolean): void;
}

export interface AsrProviderMeta {
  id: AsrProviderId;
  label: string;
  /** Usable in the current environment without extra setup. */
  available: boolean;
  hint?: string;
}
