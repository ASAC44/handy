/**
 * Headless ASR benchmark over the committed audio fixtures. Drives one or more
 * backends and scores word error rate (WER) against the gold transcripts:
 *   - gemma  : local Gemma 4 E4B via Ollama (/v1/chat/completions input_audio)
 *   - scribe : ElevenLabs Scribe v2 Realtime, headless over the WS (cloud STT)
 *
 * Deterministic input (committed WAVs). Gemma at temp 0 is reproducible; Scribe is
 * a remote service (same fixed input, output can drift, costs STT credit per run).
 *
 *   bun run asr:bench                                  # canonical set, gemma
 *   bun run meetings:bench                             # realism set, gemma
 *   bun run meetings:bench --backend both              # gemma vs scribe head-to-head
 *   bun run meetings:bench --backend scribe --scenario growth-sync-en
 *   bun run meetings:bench --backend both --show       # also print ref/hyp per clip
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIO_DIR, MANIFEST_PATH, MEETINGS_DIR, MEETINGS_MANIFEST_PATH, wer } from "./lib";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat";
const KEY = process.env.ELEVENLABS_API_KEY ?? "";

type Backend = "gemma" | "scribe";

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
  backends: Backend[];
}
function parseArgs(argv: string[]): Args {
  const out: Args = { show: false, set: "canonical", backends: ["gemma"] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scenario") out.scenario = argv[++i];
    else if (argv[i] === "--show") out.show = true;
    else if (argv[i] === "--set") out.set = argv[++i] === "meetings" ? "meetings" : "canonical";
    else if (argv[i] === "--backend") {
      const v = argv[++i];
      out.backends = v === "both" ? ["gemma", "scribe"] : v === "scribe" ? ["scribe"] : ["gemma"];
    }
  }
  return out;
}

// ── gemma (Ollama) ───────────────────────────────────────────────────────────
async function ollamaUp(): Promise<boolean> {
  try {
    return (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function transcribeGemma(wavPath: string): Promise<string> {
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

// ── scribe (ElevenLabs Scribe v2 Realtime, headless WS) ──────────────────────
const SCRIBE_WS = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

/** Raw S16LE PCM bytes from a canonical WAV (locate the `data` chunk). */
function readWavPcm(wavPath: string): Buffer {
  const w = readFileSync(wavPath);
  let off = 12;
  while (off + 8 <= w.length) {
    const id = String.fromCharCode(w[off]!, w[off + 1]!, w[off + 2]!, w[off + 3]!);
    const size = w.readUInt32LE(off + 4);
    if (id === "data") return w.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  return w.subarray(44);
}

async function mintScribeToken(): Promise<string> {
  const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-length": "0" },
    body: "",
  });
  if (!res.ok) throw new Error(`Scribe token mint HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { token: string }).token;
}

/** Stream one clip through Scribe Realtime; flush with trailing silence (VAD commit). */
async function transcribeScribe(wavPath: string, lang: string): Promise<string> {
  const token = await mintScribeToken();
  const pcm = readWavPcm(wavPath);
  return await new Promise<string>((resolveP, rejectP) => {
    const params = new URLSearchParams({
      token,
      model_id: "scribe_v2_realtime",
      audio_format: "pcm_16000",
      language_code: lang,
      commit_strategy: "vad",
    });
    const ws = new (globalThis as { WebSocket: new (u: string) => WSLike }).WebSocket(`${SCRIBE_WS}?${params}`);
    const finals: string[] = [];
    let done = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const hard = setTimeout(() => finish(), 30000);
    const finish = (err?: Error): void => {
      if (done) return;
      done = true;
      if (idle) clearTimeout(idle);
      clearTimeout(hard);
      try {
        ws.close(1000);
      } catch {
        /* already closed */
      }
      if (err) rejectP(err);
      else resolveP(finals.join(" ").replace(/\s+/g, " ").trim());
    };
    // finish once messages stop arriving after we've sent everything
    const armIdle = (): void => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => finish(), 2000);
    };
    const FRAME = 4096 * 2; // bytes per chunk
    const sendBuf = (buf: Buffer): void => {
      for (let o = 0; o < buf.byteLength; o += FRAME) {
        ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: buf.subarray(o, o + FRAME).toString("base64") }));
      }
    };
    ws.addEventListener("open", () => {
      sendBuf(pcm);
      sendBuf(Buffer.alloc(16000 * 2 * 3)); // ~3s silence -> VAD commits
      armIdle();
    });
    ws.addEventListener("message", (e: { data: unknown }) => {
      let m: { message_type?: string; text?: string };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.message_type === "committed_transcript" || m.message_type === "committed_transcript_with_timestamps") {
        const t = (m.text ?? "").trim();
        if (t) finals.push(t);
      }
      armIdle();
    });
    ws.addEventListener("error", () => finish(new Error("scribe ws error")));
    ws.addEventListener("close", () => finish());
  });
}
interface WSLike {
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: string, cb: (e: never) => void): void;
}

async function transcribe(backend: Backend, wavPath: string, lang: string): Promise<string> {
  return backend === "scribe" ? transcribeScribe(wavPath, lang) : transcribeGemma(wavPath);
}

// ── aggregation + reporting ──────────────────────────────────────────────────
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
interface Totals {
  edits: number;
  words: number;
  errors: number;
  latencies: number[];
  byLang: Map<string, { e: number; w: number }>;
}
const newTotals = (): Totals => ({ edits: 0, words: 0, errors: 0, latencies: [], byLang: new Map() });

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

  // preflight only the backends we'll use
  if (args.backends.includes("gemma") && !(await ollamaUp())) {
    throw new Error(`Ollama not reachable at ${OLLAMA}. Start it (\`ollama serve\`) and pull ${MODEL}.`);
  }
  if (args.backends.includes("scribe") && !KEY) {
    throw new Error("ELEVENLABS_API_KEY not set — required for the scribe backend.");
  }

  const label: Record<Backend, string> = { gemma: `gemma-local (${MODEL})`, scribe: "elevenlabs scribe_v2_realtime" };
  console.log(`▚ asr-bench — set=${args.set} backends=[${args.backends.map((b) => label[b]).join(", ")}]`);
  console.log(`  fixtures: ${manifest.scenarios.length} scenario(s), seed=${manifest.seed}, ${manifest.sample_rate}Hz WAV\n`);

  const totals = new Map<Backend, Totals>(args.backends.map((b) => [b, newTotals()]));

  for (const scn of scenarios) {
    console.log(`── ${scn.id} (${scn.title})`);
    for (const clip of scn.clips) {
      const wavPath = resolve(baseDir, clip.file);
      const lang = clip.lang ?? "en";
      const cells: string[] = [];
      const hyps: { b: Backend; hyp: string; err: string }[] = [];
      let anyMiss = false;
      for (const b of args.backends) {
        const t0 = performance.now();
        let hyp = "";
        let err = "";
        try {
          hyp = await transcribe(b, wavPath, lang);
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
        const ms = Math.round(performance.now() - t0);
        const agg = totals.get(b)!;
        agg.latencies.push(ms);
        hyps.push({ b, hyp, err });
        if (err) {
          agg.errors++;
          cells.push(`${b} ERR`);
          continue;
        }
        const w = wer(clip.text, hyp);
        agg.edits += w.sub + w.del + w.ins;
        agg.words += w.n;
        const lb = agg.byLang.get(lang) ?? { e: 0, w: 0 };
        lb.e += w.sub + w.del + w.ins;
        lb.w += w.n;
        agg.byLang.set(lang, lb);
        if (w.wer > 0) anyMiss = true;
        cells.push(`${b} ${w.wer === 0 ? "✓".padEnd(6) : pct(w.wer).padStart(6)} ${String(ms).padStart(5)}ms`);
      }
      const meta = [clip.lang, clip.kind && clip.kind !== "talk" ? clip.kind : ""].filter(Boolean).join(",");
      console.log(`  [${String(clip.index).padStart(2, "0")}] ${clip.speaker.padEnd(7)} ${cells.join("  |  ")}${meta ? `  [${meta}]` : ""}`);
      if (args.show || anyMiss) {
        console.log(`        ref:    ${clip.text}`);
        for (const h of hyps) console.log(`        ${h.b.padEnd(6)}: ${h.err ? `ERR ${h.err}` : h.hyp || "(empty)"}`);
      }
    }
    console.log("");
  }

  console.log("══ aggregate");
  for (const b of args.backends) {
    const t = totals.get(b)!;
    const sorted = [...t.latencies].sort((x, y) => x - y);
    const langs = t.byLang.size > 1 ? "  " + [...t.byLang].sort().map(([l, v]) => `${l} ${pct(v.w ? v.e / v.w : 0)}`).join("  ") : "";
    console.log(
      `  ${label[b].padEnd(34)} WER ${pct(t.words ? t.edits / t.words : 0).padStart(6)}  (${t.edits}/${t.words}w${t.errors ? `, ${t.errors} err` : ""})${langs}`,
    );
    console.log(`  ${" ".repeat(34)} latency p50 ${percentile(sorted, 50)}ms  p95 ${percentile(sorted, 95)}ms`);
  }
}

main().catch((e) => {
  console.error("❌ asr-bench FAILED:", e?.message ?? e);
  process.exit(1);
});
