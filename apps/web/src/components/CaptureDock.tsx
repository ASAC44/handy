import { useEffect, useRef, useState } from "react";
import type { ClientEvent } from "@sidebar/shared";
import type { SidebarState } from "../ws";
import { asrProviders, createAsrProvider, webSpeechAvailable, type AsrProvider, type AsrProviderId } from "../asr";

export function CaptureDock({
  hostMode,
  state,
  send,
}: {
  hostMode: boolean;
  state: SidebarState;
  send: (ev: ClientEvent) => void;
}) {
  const [host, setHost] = useState(() => localStorage.getItem("sidebar.host") || "Host");
  const [screenOn, setScreenOn] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [asrId, setAsrId] = useState<AsrProviderId>(() => (localStorage.getItem("sidebar.asr") as AsrProviderId) || "elevenlabs");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const asrRef = useRef<AsrProvider | null>(null);
  const screenOnRef = useRef(false);
  const speechOnRef = useRef(false);

  const providers = asrProviders();

  useEffect(() => {
    return () => {
      stopSpeech();
      stopScreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistHost = (value: string): void => {
    setHost(value);
    localStorage.setItem("sidebar.host", value);
    send({ type: "presence.hello", name: value, role: "host" });
  };

  const sendStatus = (screen = screenOnRef.current, speech = speechOnRef.current): void => {
    send({ type: "capture.status", screen, speech, host });
  };

  const startRoom = (): void => {
    setError("");
    send({ type: "presence.hello", name: host, role: "host" });
    send({ type: "live.start", title: "Live Meeting", host });
    sendStatus();
  };

  const startScreen = async (): Promise<void> => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      videoRef.current = video;
      await video.play();
      screenOnRef.current = true;
      setScreenOn(true);
      sendStatus(true, speechOnRef.current);
      await captureFrame();
      frameTimer.current = setInterval(() => {
        void captureFrame();
      }, 3000);
      stream.getVideoTracks()[0]?.addEventListener("ended", stopScreen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen capture failed");
    }
  };

  const stopScreen = (): void => {
    if (frameTimer.current) clearInterval(frameTimer.current);
    frameTimer.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    videoRef.current = null;
    screenOnRef.current = false;
    setScreenOn(false);
    sendStatus(false, speechOnRef.current);
  };

  const captureFrame = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const maxWidth = 1024;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    send({ type: "screen.frame", dataUri: canvas.toDataURL("image/jpeg", 0.72), width, height, ts: Date.now() });
  };

  // Speech-to-text via the pluggable ASR seam (ElevenLabs Scribe v2 / Web Speech /
  // Gemma E4B). Transcripts are forwarded as the existing transcript.* events; a
  // final segment also snaps a fresh screen frame so the build sees current context.
  const startWith = async (id: AsrProviderId): Promise<void> => {
    const provider = createAsrProvider(id);
    try {
      await provider.start({
        onPartial: (text) => send({ type: "transcript.partial", text, speaker: host }),
        onFinal: (text) => {
          void captureFrame();
          send({ type: "transcript.final", text, speaker: host });
        },
        onError: (msg) => setError(msg),
      });
      asrRef.current = provider;
      speechOnRef.current = true;
      setSpeechOn(true);
      sendStatus(screenOnRef.current, true);
    } catch (err) {
      provider.stop();
      // If the premium cloud provider can't start (no token / no key), fall back
      // to the browser engine so the demo keeps working.
      if (id === "elevenlabs" && webSpeechAvailable()) {
        setError("ElevenLabs ASR unavailable — using browser speech");
        await startWith("webspeech");
        return;
      }
      setError(err instanceof Error ? err.message : "Speech start failed");
    }
  };

  const startSpeech = async (): Promise<void> => {
    setError("");
    await startWith(asrId);
  };

  const stopSpeech = (): void => {
    asrRef.current?.stop();
    asrRef.current = null;
    speechOnRef.current = false;
    setSpeechOn(false);
    sendStatus(screenOnRef.current, false);
  };

  const sendManual = (): void => {
    const clean = manual.trim();
    if (!clean) return;
    void captureFrame();
    send({ type: "transcript.final", text: clean, speaker: host });
    setManual("");
  };

  if (!hostMode) {
    return (
      <div className="watchDock">
        <span className={"watch-dot" + (state.capture.screen || state.capture.speech ? " on" : "")} />
        <span>{state.capture.host ?? "viewer"}</span>
        <a href={withHostParam()}>host</a>
      </div>
    );
  }

  return (
    <div className="captureDock">
      <input className="hostName" value={host} onChange={(e) => persistHost(e.target.value)} aria-label="Host name" />
      <button className="capBtn primary" onClick={startRoom}>
        Live
      </button>
      <button className={"capBtn" + (screenOn ? " on" : "")} onClick={screenOn ? stopScreen : () => void startScreen()}>
        Screen
      </button>
      <select
        className="asrSelect"
        value={asrId}
        disabled={speechOn}
        onChange={(e) => {
          const id = e.target.value as AsrProviderId;
          setAsrId(id);
          localStorage.setItem("sidebar.asr", id);
        }}
        aria-label="Speech-to-text engine"
        title="Speech-to-text engine"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.available}>
            {p.label}
          </option>
        ))}
      </select>
      <button className={"capBtn" + (speechOn ? " on" : "")} onClick={speechOn ? stopSpeech : () => void startSpeech()}>
        Mic
      </button>
      <input
        className="manualLine"
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") sendManual();
        }}
        placeholder="manual transcript"
        aria-label="Manual transcript"
      />
      <button className="capBtn" onClick={sendManual}>
        Send
      </button>
      <button className="capBtn stop" onClick={() => send({ type: "live.stop" })}>
        Stop
      </button>
      <a className="shareUrl" href={location.origin} title={location.origin}>
        Share
      </a>
      {error ? <span className="capError">{error}</span> : null}
    </div>
  );
}

function withHostParam(): string {
  const url = new URL(location.href);
  url.searchParams.set("host", "1");
  return url.pathname + url.search + url.hash;
}
