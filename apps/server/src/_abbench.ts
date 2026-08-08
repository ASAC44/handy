/**
 * Honest A/B benchmark: the SAME prototype prompt through Cerebras gemma-4-31b
 * vs local Ollama Gemma 4 (GPU baseline). Reports tok/s, time-to-first-token,
 * total idea->artifact ms, and whether valid HTML came out.
 *   Run:  bun apps/server/src/_abbench.ts
 *   Env:  BENCH_MAXTOK (default 256 for a fast rate probe; set 2500 for a full build)
 */
import { AIModel } from "universal-llm-client";
import { prototypeModel } from "./llm";
import { prototypeSystemFor } from "@sidebar/shared";

const MAXTOK = Number(process.env.BENCH_MAXTOK ?? 256);
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const INTENT = "Kanban board with drag-and-drop columns and a sprint burndown chart";
const TRANSCRIPT =
  "Maya: we track sprint work in a spreadsheet and nobody looks at it.\n" +
  "Priya: we need something visual — a board, columns, cards you can drag.\n" +
  "Maya: what if we built a kanban board with drag-and-drop and a burndown chart?";

function ollama(model: string): AIModel {
  // Native Ollama provider: thinking:false -> think:false (the /v1 OpenAI-compat
  // path ignores it and wastes the token budget on reasoning).
  return new AIModel({
    model,
    thinking: false,
    providers: [{ type: "ollama", url: OLLAMA }],
    defaultParameters: { temperature: 1.0, top_p: 0.95, num_predict: MAXTOK },
  });
}

async function bench(name: string, model: AIModel): Promise<void> {
  const messages = [
    { role: "system", content: prototypeSystemFor(null) },
    { role: "user", content: `Idea (intent): ${INTENT}\nRecent transcript: ${TRANSCRIPT}\nOutput the HTML now.` },
  ] as never;
  let html = "";
  let ttft = 0;
  const t0 = performance.now();
  try {
    for await (const ev of model.chatStream(messages)) {
      if (ev.type === "text") {
        if (!ttft) ttft = performance.now() - t0;
        html += ev.content;
      }
    }
  } catch (e) {
    console.log(`  ${name.padEnd(26)} ERROR: ${(e as Error).message}`);
    return;
  }
  const ms = Math.round(performance.now() - t0);
  const tokens = Math.round(html.length / 4);
  const tokPerS = ms > 0 ? Math.round((tokens / ms) * 1000) : 0;
  const ok = /<!doctype html|<html[\s>]/i.test(html);
  console.log(
    `  ${name.padEnd(26)} ${String(tokPerS).padStart(5)} tok/s  ${String(ms).padStart(6)}ms total  ttft=${String(Math.round(ttft)).padStart(5)}ms  ${tokens} tok  html=${ok ? "✓" : "✗"}`,
  );
}

async function main(): Promise<void> {
  console.log(`▚ A/B prototype bench (max_tokens=${MAXTOK})\n  intent: ${INTENT}\n`);
  console.log("── Cerebras (fast side) ──");
  await bench("cerebras gemma-4-31b", prototypeModel());
  console.log("\n── Local Ollama GPU baseline (cold = first call loads model) ──");
  for (const m of (process.env.BENCH_OLLAMA_MODELS ?? "gemma4:31b-it-qat,gemma4:12b-it-qat").split(",")) {
    await bench(`ollama ${m} (cold)`, ollama(m));
    await bench(`ollama ${m} (warm)`, ollama(m));
  }
}

main().catch((e) => {
  console.error("❌ abbench FAILED:", e?.message ?? e);
  process.exit(1);
});
