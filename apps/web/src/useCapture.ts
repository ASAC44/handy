import { useEffect, useRef, useState } from "react";
import type { ClientEvent } from "@sidebar/shared";
import {
  createAsrProvider,
  webSpeechAvailable,
  probeWebgpu,
  prewarmWhisper,
  whisperReady,
  engineSupportsPlayback,
  GEMMA_VAD_DEFAULTS,
  DEFAULT_WHISPER_MODEL,
  type AsrProvider,
  type AsrProviderId,
  type AsrMetrics,
  type GemmaVad,
  type Playback,
} from "./asr";

export type MicMode = "open" | "ptt";

/** While a recording is being decoded through the live pipeline. */
export interface PlaybackState {
  name: string;
  elapsedSec: number;
  durationSec: number;
}

/** One participant's microphone: engine choice, open-mic vs push-to-talk, level,
 *  and the Gemma VAD knobs. Transcripts go up untagged — the server attributes them
 *  by connection, so this is identical for host and guests. */
export interface Capture {
  speechOn: boolean;
  talking: boolean; // open mic on, or PTT currently held
  engine: AsrProviderId;
  setEngine: (id: AsrProviderId) => void;
  lang: string;
  setLang: (l: string) => void;
  whisperModel: string;
  setWhisperModel: (m: string) => void;
  mode: MicMode;
  setMode: (m: MicMode) => void;
  level: number;
  metric: AsrMetrics | null;
  error: string;
  /** Engine setup status (e.g. Whisper model download/warm-up). */
  status: string;
  start: () => Promise<void>;
  stop: () => void;
  pttDown: () => void;
  pttUp: () => void;
  /** Decode a recording through the live pipeline (VAD engines only). */
  playFile: (file: File) => Promise<void>;
  /** Non-null while a recording is playing back. */
  playback: PlaybackState | null;
  /** Whether the current engine can play back a recording. */
  canPlayback: boolean;
  vad: GemmaVad;
  setVad: (patch: Partial<GemmaVad>) => void;
  showVad: boolean;
  setShowVad: (v: boolean) => void;
}

function loadVad(): GemmaVad {
  try {
    const raw = localStorage.getItem("sidebar.vad");
    if (raw) return { ...GEMMA_VAD_DEFAULTS, ...(JSON.parse(raw) as Partial<GemmaVad>) };
  } catch {
    /* ignore */
  }
  return { ...GEMMA_VAD_DEFAULTS };
}

const isTyping = (el: Element | null): boolean =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

