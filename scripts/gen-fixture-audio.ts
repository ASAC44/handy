/**
 * Generate deterministic meeting-audio fixtures from test-transcripts.json with
 * ElevenLabs TTS. Each participant gets a distinct, pinned voice; every segment is
 * synthesized to 16 kHz mono PCM and wrapped as WAV (the exact format both ASR
 * paths consume — Scribe `pcm_16000`, Gemma `input_audio` WAV — so no resampling).
 *
 * Writes per-segment clips + a concatenated `full.wav` per scenario + a
 * `manifest.json` under fixtures/audio/. Run ONCE and commit the output; it is
 * never called at test time, so the committed bytes are the deterministic fixture.
 *
 *   bun run asr:gen                 # generate everything, write manifest
 *   bun run asr:gen --smoke         # one real TTS call, validate the contract, no writes
 *   bun run asr:gen --scenario sprint-planning
 *
 * Needs ELEVENLABS_API_KEY (Bun auto-loads it from .env).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIO_DIR,
  MANIFEST_PATH,
  SAMPLE_RATE,
  allSpeakers,
  clipName,
  loadScenarios,
  pcmToWav,
  silencePcm,
  type Manifest,
  type ManifestScenario,
  type Scenario,
  type VoiceRef,
} from "./lib";

const API = "https://api.elevenlabs.io/v1";
const MODEL_ID = "eleven_multilingual_v2"; // high-quality, supports pcm_16000 + seed
const SEED = 20240628; // best-effort reproducibility across regenerations
const GAP_MS = 350; // silence inserted between speakers in the concatenated full.wav

/**
 * Pinned ElevenLabs default ("premade") voices per speaker. These public voice IDs
 * are usable by any account with text-to-speech permission, so generation does not
 * depend on `voices_read` (a restricted key still works). One distinct voice per
 * participant makes the meeting a realistic multi-speaker ASR test.
 */
const VOICES: Record<string, VoiceRef> = {
  Maya: { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
  Dev: { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  Priya: { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  Sam: { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
  Lena: { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  Raj: { voice_id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh" },
  Ava: { voice_id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli" },
  Nora: { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte" },
  Theo: { voice_id: "2EiwWnXFnvU5JabPnv8n", name: "Clyde" },
};
const FALLBACK: VoiceRef = { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" };
const voiceFor = (speaker: string): VoiceRef => VOICES[speaker] ?? FALLBACK;

const KEY = process.env.ELEVENLABS_API_KEY ?? "";

interface Args {
  smoke: boolean;
  scenario?: string;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { smoke: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--smoke") out.smoke = true;
    else if (argv[i] === "--scenario") out.scenario = argv[++i];
  }
  return out;
}

/** Build the speaker -> voice map for the speakers actually present in scope. */
function voiceMap(speakers: string[]): Record<string, VoiceRef> {
  return Object.fromEntries(speakers.map((sp) => [sp, voiceFor(sp)]));
}

/** Synthesize one line to raw 16 kHz mono PCM bytes. Retries once on 429/5xx. */
async function tts(text: string, voiceId: string, attempt = 0): Promise<Uint8Array> {
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=pcm_16000`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      seed: SEED,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 1500));
      return tts(text, voiceId, attempt + 1);
    }
    throw new Error(`TTS failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function generateScenario(scn: Scenario, voices: Record<string, VoiceRef>): Promise<ManifestScenario> {
  const dir = resolve(AUDIO_DIR, scn.id);
  mkdirSync(dir, { recursive: true });
  const clips: ManifestScenario["clips"] = [];
  const meeting: Uint8Array[] = [];
  const gap = silencePcm(GAP_MS);

  for (let i = 0; i < scn.segments.length; i++) {
    const seg = scn.segments[i]!;
    const voice = voices[seg.speaker]!;
    const pcm = await tts(seg.text, voice.voice_id);
    const file = clipName(i, seg.speaker);
    writeFileSync(resolve(dir, file), pcmToWav(pcm));
    clips.push({ index: i, speaker: seg.speaker, file: `${scn.id}/${file}`, text: seg.text, t: seg.t, ms: seg.ms });
    if (i > 0) meeting.push(gap);
    meeting.push(pcm);
    const secs = (pcm.byteLength / 2 / SAMPLE_RATE).toFixed(1);
    console.log(`  ${scn.id}/${file}  ${secs}s  (${seg.speaker} via ${voice.name})`);
    await new Promise((r) => setTimeout(r, 120)); // be gentle on the API
  }

  const fullName = "full.wav";
  writeFileSync(resolve(dir, fullName), pcmToWav(concat(meeting)));
  return { id: scn.id, title: scn.title, full: `${scn.id}/${fullName}`, clips };
}

async function main(): Promise<void> {
  if (!KEY) throw new Error("ELEVENLABS_API_KEY not set — add it to .env to generate audio fixtures.");
  const args = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios().filter((s) => !args.scenario || s.id === args.scenario);
  if (!scenarios.length) throw new Error(`no scenario matched "${args.scenario}"`);

  console.log(`▚ gen-fixture-audio — model=${MODEL_ID} seed=${SEED} rate=${SAMPLE_RATE}`);

  if (args.smoke) {
    const scn = scenarios[0]!;
    const seg = scn.segments[0]!;
    const voice = voiceFor(seg.speaker);
    console.log(`  smoke: "${seg.text.slice(0, 60)}…" via ${voice.name} (${voice.voice_id})`);
    const pcm = await tts(seg.text, voice.voice_id);
    console.log(`✅ got ${pcm.byteLength} PCM bytes (${(pcm.byteLength / 2 / SAMPLE_RATE).toFixed(1)}s) — contract OK. No files written.`);
    return;
  }

  mkdirSync(AUDIO_DIR, { recursive: true });
  const voices = voiceMap(allSpeakers(scenarios));
  console.log("  voice map:", Object.entries(voices).map(([k, v]) => `${k}=${v.name}`).join(", "));

  const manifestScenarios: ManifestScenario[] = [];
  for (const scn of scenarios) manifestScenarios.push(await generateScenario(scn, voices));

  const manifest: Manifest = {
    generator: "scripts/gen-fixture-audio.ts",
    model_id: MODEL_ID,
    sample_rate: SAMPLE_RATE,
    format: "wav",
    seed: SEED,
    voices,
    scenarios: manifestScenarios,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  const clipCount = manifestScenarios.reduce((n, s) => n + s.clips.length, 0);
  console.log(`✅ wrote ${clipCount} clips + ${manifestScenarios.length} full.wav + manifest.json under fixtures/audio/`);
}

main().catch((e) => {
  console.error("❌ gen-fixture-audio FAILED:", e?.message ?? e);
  process.exit(1);
});
