import type { AsrCallbacks, AsrProvider } from "./types";

/**
 * On-device, all-Gemma ASR: capture mic audio, segment it into utterances with a
 * simple energy VAD, and POST each WAV clip to the server (`/asr/gemma` ->
 * Ollama Gemma 4 E4B, OpenAI-compatible `input_audio`). Verified ~1s/clip warm,
 * near-verbatim. Request/response, so finals only (no streaming partials).
 */
const ENDPOINT = "/asr/gemma";
const TARGET_RATE = 16000;
const FRAME = 2048; // ~128ms at 16kHz
const START_RMS = 0.015; // speech onset
const END_RMS = 0.008; // below = silence
const SILENCE_MS = 700; // trailing silence finalizes an utterance
const MIN_SPEECH_MS = 350; // ignore short blips
const MAX_UTTER_MS = 15000; // cap clip length
const PREROLL_MS = 300; // keep a little audio before onset so words aren't clipped

export class GemmaLocalProvider implements AsrProvider {
  readonly id = "gemma-local" as const;
  readonly label = "Gemma 4 E4B (local)";

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;

  private capturing = false;
  private speech: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private silenceFrames = 0;
  private speechFrames = 0;

  async start(cb: AsrCallbacks): Promise<void> {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone unavailable — open over https:// or http://localhost (secure context required)");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
    const rate = this.ctx.sampleRate;
    const frameMs = (FRAME / rate) * 1000;
    const prerollFrames = Math.max(1, Math.round(PREROLL_MS / frameMs));

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(FRAME, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const frame = new Float32Array(e.inputBuffer.getChannelData(0)); // copy; buffer is reused
      const rms = rmsOf(frame);
      cb.onLevel?.(rms);

      if (!this.capturing) {
        this.preroll.push(frame);
        if (this.preroll.length > prerollFrames) this.preroll.shift();
        if (rms > START_RMS) {
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
      if (rms < END_RMS) this.silenceFrames++;
      else this.silenceFrames = 0;

      const silenceMs = this.silenceFrames * frameMs;
      const uttMs = this.speechFrames * frameMs;
      if (silenceMs >= SILENCE_MS || uttMs >= MAX_UTTER_MS) {
        const clip = this.speech;
        const voicedMs = uttMs - silenceMs;
        this.capturing = false;
        this.speech = [];
        this.silenceFrames = 0;
        this.speechFrames = 0;
        if (voicedMs >= MIN_SPEECH_MS) void this.transcribe(clip, rate, cb);
      }
    };
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  private async transcribe(chunks: Float32Array[], rate: number, cb: AsrCallbacks): Promise<void> {
    try {
      const wav = encodeWav(chunks, rate);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio_base64: bytesToBase64(wav) }),
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        cb.onError(body.error || `Gemma ASR HTTP ${res.status}`);
        return;
      }
      const text = (body.text ?? "").trim();
      if (text && !this.stopped) cb.onFinal(text);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : "Gemma ASR request failed");
    }
  }

  stop(): void {
    this.stopped = true;
    this.capturing = false;
    this.speech = [];
    this.preroll = [];
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
