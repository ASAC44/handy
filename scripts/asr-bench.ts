/**
 * Headless ASR benchmark over the committed audio fixtures. Drives the same local
 * Gemma 4 E4B path the app uses (Ollama /v1/chat/completions `input_audio`), scores
 * each clip's transcript against the gold text with word error rate (WER), and
 * prints a per-segment + aggregate table. Deterministic input (committed WAVs) +
 * temperature 0 -> reproducible runs. Supersedes the _gemmaasr.ts/_asrcheck.ts
 * scratch scripts.
 *
 *   bun run asr:bench
 *   bun run asr:bench --scenario sprint-planning
 *   bun run asr:bench --show         # print ref/hyp for every clip, not just misses
 *
 * Needs Ollama running with the Gemma audio model (see OLLAMA_URL / GEMMA_ASR_MODEL).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIO_DIR, MANIFEST_PATH, wer, type Manifest } from "./lib";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat";

interface Args {
  scenario?: string;
  show: boolean;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { show: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scenario") out.scenario = argv[++i];
    else if (argv[i] === "--show") out.show = true;
  }
  return out;
}

async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Transcribe one WAV via Ollama's OpenAI-compatible input_audio path (same as the app). */
async function transcribe(wavPath: string): Promise<string> {
  const b64 = readFileSync(wavPath).toString("base64");
  const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
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
      think: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main(): Promise<void> {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    throw new Error(`no manifest at ${MANIFEST_PATH} — run \`bun run asr:gen\` first.`);
  }
  const args = parseArgs(process.argv.slice(2));
  const scenarios = manifest.scenarios.filter((s) => !args.scenario || s.id === args.scenario);
  if (!scenarios.length) throw new Error(`no scenario "${args.scenario}" in manifest`);

  if (!(await ollamaUp())) {
    throw new Error(`Ollama not reachable at ${OLLAMA}. Start it (\`ollama serve\`) and pull ${MODEL}.`);
  }

  console.log(`▚ asr-bench — backend=gemma-local model=${MODEL} via ${OLLAMA}`);
  console.log(`  fixtures: ${manifest.scenarios.length} scenario(s), seed=${manifest.seed}, ${manifest.sample_rate}Hz WAV\n`);

  let totEdits = 0;
  let totWords = 0;
  const latencies: number[] = [];

  for (const scn of scenarios) {
    console.log(`── ${scn.id} (${scn.title})`);
    for (const clip of scn.clips) {
      const wavPath = resolve(AUDIO_DIR, clip.file);
      const t0 = performance.now();
      let hyp = "";
      let err = "";
      try {
        hyp = await transcribe(wavPath);
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      const ms = Math.round(performance.now() - t0);
      latencies.push(ms);
      if (err) {
        console.log(`  [${String(clip.index).padStart(2, "0")}] ${clip.speaker}  ERROR ${err}`);
        continue;
      }
      const w = wer(clip.text, hyp);
      totEdits += w.sub + w.del + w.ins;
      totWords += w.n;
      const flag = w.wer === 0 ? "✓" : pct(w.wer).padStart(6);
      console.log(`  [${String(clip.index).padStart(2, "0")}] ${clip.speaker.padEnd(6)} ${flag}  ${ms}ms  (S${w.sub} D${w.del} I${w.ins} / ${w.n}w)`);
      if (args.show || w.wer > 0) {
        console.log(`        ref: ${clip.text}`);
        console.log(`        hyp: ${hyp || "(empty)"}`);
      }
    }
    console.log("");
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  console.log("══ aggregate");
  console.log(`  WER (micro): ${pct(totWords ? totEdits / totWords : 0)}  (${totEdits} edits / ${totWords} words)`);
  console.log(`  latency: p50 ${percentile(sorted, 50)}ms  p95 ${percentile(sorted, 95)}ms  (n=${latencies.length})`);
}

main().catch((e) => {
  console.error("❌ asr-bench FAILED:", e?.message ?? e);
  process.exit(1);
});
