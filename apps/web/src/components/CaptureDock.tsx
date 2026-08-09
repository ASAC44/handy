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
  onLeave,
}: {
  hostMode: boolean;
  state: SidebarState;
  send: (ev: ClientEvent) => void;
  onLeave: () => void;
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
          defaultValue={selfName.startsWith("Viewer ") || selfName.startsWith("Guest ") ? "" : selfName}
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
        <button className="capBtn stop watchExit" onClick={onLeave} data-tip="Leave the meeting">
          Exit
        </button>
      </div>
    );
  }

  return (
    <div className="captureDock">
      <input className="hostName" value={host} onChange={(e) => persistHost(e.target.value)} placeholder="your name" aria-label="Host name" />
      <button className="capBtn primary" onClick={startRoom} data-tip="Start the live room so others can join">
        Go live
      </button>
      <button
        className={"capBtn" + (screenOn ? " on" : "")}
        onClick={screenOn ? stopScreen : () => void startScreen()}
        data-tip={screenOn ? "Stop sharing your screen" : "Share your screen for visual context"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cast-icon lucide-cast"><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 12a9 9 0 0 1 8 8"/><path d="M2 16a5 5 0 0 1 4 4"/><line x1="2" x2="2.01" y1="20" y2="20"/></svg>
        {screenOn ? "Stop share" : "Share screen"}
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
      <button className="capBtn" onClick={sendManual} data-tip="Send a typed line into the transcript">
        Send
      </button>
      <button
        className="capBtn stop"
        onClick={() => {
          if (
            confirm(
              "End the meeting for everyone? The agents will draft the final recap and all participants move to the read-only summary.",
            )
          ) {
            stopScreen();
            send({ type: "meeting.end" });
          }
        }}
        data-tip="End for everyone and draft the final recap"
      >
        End meeting
      </button>
      <button
        className="capBtn clear"
        onClick={() => {
          if (confirm("Clear the meeting? This wipes the transcript, prototypes, and summary for everyone in the room.")) {
            stopScreen();
            send({ type: "meeting.clear" });
          }
        }}
        data-tip="Wipe the transcript, prototypes, and summary — start fresh"
      >
        Clear
      </button>
      <InviteButton state={state} send={send} />
      {error ? <span className="capError">{error}</span> : null}
    </div>
  );
}

function withHostParam(): string {
  const url = new URL(location.href);
  url.searchParams.set("host", "1");
  return url.pathname + url.search + url.hash;
}
