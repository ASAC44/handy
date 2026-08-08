/**
 * Headless check of the ElevenLabs Scribe v2 Realtime WS handshake + protocol.
 * Mints a single-use token, opens the realtime socket with the EXACT params the
 * browser provider uses, streams a couple of audio frames, and logs every
 * message + the close code. Proves URL/params/model_id/audio_format/token are
 * accepted (the parts that are hard to see from the browser).
 *   Run:  bun apps/server/src/_asrcheck.ts
 */
import { config } from "./config";

const WS_BASE = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const RATE = 16000;

async function mintToken(): Promise<string> {
  const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsApiKey, "content-length": "0" },
    body: "",
  });
  if (!res.ok) throw new Error(`token mint failed HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

function pcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return Buffer.from(pcm.buffer).toString("base64");
}

async function main(): Promise<void> {
  if (!config.elevenLabsApiKey) throw new Error("ELEVENLABS_API_KEY not set in .env");
  console.log("▚ asrcheck — minting token…");
  const token = await mintToken();
  console.log("  token:", token.slice(0, 10) + "…");

  const params = new URLSearchParams({
    token,
    model_id: "scribe_v2_realtime",
    audio_format: `pcm_${RATE}`,
    language_code: "en",
    commit_strategy: "vad",
  });
  const ws = new WebSocket(`${WS_BASE}?${params.toString()}`);
  let opened = false;
  const msgs: string[] = [];

  ws.addEventListener("open", () => {
    opened = true;
    console.log("✅ WS open — streaming a 440Hz tone then silence");
    // ~0.5s tone + ~2s silence (>vad_silence_threshold) so VAD commits.
    const frame = 4096;
    const send = (fn: (i: number, base: number) => number, frames: number, base: number): void => {
      for (let f = 0; f < frames; f++) {
        const buf = new Float32Array(frame);
        for (let i = 0; i < frame; i++) buf[i] = fn(i, base + f * frame);
        ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: pcm16Base64(buf) }));
      }
    };
    send((i, n) => 0.25 * Math.sin((2 * Math.PI * 440 * (n)) / RATE), 2, 0); // tone
    send(() => 0, 8, 0); // silence -> VAD commit
  });
  ws.addEventListener("message", (e) => {
    const raw = String((e as MessageEvent).data);
    msgs.push(raw);
    let m: { message_type?: string; text?: string };
    try { m = JSON.parse(raw); } catch { console.log("  msg(raw):", raw.slice(0, 120)); return; }
    console.log(`  msg: ${m.message_type}${m.text !== undefined ? ` text="${m.text}"` : ""}`);
  });
  ws.addEventListener("close", (e) => {
    const ev = e as CloseEvent;
    console.log(`WS close code=${ev.code} reason="${ev.reason}"`);
    console.log(`\n${opened ? "✅" : "❌"} handshake  |  ${msgs.length} message(s) received`);
    process.exit(opened && (ev.code === 1000 || ev.code === 1005) ? 0 : 1);
  });
  ws.addEventListener("error", () => console.log("WS error event"));

  setTimeout(() => { try { ws.close(1000); } catch { /* already closed */ } }, 7000);
}

main().catch((e) => { console.error("❌ asrcheck FAILED:", e?.message ?? e); process.exit(1); });
