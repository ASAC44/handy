/**
 * Live-path simulation for the on-device Gemma ASR. The bench fed Gemma clean,
 * pre-segmented clips; the LIVE app must first find utterance boundaries itself
 * with a crude energy VAD, then transcribe — over continuous, OVERLAPPING audio.
 *
 * This replays the exact client VAD from apps/web/src/asr/gemmaLocal.ts over a
 * committed meeting.wav (overlaps + realistic short gaps), sends each VAD-found
 * segment to Ollama Gemma (the same path the app's /asr/gemma uses), and scores
 * DOCUMENT-level WER of the whole transcript stream vs the concatenated gold.
 *
 * To isolate the segmentation+overlap cost it also runs a "clean" pass over the
 * gold-boundary clips and scores the SAME way. Both are document-WER vs the same
 * reference, so the delta is purely the live penalty the clean-clip bench hides.
 *
 *   bun run asr:livesim                          # growth-sync-en
 *   bun run asr:livesim --scenario growth-sync-ptbr
 *   bun run asr:livesim --scenario launch-room-accents --show
 *
 * Needs Ollama + the Gemma audio model.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MEETINGS_DIR, MEETINGS_MANIFEST_PATH, SAMPLE_RATE, pcmToWav, wer, type MeetingManifest } from "./lib";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.GEMMA_ASR_MODEL ?? "gemma4:e4b-it-qat";

// VAD constants — copied verbatim from apps/web/src/asr/gemmaLocal.ts.
const FRAME = 2048; // ~128ms at 16kHz
const START_RMS = 0.015; // speech onset
const END_RMS = 0.008; // below = silence
const SILENCE_MS = 700; // trailing silence finalizes an utterance
const MIN_SPEECH_MS = 350; // ignore short blips
const MAX_UTTER_MS = 15000; // cap clip length
const PREROLL_MS = 300; // keep a little audio before onset

interface Args {
  scenario: string;
  show: boolean;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { scenario: "growth-sync-en", show: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scenario") out.scenario = argv[++i] ?? out.scenario;
    else if (argv[i] === "--show") out.show = true;
  }
  return out;
}

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

interface Segment {
  start: number; // sample index
  end: number;
  capped: boolean; // hit MAX_UTTER_MS (couldn't find silence)
}

/** Replica of the gemmaLocal.ts energy VAD over an int16 PCM buffer. */
function segment(pcm: Buffer): Segment[] {
  const n = Math.floor(pcm.length / 2);
  const frameMs = (FRAME / SAMPLE_RATE) * 1000;
  const prerollFrames = Math.max(1, Math.round(PREROLL_MS / frameMs));
  const rmsAt = (frameStart: number): number => {
    let sum = 0;
    let cnt = 0;
    for (let i = frameStart; i < Math.min(frameStart + FRAME, n); i++) {
      const s = pcm.readInt16LE(i * 2) / 32768;
      sum += s * s;
      cnt++;
    }
    return cnt ? Math.sqrt(sum / cnt) : 0;
  };

  const segs: Segment[] = [];
  let capturing = false;
  let captureStart = 0;
  let silenceFrames = 0;
  let speechFrames = 0;

  for (let frameStart = 0; frameStart < n; frameStart += FRAME) {
    const rms = rmsAt(frameStart);
    if (!capturing) {
      if (rms > START_RMS) {
        capturing = true;
        captureStart = Math.max(0, frameStart - prerollFrames * FRAME);
        silenceFrames = 0;
        speechFrames = 1;
      }
      continue;
    }
    speechFrames++;
    if (rms < END_RMS) silenceFrames++;
    else silenceFrames = 0;
    const silenceMs = silenceFrames * frameMs;
    const uttMs = speechFrames * frameMs;
    if (silenceMs >= SILENCE_MS || uttMs >= MAX_UTTER_MS) {
      const voicedMs = uttMs - silenceMs;
      if (voicedMs >= MIN_SPEECH_MS) segs.push({ start: captureStart, end: Math.min(frameStart + FRAME, n), capped: uttMs >= MAX_UTTER_MS });
      capturing = false;
      silenceFrames = 0;
      speechFrames = 0;
    }
  }
  // Flush a trailing utterance (meeting.wav ends right after the last word — the
  // app would need trailing silence to finalize; we flush so it isn't lost).
  if (capturing) {
    const uttMs = speechFrames * frameMs;
    const voicedMs = uttMs - silenceFrames * frameMs;
    if (voicedMs >= MIN_SPEECH_MS) segs.push({ start: captureStart, end: n, capped: false });
  }
  return segs;
}

