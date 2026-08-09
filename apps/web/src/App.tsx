import { useEffect, useRef, useState } from "react";
import { useSidebar } from "./ws";
import { useLayout, type Side } from "./useLayout";
import { Rail } from "./components/Rail";
import { ContextStrip } from "./components/ContextStrip";
import { Canvas } from "./components/Canvas";
import { Bottom } from "./components/Bottom";
import { CaptureDock } from "./components/CaptureDock";
import { ParticipantBar } from "./components/ParticipantBar";
import { Settings } from "./components/Settings";
import { TooltipHost } from "./components/TooltipHost";
import { DragLayer, type DragLayerHandle } from "./components/DragLayer";
import { useCapture } from "./useCapture";
import { checkGate, getKey, seedKeyFromUrl, setKey } from "./auth";

/** Builds the .main grid-template-columns: a fixed track per visible rail with
 *  the canvas always taking the remaining 1fr in the middle. */
function buildCols(showLeft: boolean, showRight: boolean, leftW: number, rightW: number): string {
  const parts: string[] = [];
  if (showLeft) parts.push(`${leftW}px`);
  parts.push("1fr");
  if (showRight) parts.push(`${rightW}px`);
  return parts.join(" ");
}

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
  const { leftPanels, rightPanels, railWidth, movePanel, resizePanels, resizeRail } = useLayout();
  // Only `dragging` is lifted here (it flips twice per drag, to force both rails
  // to render so an empty side can show a drop zone). The ghost + drop target
  // live inside DragLayer so per-pointer-move updates don't re-render this tree.
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragLayerHandle>(null);

  const showLeft = leftPanels.length > 0 || dragging;
  const showRight = rightPanels.length > 0 || dragging;
  const cols = buildCols(showLeft, showRight, railWidth.left, railWidth.right);
  const panelProps = { state, hostMode, send };

  // Live preview while a rail-width handle drags: write the grid track directly
  // (no React render). resizeRail commits the final width on release.
  const previewRail = (s: Side, px: number): void => {
    const m = document.querySelector(".main") as HTMLElement | null;
    if (!m) return;
    const lw = s === "left" ? px : railWidth.left;
    const rw = s === "right" ? px : railWidth.right;
    m.style.gridTemplateColumns = buildCols(showLeft, showRight, lw, rw);
  };

  if (state.kicked) return <Removed />;
  return (
    <div className={"app" + (hostMode ? "" : " viewer") + (dragging ? " dragging" : "")}>
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
      <main className="main" style={{ gridTemplateColumns: cols }}>
        {showLeft ? (
          <Rail
            side="left"
            panels={leftPanels}
            panelProps={panelProps}
            railWidth={railWidth.left}
            dragging={dragging}
            dragRef={dragRef}
            resizePanels={resizePanels}
            previewRail={previewRail}
            commitRail={resizeRail}
          />
        ) : null}
        <section className="canvasCol">
          <ContextStrip state={state} send={send} hostMode={hostMode} />
          <Canvas state={state} send={send} hostMode={hostMode} />
        </section>
        {showRight ? (
          <Rail
            side="right"
            panels={rightPanels}
            panelProps={panelProps}
            railWidth={railWidth.right}
            dragging={dragging}
            dragRef={dragRef}
            resizePanels={resizePanels}
            previewRail={previewRail}
            commitRail={resizeRail}
          />
        ) : null}
      </main>
      {hostMode ? <Bottom state={state} send={send} /> : null}
      <ParticipantBar cap={cap} state={state} />
      <DragLayer ref={dragRef} movePanel={movePanel} onDraggingChange={setDragging} />
      <TooltipHost />
    </div>
  );
}
