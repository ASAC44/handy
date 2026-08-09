import type { AsrCallbacks, AsrProvider } from "./types";
import { GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";
import { whisperModelMeta } from "./whisperModels";

/**
 * On-device, multilingual ASR on the PARTICIPANT'S OWN GPU: an energy-VAD (same as
 * gemmaLocal) segments utterances on the main thread, and each clip is decoded by
 * Whisper running in a Web Worker via transformers.js + WebGPU. Nothing leaves the
 * browser — the genuinely private + multilingual path. Finals only (no partials).
 */
const FRAME = 2048;
const MAX_SAMPLES = 16000 * 30; // Whisper's 30s window

let webgpuCache: boolean | undefined;

/** Robust async WebGPU probe (the property can exist while requestAdapter() is null). */
export async function probeWebgpu(): Promise<boolean> {
  if (webgpuCache !== undefined) return webgpuCache;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    webgpuCache = !!gpu && (await gpu.requestAdapter()) !== null;
  } catch {
    webgpuCache = false;
  }
  return webgpuCache;
}
export function webgpuAvailableCached(): boolean {
  return webgpuCache === true;
}

interface Job {
  audio: Float32Array;
  segmentMs: number;
}

export class WhisperWebgpuProvider implements AsrProvider {
  readonly id = "whisper-webgpu" as const;
  readonly label = "Whisper (your GPU)";

  private worker: Worker | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;
  private muted = false;
  private ready = false;

  private capturing = false;
  private speech: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private silenceFrames = 0;
  private speechFrames = 0;

  private queue: Job[] = [];
  private busy = false;
  private currentSegMs = 0;
  private cb: AsrCallbacks | null = null;

  constructor(
    private vad: GemmaVad = { ...GEMMA_VAD_DEFAULTS },
    private lang?: string,
    private modelKey?: string,
  ) {}

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
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone unavailable — open over https:// or http://localhost");
    }
    if (!(await probeWebgpu())) {
      throw new Error("WebGPU isn't available in this browser — use Chrome/Edge, or pick another engine");
    }

    const worker = new Worker(new URL("./whisperWorker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    worker.onmessage = (e) => this.onWorker(e.data as WorkerMsg);
    worker.onerror = () => cb.onError("Whisper worker error");
    const meta = whisperModelMeta(this.modelKey);
    cb.onStatus?.({ text: `loading ${meta.label} (${meta.size})…`, progress: 0 });
    worker.postMessage({ type: "load", model: this.modelKey });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const rate = this.ctx.sampleRate;
    const frameMs = (FRAME / rate) * 1000;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(FRAME, 1, 1);
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const frame = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
      const rms = Math.sqrt(sum / frame.length);
      cb.onLevel?.(rms);
      if (this.muted) return;

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
        if (voicedMs >= this.vad.minSpeechMs) this.enqueue(clip, rate);
      }
    };
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  private enqueue(chunks: Float32Array[], rate: number): void {
    if (!this.ready) return; // drop utterances spoken before the model finished loading
    let n = 0;
    for (const c of chunks) n += c.length;
    const audio = new Float32Array(Math.min(n, MAX_SAMPLES));
    let o = 0;
    for (const c of chunks) {
      if (o >= audio.length) break;
      const take = Math.min(c.length, audio.length - o);
      audio.set(take === c.length ? c : c.subarray(0, take), o);
      o += take;
    }
    this.queue.push({ audio, segmentMs: (n / rate) * 1000 });
    this.pump();
  }

  private pump(): void {
    if (this.busy || !this.worker || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.busy = true;
    this.currentSegMs = job.segmentMs;
    this.worker.postMessage({ type: "generate", audio: job.audio, lang: this.lang }, [job.audio.buffer]);
  }

  private onWorker(m: WorkerMsg): void {
    if (this.stopped) return;
    if (m.type === "progress") {
      const p = (m.data as { progress?: number } | undefined)?.progress;
      this.cb?.onStatus?.({ text: `loading ${whisperModelMeta(this.modelKey).label}…`, progress: typeof p === "number" ? p : undefined });
    } else if (m.type === "note") {
      this.cb?.onStatus?.({ text: m.text || "" });
    } else if (m.type === "ready") {
      this.ready = true;
      this.cb?.onStatus?.({ text: "Whisper ready", progress: 100 });
    } else if (m.type === "error") {
      this.busy = false;
      this.cb?.onError(m.message || "Whisper error");
      this.pump();
    } else if (m.type === "result") {
      this.busy = false;
      this.cb?.onMetrics?.({ segmentMs: this.currentSegMs, transcribeMs: m.transcribeMs ?? 0 });
      const text = (m.text || "").trim();
      if (text) this.cb?.onFinal(text);
      this.pump();
    }
  }

  stop(): void {
    this.stopped = true;
    this.capturing = false;
    this.speech = [];
    this.preroll = [];
    this.queue = [];
    this.busy = false;
    this.ready = false;
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
    this.worker?.terminate();
    this.worker = null;
    this.cb = null;
  }
}

interface WorkerMsg {
  type: "progress" | "ready" | "result" | "error" | "note";
  data?: unknown;
  id?: number;
  text?: string;
  transcribeMs?: number;
  message?: string;
}
