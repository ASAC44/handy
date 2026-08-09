import type { AsrCallbacks, AsrProvider } from "./types";
import { authHeaders } from "../auth";
import { micSource, fileSource, type Playback, type WiredSource } from "./audioSource";

/**
 * On-device, all-Gemma ASR: capture mic audio, segment it into utterances with a
 * simple energy VAD, and POST each WAV clip to the server (`/asr/gemma` ->
 * Ollama Gemma 4 E4B, OpenAI-compatible `input_audio`). Verified ~1s/clip warm,
 * near-verbatim. Request/response, so finals only (no streaming partials).
 *
 * The VAD parameters are passed in by reference and read every frame, so the host
 * UI can tune them live (see scripts/asr-live-sim.ts: segmentation, not the model,
 * is what governs the live latency feel).
 */
const ENDPOINT = "/asr/gemma";
const TARGET_RATE = 16000;
const FRAME = 2048; // ~128ms at 16kHz (ScriptProcessor buffer; not tunable)

/** Live-tunable energy-VAD parameters (exposed in the host dock to feel the latency). */
export interface GemmaVad {
  startRms: number; // speech onset (mic sensitivity)
  endRms: number; // below = silence (release)
  silenceMs: number; // trailing silence that finalizes an utterance — the main latency knob
  minSpeechMs: number; // ignore short blips
  maxUtterMs: number; // cap clip length (worst-case latency)
  prerollMs: number; // keep a little audio before onset so words aren't clipped
}
export const GEMMA_VAD_DEFAULTS: GemmaVad = {
  startRms: 0.05, // noise floor — raise to ignore quiet/background talk
  endRms: 0.008,
  silenceMs: 700,
  minSpeechMs: 350,
  maxUtterMs: 15000,
  prerollMs: 300,
};

export class GemmaLocalProvider implements AsrProvider {
  readonly id = "gemma-local" as const;
  readonly label = "Gemma 4 E4B (local)";

  private ctx: AudioContext | null = null;
  private wired: WiredSource | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private cb: AsrCallbacks | null = null;
  private rate = TARGET_RATE;

  private capturing = false;
  private speech: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private silenceFrames = 0;
  private speechFrames = 0;
  private muted = false;
  private pending = 0; // in-flight transcribe requests (so playback ends only once they drain)
  private endWhenDrained = false;

  /** `vad` is held by reference — the host UI mutates this same object to retune live.
   *  `playback`, when set, decodes a recording through this same pipeline instead of the mic. */
  constructor(
    private vad: GemmaVad = { ...GEMMA_VAD_DEFAULTS },
    private playback?: Playback,
  ) {}

