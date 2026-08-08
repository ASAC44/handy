/**
 * Does local Gemma 4 E4B on Ollama actually transcribe audio?
 * Reads a WAV file (generate one with Windows SAPI — see the command in chat),
 * sends it to Ollama's OpenAI-compatible /v1/chat/completions as input_audio,
 * with thinking on (default, regressed) and off. Prints transcript + latency.
 *   Run:  bun apps/server/src/_gemmaasr.ts [path-to.wav]
 */
import { readFileSync } from "node:fs";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat";
const WAV_PATH = process.argv[2] ?? process.env.ASR_WAV ?? "";
const PHRASE = "Let's build a kanban board with drag and drop and a burndown chart.";

async function transcribe(b64: string, label: string, think?: boolean): Promise<void> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the speech in this audio verbatim. Output only the transcription, no preamble." },
          { type: "input_audio", input_audio: { data: b64, format: "wav" } },
        ],
      },
    ],
    stream: false,
    temperature: 0,
  };
  if (think !== undefined) body.think = think; // Ollama extension; ignored if unsupported
  const t0 = performance.now();
  const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const dt = Math.round(performance.now() - t0);
  const raw = await res.text();
  if (!res.ok) {
    console.log(`  [${label}] HTTP ${res.status}: ${raw.slice(0, 300)}`);
    return;
  }
  let out = "";
  try {
    out = (JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  } catch {
    out = raw.slice(0, 300);
  }
  console.log(`  [${label}] ${dt}ms -> "${out.trim().slice(0, 400)}"`);
}

async function main(): Promise<void> {
  console.log("▚ gemma-asr — model:", MODEL, "via", OLLAMA);
  if (!WAV_PATH) throw new Error("pass a WAV path: bun apps/server/src/_gemmaasr.ts <file.wav>");
  const wav = readFileSync(WAV_PATH);
  console.log(`  audio: ${WAV_PATH} (${(wav.length / 1024).toFixed(1)} KB)`);
  console.log("  expected:", PHRASE);
  const b64 = wav.toString("base64");
  console.log("  transcribing (first call also loads the model)…");
  await transcribe(b64, "default (think on)");
  await transcribe(b64, "think:false");
}

main().catch((e) => {
  console.error("❌ gemma-asr FAILED:", e?.message ?? e);
  process.exit(1);
});
