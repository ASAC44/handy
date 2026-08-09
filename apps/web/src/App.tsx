import { useEffect, useState } from "react";
import { useSidebar } from "./ws";
import { Rail } from "./components/Rail";
import { ContextStrip } from "./components/ContextStrip";
import { Canvas } from "./components/Canvas";
import { Bottom } from "./components/Bottom";
import { CaptureDock } from "./components/CaptureDock";
import { ParticipantBar } from "./components/ParticipantBar";
import { Settings } from "./components/Settings";
import { TooltipHost } from "./components/TooltipHost";
import { useCapture } from "./useCapture";
import { checkGate, getKey, seedKeyFromUrl, setKey } from "./auth";

type GateState = "checking" | "locked" | "open";

/** Locks the entire experience (host AND guests) behind the meeting password when
 *  the server has one configured. The server enforces it independently — this is
 *  the friendly front door, not the lock itself. */
export function App() {
  const [gate, setGate] = useState<GateState>("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    seedKeyFromUrl();
    checkGate(getKey())
      .then((g) => live && setGate(g.authed ? "open" : "locked"))
      // If /gate is unreachable, fall open — the server still rejects the WS/APIs,
      // so the app would just show "offline" rather than silently letting anyone in.
      .catch(() => live && setGate("open"));
    return () => {
      live = false;
    };
  }, []);

  const submit = async (pw: string): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const g = await checkGate(pw);
      if (g.authed) {
        setKey(pw);
        setGate("open");
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  };

  if (gate === "checking") return <div className="lockScreen" aria-busy="true" />;
  if (gate === "locked") return <Lock onSubmit={submit} error={error} busy={busy} />;
  return <Meeting />;
}

function Lock({ onSubmit, error, busy }: { onSubmit: (pw: string) => void; error: string; busy: boolean }) {
  const [pw, setPw] = useState("");
  return (
    <div className="lockScreen">
      <form
        className="lockCard"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw && !busy) onSubmit(pw);
        }}
      >
        <div className="lockBrand">
          <span className="logo">&#9624;</span> Sidebar
        </div>
        <div className="lockTitle">This meeting is locked</div>
        <input
          className="lockInput"
          type="password"
          value={pw}
          autoFocus
          placeholder="meeting password"
          aria-label="Meeting password"
          onChange={(e) => setPw(e.target.value)}
        />
        <button className="lockBtn" type="submit" disabled={!pw || busy}>
          {busy ? "checking…" : "Enter"}
        </button>
        {error ? <div className="lockError">{error}</div> : null}
      </form>
    </div>
  );
}

function Removed() {
  return (
    <div className="lockScreen">
      <div className="lockCard">
        <div className="lockBrand">
          <span className="logo">&#9624;</span> Sidebar
        </div>
        <div className="lockTitle">You were removed from the meeting</div>
        <button className="lockBtn" onClick={() => location.reload()}>
          Rejoin
        </button>
      </div>
    </div>
  );
}

function Meeting() {
  const { state, send, setAbMode } = useSidebar();
  const cap = useCapture(send);
  const hostMode = new URLSearchParams(location.search).has("host");
  if (state.kicked) return <Removed />;
  return (
    <div className={"app" + (hostMode ? "" : " viewer")}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">&#9624;</span> Sidebar <span className="bsub">ambient meeting copilot</span>
        </div>
        <span className={"conn " + (state.connected ? "on" : "off")}>
          {state.connected ? "● connected" : "○ offline"}
        </span>
        <CaptureDock hostMode={hostMode} state={state} send={send} />
        <div className="spacer" />
        {cap.speechOn ? (
          <div className="status">
            <span className="live">
              <i /> {cap.mode === "ptt" ? (cap.talking ? "TALK" : "PTT") : "REC"}
            </span>
          </div>
        ) : null}
        <div className="model">gemma-4-31b</div>
        <Settings state={state} send={send} setAbMode={setAbMode} hostMode={hostMode} />
      </header>
      <main className="main">
        <Rail state={state} hostMode={hostMode} send={send} />
        <section className="canvasCol">
          <ContextStrip state={state} send={send} hostMode={hostMode} />
          <Canvas state={state} send={send} hostMode={hostMode} />
        </section>
      </main>
      {hostMode ? <Bottom state={state} send={send} /> : null}
      <ParticipantBar cap={cap} state={state} />
      <TooltipHost />
    </div>
  );
}
