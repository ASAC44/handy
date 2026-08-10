import { useEffect, useRef, useState } from "react";
import { useHandy } from "./ws";
import { useLayout, type Side } from "./useLayout";
import { Rail } from "./components/Rail";
import { ContextStrip } from "./components/ContextStrip";
import { Canvas } from "./components/Canvas";
import { Bottom } from "./components/Bottom";
import { BottomDock } from "./components/BottomDock";
import { ParticipantBar } from "./components/ParticipantBar";
import { Topbar } from "./components/Topbar";
import { TooltipHost } from "./components/TooltipHost";
import { DragLayer, type DragLayerHandle } from "./components/DragLayer";
import { RecapView } from "./components/RecapView";
import { Logo } from "./components/Logo";
import { useCapture } from "./useCapture";
import { checkGate, getKey, seedKeyFromUrl, setKey } from "./auth";

/** Builds the sidebar + canvas grid tracks. */
const buildCols = (showSidebar: boolean, width: number): string =>
  showSidebar ? `${width}px 1fr` : "1fr";

type GateState = "checking" | "locked" | "open";

/** Locks the entire experience (host AND guests) behind the meeting password when
 *  the server has one configured. The server enforces it independently — this is
 *  the friendly front door, not the lock itself. */
export function DashboardPage() {
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
          <span className="logo"><Logo /></span> Handy
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
          <span className="logo"><Logo /></span> Handy
        </div>
        <div className="lockTitle">You were removed from the meeting</div>
        <button className="lockBtn" onClick={() => location.reload()}>
          Rejoin
        </button>
      </div>
    </div>
  );
}

function Left() {
  return (
    <div className="lockScreen">
      <div className="lockCard">
        <div className="lockBrand">
          <span className="logo"><Logo /></span> Handy
        </div>
        <div className="lockTitle">You left the meeting</div>
        <button className="lockBtn" onClick={() => location.reload()}>
          Rejoin
        </button>
      </div>
    </div>
  );
}

function Meeting() {
  const { state, send, setAbMode, leave } = useHandy();
  const cap = useCapture(send);
  // Server-authoritative once presence arrives: the role comes from the credential the
  // connection authenticated with (host passcode vs guest invite code). The `?host` URL
  // flag is only a pre-snapshot hint / open-mode (no passcode) fallback.
  const self = state.presence.find((p) => p.id === state.selfId);
  // Once presence arrives the server-assigned role is authoritative. Before that, only
  // fall back to the `?host` URL hint in true open mode (no stored credential) — an
  // authenticated guest carries a `?key=`, so host UI never flashes for them.
  const hostMode = self?.role
    ? self.role === "host"
    : state.selfId === null && !getKey() && new URLSearchParams(location.search).has("host");
  const { leftPanels, railWidth, movePanel, resizePanels, resizeRail } = useLayout();

  // When the meeting ends (or you leave / are removed), stop your local mic capture.
  useEffect(() => {
    if ((state.ended || state.left || state.kicked) && cap.speechOn) cap.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ended, state.left, state.kicked, cap.speechOn]);
  // Only `dragging` is lifted here so the rail can show its drop target. The ghost + drop target
  // live inside DragLayer so per-pointer-move updates don't re-render this tree.
  const [dragging, setDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [canvasControlsRoot, setCanvasControlsRoot] = useState<HTMLDivElement | null>(null);
  const dragRef = useRef<DragLayerHandle>(null);

  const showSidebar = leftPanels.length > 0 || dragging;
  const collapsed = sidebarCollapsed && !dragging;
  const sidebarWidth = collapsed ? 40 : railWidth.left;
  const cols = buildCols(showSidebar, sidebarWidth);
  const panelProps = { state, hostMode, send };

  // Live preview while a rail-width handle drags: write the grid track directly
  // (no React render). resizeRail commits the final width on release.
  const previewRail = (s: Side, px: number): void => {
    const m = document.querySelector(".main") as HTMLElement | null;
    if (!m) return;
    if (s === "left") m.style.gridTemplateColumns = buildCols(showSidebar, px);
  };

  if (state.kicked) return <Removed />;
  if (state.left) return <Left />;
  if (state.ended) return <RecapView state={state} send={send} hostMode={hostMode} onLeave={leave} />;
  return (
    <div className={"app" + (hostMode ? "" : " viewer") + (dragging ? " dragging" : "")}>
      <Topbar
        hostMode={hostMode}
        state={state}
        send={send}
        setAbMode={setAbMode}
        onLeave={leave}
        capture={cap}
      />
      <main className="main" style={{ gridTemplateColumns: cols }}>
        {showSidebar ? (
          <Rail
            side="left"
            panels={leftPanels}
            collapsed={collapsed}
            onToggle={() => setSidebarCollapsed((current) => !current)}
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
          <ContextStrip state={state} send={send} hostMode={hostMode} controlsRef={setCanvasControlsRoot} />
          <Canvas state={state} send={send} hostMode={hostMode} controlsRoot={canvasControlsRoot} />
          <BottomDock hostMode={false}>
            <ParticipantBar cap={cap} />
          </BottomDock>
        </section>
      </main>
      {hostMode ? (
        <BottomDock hostMode>
          <Bottom state={state} send={send} />
        </BottomDock>
      ) : null}
      <DragLayer ref={dragRef} movePanel={movePanel} onDraggingChange={setDragging} />
      <TooltipHost />
    </div>
  );
}
