import type { AsrProvider, AsrProviderId, AsrProviderMeta } from "./types";
import { ElevenLabsScribeProvider } from "./elevenlabs";
import { WebSpeechProvider, webSpeechAvailable } from "./webspeech";
import { GemmaLocalProvider, GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";
import { WhisperWebgpuProvider, webgpuAvailableCached } from "./whisperWebgpu";
import type { Playback } from "./audioSource";

export type { AsrProvider, AsrProviderId, AsrProviderMeta, AsrCallbacks, AsrMetrics } from "./types";
export type { Playback } from "./audioSource";
export { webSpeechAvailable } from "./webspeech";
export { GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";
export { probeWebgpu, webgpuAvailableCached } from "./whisperWebgpu";
export { WHISPER_MODELS, DEFAULT_WHISPER_MODEL, type WhisperModelMeta } from "./whisperModels";

/** Engines that decode their own audio (energy VAD) — the only ones that can play back a recording. */
export const PLAYBACK_ENGINES: readonly AsrProviderId[] = ["gemma-local", "whisper-webgpu"];
export function engineSupportsPlayback(id: AsrProviderId): boolean {
  return PLAYBACK_ENGINES.includes(id);
}

export interface CreateAsrOpts {
  /** Mutated by the UI to retune the Gemma VAD live. */
  vad?: GemmaVad;
  /** BCP-47 language, or "auto"/undefined to let the engine auto-detect (Web Speech can't). */
  lang?: string;
  /** Whisper model tier key (base | small | large-v3-turbo) for the whisper-webgpu engine. */
  whisperModel?: string;
  /** A recording to decode through the live pipeline instead of the mic (VAD engines only). */
  playback?: Playback;
}

export function createAsrProvider(id: AsrProviderId, opts: CreateAsrOpts = {}): AsrProvider {
  const lang = opts.lang && opts.lang !== "auto" ? opts.lang : undefined;
  switch (id) {
    case "elevenlabs":
      // Scribe auto-detects when language_code is omitted; force it when picked (ISO 639-1).
      return new ElevenLabsScribeProvider({ language: lang ? lang.split("-")[0] : undefined });
    case "gemma-local":
      return new GemmaLocalProvider(opts.vad ?? { ...GEMMA_VAD_DEFAULTS }, opts.playback);
    case "whisper-webgpu":
      return new WhisperWebgpuProvider(opts.vad ?? { ...GEMMA_VAD_DEFAULTS }, lang, opts.whisperModel, opts.playback);
    case "webspeech":
    default:
      // Web Speech needs an explicit BCP-47 lang; undefined -> the browser's language.
      return new WebSpeechProvider(lang);
  }
}

/** Provider catalog for the UI selector (label + availability + hint). */
export function asrProviders(): AsrProviderMeta[] {
  const hasWebSpeech = webSpeechAvailable();
  return [
    { id: "elevenlabs", label: "ElevenLabs Scribe v2", available: true, hint: "needs ELEVENLABS_API_KEY on the server" },
    { id: "webspeech", label: "Browser (Web Speech)", available: hasWebSpeech, hint: hasWebSpeech ? undefined : "unsupported in this browser" },
    { id: "gemma-local", label: "Gemma 4 E4B (local)", available: true, hint: "on-device via Ollama; ~1s/utterance, finals only" },
    {
      id: "whisper-webgpu",
      label: "Whisper (your GPU)",
      available: webgpuAvailableCached(),
      hint: webgpuAvailableCached() ? "on-device · WebGPU · multilingual · ~200MB first load" : "needs WebGPU (Chrome/Edge)",
    },
  ];
}
