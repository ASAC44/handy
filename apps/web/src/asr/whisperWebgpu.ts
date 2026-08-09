import type { AsrCallbacks, AsrProvider } from "./types";
import { GEMMA_VAD_DEFAULTS, type GemmaVad } from "./gemmaLocal";
import { whisperModelMeta } from "./whisperModels";
import { micSource, fileSource, type Playback, type WiredSource } from "./audioSource";

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
  private wired: WiredSource | null = null;
  private node: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private stopped = false;
  private muted = false;
  private ready = false;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private rate = 16000;

  private capturing = false;
  private speech: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private silenceFrames = 0;
  private speechFrames = 0;

  private queue: Job[] = [];
  private busy = false;
  private currentSegMs = 0;
  private cb: AsrCallbacks | null = null;
  private endWhenDrained = false;

  constructor(
    private vad: GemmaVad = { ...GEMMA_VAD_DEFAULTS },
    private lang?: string,
    private modelKey?: string,
    private playback?: Playback,
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

    this.ctx = new AudioContext({ sampleRate: 16000 });
    const rate = this.ctx.sampleRate;
    this.rate = rate;
    const frameMs = (FRAME / rate) * 1000;
    // A recording must wait for the model to warm up, or its first utterances are dropped.
    // Suspending freezes the playback clock until the worker reports `ready`; the mic path
    // instead resumes immediately (a post-await context can come back suspended).
    if (this.playback) await this.ctx.suspend();
    else await this.ctx.resume().catch(() => {});
    this.wired = this.playback
      ? await fileSource(this.ctx, this.playback, () => this.onPlaybackEnd())
      : await micSource(this.ctx);
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
    this.wired.node.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  /** Recording reached its end: finalize any in-flight clip, then tell the UI we're done. */
  private onPlaybackEnd(): void {
    if (this.stopped) return;
    const frameMs = (FRAME / this.rate) * 1000;
    const voicedMs = (this.speechFrames - this.silenceFrames) * frameMs;
    if (this.capturing && voicedMs >= this.vad.minSpeechMs) this.enqueue(this.speech, this.rate);
    this.capturing = false;
    this.speech = [];
    this.stopProgress();
    const dur = this.wired?.durationSec ?? 0;
    this.cb?.onProgress?.({ elapsedSec: dur, durationSec: dur });
    // Decoding is async; let the queue drain before signalling done so late finals still land.
    if (this.queue.length === 0 && !this.busy) this.cb?.onEnded?.();
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
      // Model warm — release the (suspended) recording and begin tracking progress.
      if (this.wired && this.wired.durationSec > 0) {
        void this.ctx?.resume();
        this.startProgress();
      }
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
      if (this.endWhenDrained && this.queue.length === 0 && !this.busy) {
        this.endWhenDrained = false;
        this.cb?.onEnded?.();
      }
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
