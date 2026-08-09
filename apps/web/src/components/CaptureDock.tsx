import { useEffect, useRef, useState } from "react";
import type { ClientEvent } from "@sidebar/shared";
import type { SidebarState } from "../ws";
import { InviteButton } from "./InviteButton";

/**
 * Host meeting controls (top bar): go live, share screen, manual line, stop, invite.
 * Per-participant microphone lives in the shared <ParticipantBar/> (every participant
 * captures their own track — see useCapture).
 */
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
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenOnRef = useRef(false);

  useEffect(() => {
    return () => {
      stopScreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistHost = (value: string): void => {
    setHost(value);
    localStorage.setItem("sidebar.host", value);
    send({ type: "presence.hello", name: value, role: "host" });
  };

  const sendStatus = (screen = screenOnRef.current): void => {
    send({ type: "capture.status", screen, speech: false, host });
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
      sendStatus(true);
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
    sendStatus(false);
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

  const sendManual = (): void => {
    const clean = manual.trim();
    if (!clean) return;
    void captureFrame();
    send({ type: "transcript.final", text: clean, speaker: host });
    setManual("");
  };

  if (!hostMode) {
    const selfName = state.presence.find((p) => p.id === state.selfId)?.name ?? "";
    return (
      <div className="watchDock">
        <span className={"watch-dot" + (state.capture.screen ? " on" : "")} />
        <span className="watchHost">{state.capture.host ?? "host"}&rsquo;s room</span>
        <input
          className="watchName"
          placeholder="your name"
          defaultValue={selfName.startsWith("Viewer ") ? "" : selfName}
          aria-label="Your name"
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const n = e.target.value.trim();
            if (n) {
              localStorage.setItem("sidebar.viewer", n);
              send({ type: "presence.hello", name: n, role: "viewer" });
            }
          }}
        />
        <a href={withHostParam()}>host view</a>
      </div>
    );
  }

  return (
    <div className="captureDock">
      <input className="hostName" value={host} onChange={(e) => persistHost(e.target.value)} placeholder="your name" aria-label="Host name" />
      <button className="capBtn primary" onClick={startRoom}>
        Live
      </button>
      <button className={"capBtn" + (screenOn ? " on" : "")} onClick={screenOn ? stopScreen : () => void startScreen()}>
        Screen
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
      <InviteButton />
      {error ? <span className="capError">{error}</span> : null}
    </div>
  );
}

function withHostParam(): string {
  const url = new URL(location.href);
  url.searchParams.set("host", "1");
  return url.pathname + url.search + url.hash;
}