export function useCapture(send: (e: ClientEvent) => void): Capture {
  const [engine, setEngineState] = useState<AsrProviderId>(() => (localStorage.getItem("sidebar.asr") as AsrProviderId) || "webspeech");
  const [lang, setLangState] = useState<string>(() => localStorage.getItem("sidebar.lang") || "auto");
  const [whisperModel, setWhisperModelState] = useState<string>(() => localStorage.getItem("sidebar.whispermodel") || DEFAULT_WHISPER_MODEL);
  const [mode, setModeState] = useState<MicMode>(() => (localStorage.getItem("sidebar.micmode") as MicMode) || "open");
  const [speechOn, setSpeechOn] = useState(false);
  const [talking, setTalking] = useState(false);
  const [level, setLevel] = useState(0);
  const [metric, setMetric] = useState<AsrMetrics | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showVad, setShowVad] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [, setWebgpuReady] = useState(false); // flip after the async WebGPU probe to enable the option
  const vadRef = useRef<GemmaVad>(loadVad());
  const [vad, setVadView] = useState<GemmaVad>(() => ({ ...vadRef.current }));
  const asrRef = useRef<AsrProvider | null>(null);
  const modeRef = useRef<MicMode>(mode);
  modeRef.current = mode;

  useEffect(() => () => asrRef.current?.stop(), []);
  useEffect(() => {
    void probeWebgpu().then(() => setWebgpuReady(true));
  }, []);

  // Preload the Whisper model as soon as its engine is selected, so the first
  // transcription isn't gated on a cold (hundreds-of-MB) download + WebGPU init.
  useEffect(() => {
    if (engine !== "whisper-webgpu") {
      setStatus("");
      return;
    }
    let cancelled = false;
    setStatus(whisperReady(whisperModel) ? "Whisper ready" : "Preloading Whisper…");
    void prewarmWhisper(whisperModel).then(() => {
      if (!cancelled) setStatus(whisperReady(whisperModel) ? "Whisper ready" : "");
    });
    return () => {
      cancelled = true;
    };
  }, [engine, whisperModel]);

  const setVad = (patch: Partial<GemmaVad>): void => {
    Object.assign(vadRef.current, patch);
    const next = { ...vadRef.current };
    setVadView(next);
    localStorage.setItem("sidebar.vad", JSON.stringify(next));
  };

  const setEngine = (id: AsrProviderId): void => {
    setEngineState(id);
    localStorage.setItem("sidebar.asr", id);
  };

  const setLang = (l: string): void => {
    setLangState(l);
    localStorage.setItem("sidebar.lang", l);
  };

  const setWhisperModel = (m: string): void => {
    setWhisperModelState(m);
    localStorage.setItem("sidebar.whispermodel", m);
  };

  const setMode = (m: MicMode): void => {
    setModeState(m);
    modeRef.current = m;
    localStorage.setItem("sidebar.micmode", m);
    if (asrRef.current) {
      const muted = m === "ptt";
      asrRef.current.setMuted?.(muted);
      setTalking(!muted);
    }
  };

  const startWith = async (id: AsrProviderId, play?: Playback): Promise<void> => {
    setError("");
    const provider = createAsrProvider(id, { vad: vadRef.current, lang, whisperModel, playback: play });
    try {
      await provider.start({
        // Untagged — the server attributes by the WS connection's presence.
        onPartial: (text) => send({ type: "transcript.partial", text }),
        onFinal: (text) => send({ type: "transcript.final", text }),
        onError: (msg) => setError(msg),
        onLevel: (lvl) => setLevel(lvl),
        onMetrics: (m) => setMetric(m),
        onStatus: (m) => setStatus(m.progress != null ? `${m.text} ${Math.round(m.progress)}%` : m.text),
        onProgress: (p) => setPlayback(play ? { name: play.label, elapsedSec: p.elapsedSec, durationSec: p.durationSec } : null),
        onEnded: () => stop(), // recording finished — reset to idle
      });
      asrRef.current = provider;
      setSpeechOn(true);
      if (play) {
        setPlayback({ name: play.label, elapsedSec: 0, durationSec: 0 });
        setTalking(true); // recordings are always "live" (no PTT gating)
      } else {
        const ptt = modeRef.current === "ptt";
        provider.setMuted?.(ptt); // PTT starts muted until held
        setTalking(!ptt);
      }
    } catch (err) {
      provider.stop();
      if (!play && id === "elevenlabs" && webSpeechAvailable()) {
        setError("ElevenLabs unavailable — using browser speech");
        setEngine("webspeech");
        await startWith("webspeech");
        return;
      }
      setError(err instanceof Error ? err.message : play ? "Couldn't play that recording" : "Mic failed to start");
    }
  };

  const start = (): Promise<void> => startWith(engine);

  const playFile = async (file: File): Promise<void> => {
    if (!engineSupportsPlayback(engine)) {
      setError("Pick Gemma (local) or Whisper (your GPU) to play a recording");
      return;
    }
    if (asrRef.current) stop();
    const data = await file.arrayBuffer();
    await startWith(engine, { data, label: file.name });
  };

  const stop = (): void => {
    asrRef.current?.stop();
    asrRef.current = null;
    setSpeechOn(false);
    setTalking(false);
    setLevel(0);
    setMetric(null);
    setStatus("");
    setPlayback(null);
  };

  const pttDown = (): void => {
    if (modeRef.current !== "ptt" || !asrRef.current) return;
    asrRef.current.setMuted?.(false);
    setTalking(true);
  };
  const pttUp = (): void => {
    if (modeRef.current !== "ptt" || !asrRef.current) return;
    asrRef.current.setMuted?.(true);
    setTalking(false);
  };

  // Hold Space to talk (when push-to-talk is armed and the mic is on).
  useEffect(() => {
    if (mode !== "ptt" || !speechOn) return;
    const down = (e: KeyboardEvent): void => {
      if (e.code === "Space" && !e.repeat && !isTyping(document.activeElement)) {
        e.preventDefault();
        pttDown();
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === "Space" && !isTyping(document.activeElement)) {
        e.preventDefault();
        pttUp();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, speechOn]);

  return {
    speechOn,
    talking,
    engine,
    setEngine,
    lang,
    setLang,
    whisperModel,
    setWhisperModel,
    mode,
    setMode,
    level,
    metric,
    error,
    status,
    start,
    stop,
    pttDown,
    pttUp,
    playFile,
    playback,
    canPlayback: engineSupportsPlayback(engine),
    vad,
    setVad,
    showVad,
    setShowVad,
  };
}
