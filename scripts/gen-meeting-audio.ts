/**
 * Render the naturalistic meeting scripts (fixtures/meetings/scripts.json) to audio
 * with ElevenLabs v3 — expressive delivery via audio tags ([sighs], [laughs],
 * [overlapping], [strong French accent]), pauses, emphasis, and code-switching.
 *
 * Produces TWO tracks per scenario (see the user's "two tracks" decision):
 *   - clean per-utterance clips (single voice, full quality) -> WER benchmarking
 *   - meeting.wav: a realistic mix where crosstalk turns genuinely OVERLAP the
 *     previous speaker (mixed PCM + ducking) -> demo + streaming-ASR stress
 *
 * Output is 16 kHz mono WAV (pcm_16000 -> WAV header) under fixtures/meetings/,
 * plus manifest.json. Generated once and committed; the bytes are the fixture.
 * v3 is nondeterministic (seed is best-effort), so a regen is a NEW fixture.
 *
 *   bun run meetings:gen
 *   bun run meetings:gen --smoke            # 1 EN + 1 PT-BR clip, validate v3, no writes
 *   bun run meetings:gen --scenario growth-sync-ptbr
 *
 * Needs ELEVENLABS_API_KEY with text_to_speech permission.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MEETINGS_DIR,
  MEETINGS_MANIFEST_PATH,
  SAMPLE_RATE,
  clipName,
  mixDown,
  msToSamples,
  pcmSamples,
  pcmToWav,
  samplesToMs,
  type MeetingClip,
  type MeetingManifest,
  type MeetingScenario,
  type Placement,
  type TurnKind,
} from "./lib";

const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY ?? "";

const NORMAL_GAIN = 0.9; // leave headroom so summed overlaps don't hard-clip
const CROSS_GAIN = 0.72; // interjections sit just under the main speaker
const GAPS_MS = [220, 360, 170, 430, 260, 300]; // deterministic, varied inter-turn gaps

interface Participant {
  name: string;
  voice_id: string;
  voice_name: string;
  accent?: string;
}
interface Turn {
  speaker: string;
  say: string;
  text?: string;
  lang?: string;
  kind?: TurnKind;
  overlapMs?: number;
  note?: string;
}
interface Script {
  id: string;
  title: string;
  lang: string;
  participants: Participant[];
  turns: Turn[];
}
interface ScriptsFile {
  model: string;
  seed: number;
  scenarios: Script[];
}

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

function loadScripts(): ScriptsFile {
  return JSON.parse(readFileSync(resolve(MEETINGS_DIR, "scripts.json"), "utf8")) as ScriptsFile;
}

/** Fallback gold if a turn omits `text`: drop [audio tags] and tidy whitespace. */
function deriveGold(say: string): string {
  return say.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/** ElevenLabs v3 single-voice TTS -> raw 16 kHz mono PCM. Retries once on 429/5xx. */
async function ttsV3(text: string, voiceId: string, model: string, seed: number, lang: string, attempt = 0): Promise<Uint8Array> {
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=pcm_16000`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      seed,
      language_code: lang,
      voice_settings: { stability: 0.5 }, // v3: Natural
    }),
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 1500));
      return ttsV3(text, voiceId, model, seed, lang, attempt + 1);
    }
    throw new Error(`v3 TTS failed (HTTP ${res.status}): ${(await res.text()).slice(0, 240)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function generateScenario(scn: Script, model: string, seed: number): Promise<MeetingScenario> {
  const dir = resolve(MEETINGS_DIR, scn.id);
  mkdirSync(dir, { recursive: true });
  const byName = new Map(scn.participants.map((p) => [p.name, p]));

  const clips: MeetingClip[] = [];
  const placements: Placement[] = [];
  let cursor = 0; // next non-overlapping start (samples)
  let prevStart = 0;
  let prevLen = 0;

  for (let i = 0; i < scn.turns.length; i++) {
    const turn = scn.turns[i]!;
    const p = byName.get(turn.speaker);
    if (!p) throw new Error(`${scn.id} turn ${i}: unknown speaker "${turn.speaker}"`);
    const lang = turn.lang ?? scn.lang;
    const gold = turn.text ?? deriveGold(turn.say);
    const pcm = await ttsV3(turn.say, p.voice_id, model, seed, lang);
    const len = pcmSamples(pcm);

    // clean per-utterance clip (full quality, for WER)
    const file = clipName(i, turn.speaker);
    writeFileSync(resolve(dir, file), pcmToWav(pcm));

    // place on the realistic timeline
    const kind: TurnKind = turn.kind ?? "talk";
    let start: number;
    let gain: number;
    if (kind === "crosstalk" && i > 0) {
      start = Math.max(0, prevStart + prevLen - msToSamples(turn.overlapMs ?? 800));
      gain = CROSS_GAIN;
    } else {
      start = cursor;
      gain = NORMAL_GAIN;
    }
    placements.push({ pcm, startSample: start, gain });
    cursor = Math.max(cursor, start + len) + msToSamples(GAPS_MS[i % GAPS_MS.length]!);
    prevStart = start;
    prevLen = len;

    clips.push({
      index: i,
      speaker: turn.speaker,
      voice_id: p.voice_id,
      voice_name: p.voice_name,
      file: `${scn.id}/${file}`,
      text: gold,
      lang,
      kind,
      startMs: samplesToMs(start),
    });
    const tag = kind === "talk" ? "" : ` [${kind}]`;
    console.log(`  ${scn.id}/${file}  ${(len / SAMPLE_RATE).toFixed(1)}s  (${turn.speaker} via ${p.voice_name}, ${lang})${tag}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  writeFileSync(resolve(dir, "meeting.wav"), pcmToWav(mixDown(placements)));
  const meetingSecs = (placements.reduce((m, pl) => Math.max(m, pl.startSample + pcmSamples(pl.pcm)), 0) / SAMPLE_RATE).toFixed(1);
  console.log(`  ${scn.id}/meeting.wav  ${meetingSecs}s mixed (${placements.filter((_, i) => (scn.turns[i]!.kind ?? "talk") === "crosstalk").length} overlaps)`);
  return { id: scn.id, title: scn.title, lang: scn.lang, full: `${scn.id}/meeting.wav`, clips };
}

async function main(): Promise<void> {
  if (!KEY) throw new Error("ELEVENLABS_API_KEY not set — add it to .env (needs text_to_speech permission).");
  const args = parseArgs(process.argv.slice(2));
  const file = loadScripts();
  const model = file.model;
  const seed = file.seed;
  const scenarios = file.scenarios.filter((s) => !args.scenario || s.id === args.scenario);
  if (!scenarios.length) throw new Error(`no scenario matched "${args.scenario}"`);

  console.log(`▚ gen-meeting-audio — model=${model} seed=${seed} rate=${SAMPLE_RATE}`);

  if (args.smoke) {
    // one English tagged line + one PT-BR line: proves v3, pcm_16000, voices, language_code.
    const en = file.scenarios.find((s) => s.lang === "en") ?? file.scenarios[0]!;
    const pt = file.scenarios.find((s) => s.lang === "pt");
    const probes: { scn: Script; turn: Turn }[] = [{ scn: en, turn: en.turns.find((t) => /\[/.test(t.say)) ?? en.turns[0]! }];
    if (pt) probes.push({ scn: pt, turn: pt.turns[0]! });
    for (const { scn, turn } of probes) {
      const p = scn.participants.find((x) => x.name === turn.speaker)!;
      const lang = turn.lang ?? scn.lang;
      console.log(`  smoke [${lang}] "${turn.say.slice(0, 56)}…" via ${p.voice_name}`);
      const pcm = await ttsV3(turn.say, p.voice_id, model, seed, lang);
      console.log(`    ✅ ${pcm.byteLength} bytes (${(pcmSamples(pcm) / SAMPLE_RATE).toFixed(1)}s)`);
    }
    console.log("contract OK — no files written.");
    return;
  }

  mkdirSync(MEETINGS_DIR, { recursive: true });
  const out: MeetingScenario[] = [];
  for (const scn of scenarios) out.push(await generateScenario(scn, model, seed));

  // Merge into any existing manifest so `--scenario X` doesn't drop the others;
  // keep scripts.json order for stable diffs.
  let prior: MeetingScenario[] = [];
  try {
    prior = (JSON.parse(readFileSync(MEETINGS_MANIFEST_PATH, "utf8")) as MeetingManifest).scenarios ?? [];
  } catch {
    /* first run — no prior manifest */
  }
  const byId = new Map(prior.map((s) => [s.id, s]));
  for (const s of out) byId.set(s.id, s);
  const ordered = file.scenarios.map((s) => byId.get(s.id)).filter((s): s is MeetingScenario => !!s);

  const manifest: MeetingManifest = {
    generator: "scripts/gen-meeting-audio.ts",
    model_id: model,
    sample_rate: SAMPLE_RATE,
    format: "wav",
    seed,
    scenarios: ordered,
  };
  writeFileSync(MEETINGS_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  const clipCount = out.reduce((n, s) => n + s.clips.length, 0);
  console.log(`✅ wrote ${clipCount} clips + ${out.length} meeting.wav; manifest now has ${ordered.length} scenario(s)`);
}

main().catch((e) => {
  console.error("❌ gen-meeting-audio FAILED:", e?.message ?? e);
  process.exit(1);
});
