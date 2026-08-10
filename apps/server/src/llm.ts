import { AIModel } from "universal-llm-client";
import { config } from "./config";

/**
 * AIModel factories (one per agent so each carries its own sampling defaults).
 * All point at Cerebras via the OpenAI-compatible provider.
 *
 * REASONING: the unified `thinking` flag is a NO-OP on Cerebras (the lib denylists
 * `api.cerebras.ai` from `chat_template_kwargs.enable_thinking`, and only auto-sends
 * `reasoning_effort` for OpenAI o-series/gpt-5). Gemma-4-31b's REAL reasoning toggle
 * is the native `reasoning_effort` param (none=default/off; low|medium|high=on, all
 * equivalent), which the provider forwards verbatim from `defaultParameters` and parses
 * back out into a separate `reasoning` field. Measured on Cerebras: `low` lifts the
 * structured/logic agents to 100% on a probe set at ~0 added latency (~180 reasoning
 * tokens, hidden from the JSON answer). It HURTS the generative prototype agent
 * (spends budget deliberating, adds ~1s, lowers quality) — so it's ON for the judging
 * agents (router/summarizer/factcheck/critic) and OFF for the prototype/recap.
 *
 * `max_tokens` is sized to NEVER truncate mid-document — a too-low cap severs the
 * prototype before `</html>`, which reads as the model "giving up" / being dumber.
 * The model self-terminates well under these ceilings, so a generous cap costs ~0
 * latency; it only ever bites when the model genuinely needs the room.
 */
function cerebras(defaultParameters: Record<string, unknown>): AIModel {
  return new AIModel({
    model: config.modelId,
    thinking: false,
    providers: [
      { type: "openai", url: config.cerebrasBaseUrl, apiKey: config.cerebrasApiKey },
    ],
    defaultParameters,
  });
}

// Router: deterministic-ish, tiny budget, strict JSON. Native reasoning ON (free on Cerebras).
export const routerModel = (): AIModel => cerebras({ temperature: 0.3, max_tokens: 1024, reasoning_effort: "low" });
// Summarizer: low temp, room for a full structured summary. Reasoning ON.
export const summarizerModel = (): AIModel => cerebras({ temperature: 0.5, max_tokens: 2048, reasoning_effort: "low" });
// Prototype (hero): full sampling, streamed. Cap high enough to never sever the doc.
// Reasoning OFF — it lowered quality and added latency on this generative task.
export const prototypeModel = (): AIModel => cerebras({ temperature: 1.0, top_p: 0.95, max_tokens: 16384 });
// Fact-check: cold, deterministic. Reasoning ON.
export const factcheckModel = (): AIModel => cerebras({ temperature: 0.2, max_tokens: 2048, reasoning_effort: "low" });
// Final document (closing recap): low-ish temp, large budget for a full HTML page (generative → reasoning OFF).
export const finalDocModel = (): AIModel => cerebras({ temperature: 0.4, max_tokens: 16384 });
// Critic / partner agent: judges a built artifact → reasoning ON (it's an evaluation task).
export const criticModel = (): AIModel => cerebras({ temperature: 0.3, max_tokens: 2048, reasoning_effort: "low" });
// Next-step agent: compact structured design suggestions after a prototype is ready.
export const nextStepModel = (): AIModel => cerebras({ temperature: 0.45, max_tokens: 1024, reasoning_effort: "low" });

/** Honest A/B baseline — a GPU-hosted open model. `BASELINE_PROVIDER=ollama` uses the
 *  native Ollama endpoint (where `thinking:false` actually disables reasoning); anything
 *  else uses the OpenAI-compatible provider (Together / Fireworks / vLLM / …). */
export function baselineModel(): AIModel | null {
  if (!config.baselineBaseUrl || !config.baselineModelId) return null;
  const isOllama = config.baselineProvider === "ollama";
  return new AIModel({
    model: config.baselineModelId,
    thinking: false,
    providers: [
      isOllama
        ? { type: "ollama", url: config.baselineBaseUrl }
        : { type: "openai", url: config.baselineBaseUrl, apiKey: config.baselineApiKey },
    ],
    defaultParameters: isOllama
      ? { temperature: 1.0, top_p: 0.95, num_predict: 2500 }
      : { temperature: 1.0, top_p: 0.95, max_tokens: 2500 },
    // A local 31B build can take ~45s; the lib's 30s default would abort it mid-stream.
    timeout: 120_000,
  });
}
