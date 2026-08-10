export type AgentMode = "mock" | "live";
export type SourceMode = "fixtures" | "asr";
/** tavily = ground fact-check verdicts on Tavily web search; none = model self-reports. */
export type FactcheckSearch = "tavily" | "none";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** mock = replay fixture gold labels (no key); live = real Cerebras inference. */
  agents: (process.env.AGENTS ?? "mock") as AgentMode,
  /** fixtures = replay test-transcripts.json; asr = Deepgram (TODO). */
  source: (process.env.SOURCE ?? "fixtures") as SourceMode,
  scenario: process.env.FIXTURE_SCENARIO ?? "sprint-planning",

  modelId: process.env.MODEL_ID ?? "gemma-4-31b",
  // NOTE: universal-llm-client appends /v1, so this must NOT include /v1.
  cerebrasBaseUrl: process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai",
  cerebrasApiKey: process.env.CEREBRAS_API_KEY ?? "",

  /** Web-search backend for the live fact-check agent (retrieve-then-ground). */
  factcheckSearch: (process.env.FACTCHECK_SEARCH ?? "tavily") as FactcheckSearch,
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",

  /** ElevenLabs Scribe v2 Realtime — client-side ASR via a single-use token minted server-side. */
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",

  /** Host passcode — the single secret the HOST uses to connect to their own server.
   *  When set, it (a) gates the WS / ASR / upload endpoints and (b) is what grants the
   *  server-authoritative `host` role. Guests never use it; they each get a unique,
   *  host-minted invite code instead. Empty = open (local dev: anyone can host).
   *  `HOST_PASSCODE` is the canonical name; `MEETING_PASSWORD` stays as an alias for
   *  backward compatibility with existing setups. */
  hostPasscode: process.env.HOST_PASSCODE ?? process.env.MEETING_PASSWORD ?? "",

  /** Local Gemma ASR: Ollama (OpenAI-compatible /v1 input_audio) for on-device, all-Gemma transcription. */
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  gemmaAsrModel: process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat",

  /** Host-visible export folder. In Docker this is mounted to ./exports by compose. */
  exportsDir: process.env.EXPORTS_DIR ?? "exports",

  /** Honest A/B GPU baseline. provider=ollama uses the native endpoint (thinking:false
   *  works there; the OpenAI-compat /v1 path ignores it and burns tokens on reasoning). */
  baselineProvider: (process.env.BASELINE_PROVIDER ?? "openai") as "openai" | "ollama",
  baselineBaseUrl: process.env.BASELINE_BASE_URL ?? "",
  baselineApiKey: process.env.BASELINE_API_KEY ?? "",
  baselineModelId: process.env.BASELINE_MODEL_ID ?? "",
};

export function assertLiveReady(): void {
  if (config.agents === "live" && !config.cerebrasApiKey) {
    console.warn(
      "[config] AGENTS=live but CEREBRAS_API_KEY is empty — agent calls will fail. " +
        "Set it in .env or run with AGENTS=mock.",
    );
  }
  if (config.agents === "live" && config.factcheckSearch === "tavily" && !config.tavilyApiKey) {
    console.warn(
      "[config] FACTCHECK_SEARCH=tavily but TAVILY_API_KEY is empty — fact-check will fall back to " +
        "the model's own knowledge (no web grounding). Set TAVILY_API_KEY or FACTCHECK_SEARCH=none.",
    );
  }
}
