import type { AsrProvider, AsrProviderId, AsrProviderMeta } from "./types";
import { ElevenLabsScribeProvider } from "./elevenlabs";
import { WebSpeechProvider, webSpeechAvailable } from "./webspeech";
import { GemmaLocalProvider, GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";

export type { AsrProvider, AsrProviderId, AsrProviderMeta, AsrCallbacks, AsrMetrics } from "./types";
export { webSpeechAvailable } from "./webspeech";
export { GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";

/** `vad` is only used by the Gemma-local provider; pass the object the UI mutates to retune live. */
export function createAsrProvider(id: AsrProviderId, vad?: GemmaVad): AsrProvider {
  switch (id) {
    case "elevenlabs":
      return new ElevenLabsScribeProvider();
    case "gemma-local":
      return new GemmaLocalProvider(vad ?? { ...GEMMA_VAD_DEFAULTS });
    case "webspeech":
    default:
      return new WebSpeechProvider();
  }
}

/** Provider catalog for the UI selector (label + availability + hint). */
export function asrProviders(): AsrProviderMeta[] {
  const hasWebSpeech = webSpeechAvailable();
  return [
    { id: "elevenlabs", label: "ElevenLabs Scribe v2", available: true, hint: "needs ELEVENLABS_API_KEY on the server" },
    { id: "webspeech", label: "Browser (Web Speech)", available: hasWebSpeech, hint: hasWebSpeech ? undefined : "unsupported in this browser" },
    { id: "gemma-local", label: "Gemma 4 E4B (local)", available: true, hint: "on-device via Ollama; ~1s/utterance, finals only" },
  ];
}