  /** Push-to-talk: drop any in-flight utterance and capture nothing while muted (nothing
   *  is sent to the server — the genuinely private path). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.capturing = false;
      this.speech = [];
      this.preroll = [];
      this.silenceFrames = 0;
      this.speechFrames = 0;
    }
  }

  async start(cb: AsrCallbacks): Promise<void> {
    this.stopped = false;
    this.cb = cb;
    this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
    const rate = this.ctx.sampleRate;
    this.rate = rate;
    const frameMs = (FRAME / rate) * 1000;

    this.wired = this.playback
      ? await fileSource(this.ctx, this.playback, () => this.onPlaybackEnd())
      : await micSource(this.ctx);
    if (this.wired.durationSec > 0) this.startProgress();
    this.node = this.ctx.createScriptProcessor(FRAME, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const frame = new Float32Array(e.inputBuffer.getChannelData(0)); // copy; buffer is reused
      const rms = rmsOf(frame);
      cb.onLevel?.(rms);
      if (this.muted) return; // push-to-talk released — capture/segment nothing

      // preroll length tracks the (live-tunable) prerollMs.
      const prerollFrames = Math.max(1, Math.round(this.vad.prerollMs / frameMs));

      if (!this.capturing) {
        this.preroll.push(frame);
        while (this.preroll.length > prerollFrames) this.preroll.shift();
        if (rms > this.vad.startRms) {
          this.capturing = true;
          this.speech = this.preroll.slice();
          this.preroll = [];
          this.silenceFrames = 0;
          this.speechFrames = 1;
        }
        return;
      }

      this.speech.push(frame);
      this.speechFrames++;
      if (rms < this.vad.endRms) this.silenceFrames++;
      else this.silenceFrames = 0;

      const silenceMs = this.silenceFrames * frameMs;
      const uttMs = this.speechFrames * frameMs;
      if (silenceMs >= this.vad.silenceMs || uttMs >= this.vad.maxUtterMs) {
        const clip = this.speech;
        const voicedMs = uttMs - silenceMs;
        this.capturing = false;
        this.speech = [];
        this.silenceFrames = 0;
        this.speechFrames = 0;
        if (voicedMs >= this.vad.minSpeechMs) void this.transcribe(clip, rate, cb);
      }
    };
    this.wired.node.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  /** Recording reached its end: finalize any in-flight clip, then tell the UI we're done
   *  once the last transcribe request has come back (so the final line isn't dropped). */
  private onPlaybackEnd(): void {
    if (this.stopped) return;
    const frameMs = (FRAME / this.rate) * 1000;
    const voicedMs = (this.speechFrames - this.silenceFrames) * frameMs;
    if (this.capturing && voicedMs >= this.vad.minSpeechMs && this.cb) {
      void this.transcribe(this.speech, this.rate, this.cb);
    }
    this.capturing = false;
    this.speech = [];
    this.stopProgress();
    const dur = this.wired?.durationSec ?? 0;
    this.cb?.onProgress?.({ elapsedSec: dur, durationSec: dur });
    if (this.pending === 0) this.cb?.onEnded?.();
    else this.endWhenDrained = true;
  }

  private startProgress(): void {
    this.progressTimer = setInterval(() => {
      if (this.stopped || !this.wired) return;
      this.cb?.onProgress?.({ elapsedSec: this.wired.elapsedSec(), durationSec: this.wired.durationSec });
    }, 250);
  }

  private stopProgress(): void {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  private async transcribe(chunks: Float32Array[], rate: number, cb: AsrCallbacks): Promise<void> {
    let samples = 0;
    for (const c of chunks) samples += c.length;
    const segmentMs = (samples / rate) * 1000;
    this.pending++;
    try {
      const wav = encodeWav(chunks, rate);
      const t0 = performance.now();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ audio_base64: bytesToBase64(wav) }),
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      const transcribeMs = performance.now() - t0;
      if (!res.ok) {
        cb.onError(body.error || `Gemma ASR HTTP ${res.status}`);
        return;
      }
      // Emit timing even when the text is empty, so the latency readout always updates.
      if (!this.stopped) cb.onMetrics?.({ segmentMs, transcribeMs });
      const text = (body.text ?? "").trim();
      if (text && !this.stopped) cb.onFinal(text);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : "Gemma ASR request failed");
    } finally {
      this.pending--;
      if (this.endWhenDrained && this.pending === 0 && !this.stopped) {
        this.endWhenDrained = false;
        cb.onEnded?.();
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.capturing = false;
    this.speech = [];
    this.preroll = [];
    this.endWhenDrained = false;
    this.stopProgress();
    try {
      this.node?.disconnect();
      this.wired?.node.disconnect();
      this.sink?.disconnect();
    } catch {
      /* nodes may already be detached */
    }
    this.node = null;
    this.sink = null;
    this.wired?.stop();
    this.wired = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.cb = null;
  }
}

function rmsOf(f: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < f.length; i++) sum += f[i]! * f[i]!;
  return Math.sqrt(sum / f.length);
}

/** Concatenate Float32 frames into a 16-bit PCM mono WAV file. */
function encodeWav(chunks: Float32Array[], rate: number): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const pcm = new Int16Array(n);
  let o = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]!));
      pcm[o++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
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
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
