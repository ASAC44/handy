import { AIModel } from "universal-llm-client";
import { config } from "./config";

/**
 * AIModel factories (one per agent so each carries its own sampling defaults).
 * All point at Cerebras via the OpenAI-compatible provider. `thinking: false`
 * keeps reasoning off — reasoning tokens would burn the latency budget that is
 * the whole demo.
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

// Router: deterministic-ish, tiny budget, strict JSON.
export const routerModel = (): AIModel => cerebras({ temperature: 0.3, max_tokens: 512 });
// Summarizer: low temp, room for structure.
export const summarizerModel = (): AIModel => cerebras({ temperature: 0.5, max_tokens: 1024 });
// Prototype (hero): full sampling, streamed.
export const prototypeModel = (): AIModel => cerebras({ temperature: 1.0, top_p: 0.95, max_tokens: 2500 });
// Fact-check: cold, deterministic.
export const factcheckModel = (): AIModel => cerebras({ temperature: 0.2, max_tokens: 1024 });

/** Honest A/B baseline — a GPU-hosted open model on any OpenAI-compatible endpoint. */
export function baselineModel(): AIModel | null {
  if (!config.baselineBaseUrl || !config.baselineModelId) return null;
  return new AIModel({
    model: config.baselineModelId,
    thinking: false,
    providers: [
      { type: "openai", url: config.baselineBaseUrl, apiKey: config.baselineApiKey },
    ],
    defaultParameters: { temperature: 1.0, top_p: 0.95, max_tokens: 2500 },
  });
}