async function gemma(wavBytes: Uint8Array): Promise<string> {
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
            { type: "input_audio", input_audio: { data: Buffer.from(wavBytes).toString("base64"), format: "wav" } },
          ],
        },
      ],
      stream: false,
      temperature: 0,
      think: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (d.choices?.[0]?.message?.content ?? "").trim();
}

async function ollamaUp(): Promise<boolean> {
  try {
    return (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
const secs = (samples: number): string => (samples / SAMPLE_RATE).toFixed(1);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let manifest: MeetingManifest;
  try {
    manifest = JSON.parse(readFileSync(MEETINGS_MANIFEST_PATH, "utf8")) as MeetingManifest;
  } catch {
    throw new Error("no meetings manifest — run `bun run meetings:gen` first.");
  }
  const scn = manifest.scenarios.find((s) => s.id === args.scenario);
  if (!scn) throw new Error(`no scenario "${args.scenario}" in the meetings manifest`);
  if (!(await ollamaUp())) throw new Error(`Ollama not reachable at ${OLLAMA}. Start it and pull ${MODEL}.`);

  const reference = scn.clips.map((c) => c.text).join(" ");
  const refWords = reference.split(/\s+/).filter(Boolean).length;

  // gap analysis (explains VAD merging): gap between consecutive clips on the timeline
  const durMs = (file: string): number => (readWavPcm(resolve(MEETINGS_DIR, file)).length / 2 / SAMPLE_RATE) * 1000;
  let under = 0;
  let overlaps = 0;
  for (let i = 1; i < scn.clips.length; i++) {
    const prev = scn.clips[i - 1]!;
    const gap = scn.clips[i]!.startMs - (prev.startMs + durMs(prev.file));
    if (gap < 0) overlaps++;
    else if (gap < SILENCE_MS) under++;
  }

  console.log(`▚ asr-live-sim — ${scn.id} (Gemma local, the app's on-device path)`);
  const meetingPcm = readWavPcm(resolve(MEETINGS_DIR, scn.full));
  console.log(`  meeting.wav: ${secs(meetingPcm.length / 2)}s  |  gold: ${scn.clips.length} utterances, ${refWords} words`);
  console.log(`  inter-turn gaps: ${under} under the VAD's ${SILENCE_MS}ms finalize threshold, ${overlaps} overlaps -> merging expected\n`);

  // 1) clean pass: gold-boundary clips, scored as one document
  let cleanMs = 0;
  const cleanHyps: string[] = [];
  for (const c of scn.clips) {
    const t0 = performance.now();
    cleanHyps.push(await gemma(readFileSync(resolve(MEETINGS_DIR, c.file))));
    cleanMs += performance.now() - t0;
  }
  const cleanHyp = cleanHyps.join(" ");
  const cleanW = wer(reference, cleanHyp);

  // 2) live pass: VAD over meeting.wav, transcribe each segment
  const segs = segment(meetingPcm);
  let liveMs = 0;
  const liveHyps: string[] = [];
  for (const s of segs) {
    const wav = pcmToWav(meetingPcm.subarray(s.start * 2, s.end * 2));
    const t0 = performance.now();
    liveHyps.push(await gemma(wav));
    liveMs += performance.now() - t0;
  }
  const liveHyp = liveHyps.join(" ");
  const liveW = wer(reference, liveHyp);
  const capped = segs.filter((s) => s.capped).length;
  const longest = segs.reduce((m, s) => Math.max(m, s.end - s.start), 0);

  console.log(`  clean clips (gold boundaries):  doc-WER ${pct(cleanW.wer).padStart(6)}   ${scn.clips.length} segments,  ${(cleanMs / 1000).toFixed(1)}s transcribe`);
  console.log(
    `  live VAD over meeting.wav:      doc-WER ${pct(liveW.wer).padStart(6)}   ${segs.length} segments` +
      ` (${capped} hit the ${MAX_UTTER_MS / 1000}s cap, longest ${secs(longest)}s),  ${(liveMs / 1000).toFixed(1)}s transcribe`,
  );
  const delta = (liveW.wer - cleanW.wer) * 100;
  console.log(`\n  segmentation + cross-talk penalty: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts  (${pct(cleanW.wer)} clean -> ${pct(liveW.wer)} live)`);

  if (args.show) {
    console.log(`\n  segments (s): ${segs.map((s) => secs(s.end - s.start) + (s.capped ? "*" : "")).join(", ")}`);
    console.log(`\n  ref:   ${reference}`);
    console.log(`\n  clean: ${cleanHyp}`);
    console.log(`\n  live:  ${liveHyp}`);
  }
}

main().catch((e) => {
  console.error("❌ asr-live-sim FAILED:", e?.message ?? e);
  process.exit(1);
});
