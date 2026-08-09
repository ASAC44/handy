import type { AsrCallbacks, AsrProvider } from "./types";
import { authHeaders } from "../auth";

/**
 * ElevenLabs Scribe v2 Realtime provider.
 *
 * Flow: mint a 15-min single-use token from our server (`GET /asr/token`, key
 * stays server-side) -> open the Scribe Realtime WebSocket with the token ->
 * stream mic audio as 16 kHz PCM16 (`input_audio_chunk`) -> receive
 * `partial_transcript` (interim) and `committed_transcript` (final, VAD-segmented).
 *
 * We open the mic AudioContext directly at 16 kHz so no manual resampling is
 * needed; if the browser ignores the requested rate we report the actual rate in
 * `audio_format` so the server still decodes correctly.
 */
const WS_BASE = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const TOKEN_URL = "/asr/token";
const TARGET_RATE = 16000;

export interface ElevenLabsOptions {
  language?: string;
  /** Override token retrieval (used by the test harness); defaults to GET /asr/token. */
  getToken?: () => Promise<string>;
}

async function defaultGetToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, { signal: AbortSignal.timeout(8000), headers: authHeaders() });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error || `ASR token mint failed (HTTP ${res.status})`);
  return body.token;
}

export class ElevenLabsScribeProvider implements AsrProvider {
  readonly id = "elevenlabs" as const;
  readonly label = "ElevenLabs Scribe v2";

  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;

  constructor(private opts: ElevenLabsOptions = {}) {}

  async start(cb: AsrCallbacks): Promise<void> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone unavailable — open over https:// or http://localhost (secure context required)");
    }
    // Prompt for the mic FIRST, before the token round-trip, so the permission
    // dialog appears the instant the user clicks Mic (a slow/failing token must
    // never swallow the prompt).
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const token = await (this.opts.getToken ?? defaultGetToken)();
    this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
    const rate = Math.round(this.ctx.sampleRate);

    const params = new URLSearchParams({
      token,
      model_id: "scribe_v2_realtime",
      audio_format: `pcm_${rate}`,
      language_code: this.opts.language ?? "en",
      commit_strategy: "vad",
    });
    const ws = new WebSocket(`${WS_BASE}?${params.toString()}`);
    this.ws = ws;

    ws.onmessage = (e) => {
      let msg: { message_type?: string; text?: string };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const text = (msg.text ?? "").trim();
      if (!text) return;
      if (msg.message_type === "partial_transcript") cb.onPartial(text);
      else if (msg.message_type === "committed_transcript" || msg.message_type === "committed_transcript_with_timestamps") cb.onFinal(text);
    };
    ws.onclose = (ev) => {
      if (!this.stopped && ev.code !== 1000) cb.onError(`ElevenLabs ASR closed (${ev.code})`);
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ElevenLabs ASR connect timed out")), 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("ElevenLabs ASR connection failed"));
      };
    });
    if (this.stopped) {
      this.stop();
      return;
    }
    ws.onerror = () => cb.onError("ElevenLabs ASR connection error");

    // Mic -> PCM16 base64 -> WS. The muted sink keeps the processor pumping
    // without routing the mic back to the speakers.
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const f32 = e.inputBuffer.getChannelData(0);
      cb.onLevel?.(rms(f32));
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: floatToPcm16Base64(f32) }));
    };
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  stop(): void {
    this.stopped = true;
    try {
      this.node?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* nodes may already be detached */
    }
    this.node = null;
    this.source = null;
    this.sink = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000);
    this.ws = null;
  }
}

/** RMS of a frame, ~0..1, for a mic level meter. */
function rms(f32: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < f32.length; i++) sum += f32[i]! * f32[i]!;
  return Math.sqrt(sum / f32.length);
}

/** Float32 [-1,1] mono -> 16-bit little-endian PCM -> base64 (for one audio frame). */
function floatToPcm16Base64(f32: Float32Array): string {
  const pcm = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
