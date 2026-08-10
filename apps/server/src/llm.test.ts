import { describe, expect, test } from "bun:test";
import { normalizeProviderParameters } from "./llm";

describe("normalizeProviderParameters", () => {
  test("adapts official OpenAI GPT-5 Chat Completions parameters", () => {
    expect(
      normalizeProviderParameters("https://api.openai.com", "gpt-5-nano", {
        temperature: 0.3,
        top_p: 0.95,
        max_tokens: 1024,
        reasoning_effort: "low",
      }),
    ).toEqual({
      max_completion_tokens: 1024,
      reasoning_effort: "low",
    });
  });

  test("preserves parameters for Cerebras", () => {
    const parameters = { temperature: 0.3, max_tokens: 1024, reasoning_effort: "low" };
    expect(
      normalizeProviderParameters("https://api.cerebras.ai", "gemma-4-31b", parameters),
    ).toBe(parameters);
  });
});
