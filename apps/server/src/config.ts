export type AgentMode = "mock" | "live";
export type SourceMode = "fixtures" | "asr";

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
}
