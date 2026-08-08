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
import { AUDIO_DIR, MANIFEST_PATH, MEETINGS_DIR, MEETINGS_MANIFEST_PATH, wer } from "./lib";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat";

/** Common shape across both manifests (canonical + meetings) — only what the bench reads. */
interface BenchClip {
  index: number;
  speaker: string;
  file: string;
  text: string;
  lang?: string;
  kind?: string;
}
interface BenchManifest {
  seed: number;
  sample_rate: number;
  scenarios: { id: string; title: string; clips: BenchClip[] }[];
}

type FixtureSet = "canonical" | "meetings";

interface Args {
  scenario?: string;
  show: boolean;
  set: FixtureSet;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { show: false, set: "canonical" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scenario") out.scenario = argv[++i];
    else if (argv[i] === "--show") out.show = true;
    else if (argv[i] === "--set") out.set = argv[++i] === "meetings" ? "meetings" : "canonical";
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
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.set === "meetings" ? MEETINGS_MANIFEST_PATH : MANIFEST_PATH;
  const baseDir = args.set === "meetings" ? MEETINGS_DIR : AUDIO_DIR;
  const genCmd = args.set === "meetings" ? "meetings:gen" : "asr:gen";

  let manifest: BenchManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BenchManifest;
  } catch {
    throw new Error(`no manifest at ${manifestPath} — run \`bun run ${genCmd}\` first.`);
  }
  const scenarios = manifest.scenarios.filter((s) => !args.scenario || s.id === args.scenario);
  if (!scenarios.length) throw new Error(`no scenario "${args.scenario}" in manifest`);

  if (!(await ollamaUp())) {
    throw new Error(`Ollama not reachable at ${OLLAMA}. Start it (\`ollama serve\`) and pull ${MODEL}.`);
  }

  console.log(`▚ asr-bench — set=${args.set} backend=gemma-local model=${MODEL} via ${OLLAMA}`);
  console.log(`  fixtures: ${manifest.scenarios.length} scenario(s), seed=${manifest.seed}, ${manifest.sample_rate}Hz WAV\n`);

  let totEdits = 0;
  let totWords = 0;
  const latencies: number[] = [];
  const byLang = new Map<string, { edits: number; words: number }>();

  for (const scn of scenarios) {
    console.log(`── ${scn.id} (${scn.title})`);
    for (const clip of scn.clips) {
      const wavPath = resolve(baseDir, clip.file);
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
      const lang = clip.lang ?? "en";
      const bucket = byLang.get(lang) ?? { edits: 0, words: 0 };
      bucket.edits += w.sub + w.del + w.ins;
      bucket.words += w.n;
      byLang.set(lang, bucket);
      const flag = w.wer === 0 ? "✓" : pct(w.wer).padStart(6);
      const meta = [clip.lang, clip.kind && clip.kind !== "talk" ? clip.kind : ""].filter(Boolean).join(",");
      console.log(`  [${String(clip.index).padStart(2, "0")}] ${clip.speaker.padEnd(6)} ${flag}  ${ms}ms  (S${w.sub} D${w.del} I${w.ins} / ${w.n}w)${meta ? `  [${meta}]` : ""}`);
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
  if (byLang.size > 1) {
    for (const [lang, b] of [...byLang].sort()) {
      console.log(`    ${lang}: ${pct(b.words ? b.edits / b.words : 0)}  (${b.edits}/${b.words}w)`);
    }
  }
  console.log(`  latency: p50 ${percentile(sorted, 50)}ms  p95 ${percentile(sorted, 95)}ms  (n=${latencies.length})`);
}

main().catch((e) => {
  console.error("❌ asr-bench FAILED:", e?.message ?? e);
  process.exit(1);
});
