/**
 * Shared helpers for the audio-fixture toolchain (gen-fixture-audio + asr-bench).
 * Kept dependency-light (no @sidebar/shared) so the scripts run standalone under
 * `bun scripts/*.ts`. Bun auto-loads .env, so ELEVENLABS_API_KEY etc. are present.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = resolve(SCRIPTS_DIR, "..");
export const TRANSCRIPTS = resolve(REPO_ROOT, "test-transcripts.json");
export const AUDIO_DIR = resolve(REPO_ROOT, "fixtures", "audio");
export const MANIFEST_PATH = resolve(AUDIO_DIR, "manifest.json");

/** Realism set (naturalistic v3 meetings) — separate from the canonical agent fixtures. */
export const MEETINGS_DIR = resolve(REPO_ROOT, "fixtures", "meetings");
export const MEETINGS_MANIFEST_PATH = resolve(MEETINGS_DIR, "manifest.json");

/** Both ASR consumers (Scribe pcm_16000, Gemma WAV) want 16 kHz mono 16-bit. */
export const SAMPLE_RATE = 16000;

/** Minimal view of test-transcripts.json (only the fields the audio tools need). */
export interface Segment {
  t: number;
  speaker: string;
  ms: number;
  text: string;
}
export interface Scenario {
  id: string;
  title: string;
  participants: string[];
  segments: Segment[];
}

export function loadScenarios(): Scenario[] {
  const raw = JSON.parse(readFileSync(TRANSCRIPTS, "utf8")) as { scenarios: Scenario[] };
  return raw.scenarios;
}

/** Stable, de-duplicated list of every speaker across all scenarios, in first-seen order. */
export function allSpeakers(scenarios: Scenario[]): string[] {
  const seen: string[] = [];
  for (const s of scenarios) for (const seg of s.segments) if (!seen.includes(seg.speaker)) seen.push(seg.speaker);
  return seen;
}

export interface VoiceRef {
  voice_id: string;
  name: string;
}
export interface ManifestClip {
  index: number;
  speaker: string;
  /** Path relative to fixtures/audio/. */
  file: string;
  /** Gold transcript (snapshot of the segment `text` at generation time). */
  text: string;
  t: number;
  ms: number;
}
export interface ManifestScenario {
  id: string;
  title: string;
  /** Concatenated meeting track, relative to fixtures/audio/. */
  full: string;
  clips: ManifestClip[];
}
export interface Manifest {
  generator: string;
  model_id: string;
  sample_rate: number;
  format: "wav";
  seed: number;
  /** speaker name -> ElevenLabs voice used to synthesize them. */
  voices: Record<string, VoiceRef>;
  scenarios: ManifestScenario[];
}

/** Zero-padded clip basename, e.g. (3, "Maya") -> "03-Maya.wav". */
export function clipName(index: number, speaker: string): string {
  return `${String(index).padStart(2, "0")}-${speaker.replace(/[^A-Za-z0-9]/g, "")}.wav`;
}

/** Wrap raw little-endian 16-bit mono PCM in a 44-byte canonical WAV header. */
export function pcmToWav(pcm: Uint8Array, rate = SAMPLE_RATE): Uint8Array {
  const dataLen = pcm.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const w = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits/sample
  w(36, "data");
  dv.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

/** N milliseconds of digital silence as 16-bit PCM (all zero bytes). */
export function silencePcm(ms: number, rate = SAMPLE_RATE): Uint8Array {
  return new Uint8Array(Math.round((ms / 1000) * rate) * 2);
}

export function msToSamples(ms: number, rate = SAMPLE_RATE): number {
  return Math.round((ms / 1000) * rate);
}
export function samplesToMs(samples: number, rate = SAMPLE_RATE): number {
  return Math.round((samples / rate) * 1000);
}
export function pcmSamples(pcm: Uint8Array): number {
  return Math.floor(pcm.byteLength / 2);
}

export interface Placement {
  pcm: Uint8Array; // S16LE mono
  startSample: number; // offset into the mix
  gain: number; // 0..1 (overlapping/background turns are ducked)
}

/**
 * Mix S16LE clips onto one timeline (overlaps allowed). Accumulates in float to
 * avoid wrap, then hard-clamps to int16 — true simultaneous cross-talk that no
 * single TTS call produces.
 */
export function mixDown(placements: Placement[]): Uint8Array {
  let total = 0;
  for (const p of placements) total = Math.max(total, p.startSample + pcmSamples(p.pcm));
  const acc = new Float64Array(total);
  for (const p of placements) {
    const dv = new DataView(p.pcm.buffer, p.pcm.byteOffset, p.pcm.byteLength);
    const n = pcmSamples(p.pcm);
    for (let i = 0; i < n; i++) acc[p.startSample + i]! += dv.getInt16(i * 2, true) * p.gain;
  }
  const out = new Uint8Array(total * 2);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < total; i++) {
    let s = Math.round(acc[i]!);
    if (s > 32767) s = 32767;
    else if (s < -32768) s = -32768;
    odv.setInt16(i * 2, s, true);
  }
  return out;
}

// ── Realism-set ("meetings") manifest ───────────────────────────────────────
export type TurnKind = "talk" | "offtopic" | "crosstalk";
export interface MeetingClip {
  index: number;
  speaker: string;
  voice_id: string;
  voice_name: string;
  file: string; // relative to fixtures/meetings/
  text: string; // clean gold (no tags), in the spoken language
  lang: string;
  kind: TurnKind;
  /** Where this clip starts within meeting.wav (ms); crosstalk overlaps the prior turn. */
  startMs: number;
}
export interface MeetingScenario {
  id: string;
  title: string;
  lang: string;
  full: string; // realistic mixed track, relative to fixtures/meetings/
  clips: MeetingClip[];
}
export interface MeetingManifest {
  generator: string;
  model_id: string;
  sample_rate: number;
  format: "wav";
  seed: number;
  scenarios: MeetingScenario[];
}

// ── Word error rate ─────────────────────────────────────────────────────────

/** lowercase, strip punctuation (keep intra-word apostrophes), collapse whitespace. */
export function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export interface WerResult {
  wer: number;
  sub: number;
  del: number;
  ins: number;
  n: number;
}

/** Word error rate via Levenshtein over tokens, with an S/D/I breakdown from a backtrace. */
export function wer(ref: string, hyp: string): WerResult {
  const r = normalize(ref);
  const h = normalize(hyp);
  const n = r.length;
  const m = h.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
    }
  }
  let i = n;
  let j = m;
  let sub = 0;
  let del = 0;
  let ins = 0;
  while (i > 0 || j > 0) {
    const diagCost = i > 0 && j > 0 ? d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1) : Infinity;
    if (i > 0 && j > 0 && d[i]![j] === diagCost) {
      if (r[i - 1] !== h[j - 1]) sub++;
      i--;
      j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      del++;
      i--;
    } else {
      ins++;
      j--;
    }
  }
  return { wer: n ? (sub + del + ins) / n : m ? 1 : 0, sub, del, ins, n };
}
