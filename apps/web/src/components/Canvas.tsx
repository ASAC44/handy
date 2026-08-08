import { useEffect, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from "react";
import type { SidebarState, Artifact as Art } from "../ws";
import type { ClientEvent } from "@sidebar/shared";

const W = 440;
const H = 360;
const GAP = 64;
const STAGE_Y = H + GAP * 1.7;

export function Canvas({ state, send }: { state: SidebarState; send: (e: ClientEvent) => void }) {
  const vpRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 40, y: 30, z: 0.9 });
  const [follow, setFollow] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const perm = state.artifacts.filter((a) => !a.variant);
  const positioned = state.artifacts.map((a) => {
    if (a.variant) {
      const variants = state.artifacts.filter((v) => v.variant && v.buildId === a.buildId);
      const k = variants.indexOf(a);
      return { a, x: perm.length * (W + GAP) + k * (W + GAP), y: STAGE_Y };
    }
    return { a, x: perm.indexOf(a) * (W + GAP), y: 0 };
  });

  // Camera follows the newest artifact.
  useEffect(() => {
    if (!follow || !vpRef.current || positioned.length === 0) return;
    const last = positioned[positioned.length - 1]!;
    const vp = vpRef.current;
    const z = 0.9;
    setCam({ x: vp.clientWidth / 2 - (last.x + W / 2) * z, y: vp.clientHeight / 2 - (last.y + H / 2) * z, z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.artifacts.length, follow]);

  const onDown = (e: RPE): void => {
    if ((e.target as HTMLElement).closest(".artifact")) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setFollow(false);
  };
  const onMove = (e: RPE): void => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };
  const onUp = (): void => {
    drag.current = null;
  };
  const onWheel = (e: RWE): void => {
    setFollow(false);
    setCam((c) => ({ ...c, z: Math.max(0.25, Math.min(1.7, c.z * (e.deltaY < 0 ? 1.12 : 0.89))) }));
  };

  return (
    <div
      className="viewport"
      ref={vpRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onWheel={onWheel}
    >
      {state.artifacts.length === 0 && (
        <div className="empty-hint">
          <b>canvas</b>
          <br />
          agents fan out design variants here — you pick, Sidebar learns
        </div>
      )}

      <div className="world" style={{ transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.z})` }}>
        {positioned.map(({ a, x, y }) => (
          <ArtifactCard key={a.id} a={a} x={x} y={y} send={send} />
        ))}
      </div>

      <DNA state={state} send={send} />

      {state.fanoutBuildId && (
        <div className="stage-banner">
          ◆ Pick a direction · Sidebar learns your taste · <b>auto-selects</b>
        </div>
      )}

      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, alignItems: "center", zIndex: 7 }}>
        <span className="acount">
          {perm.length} artifact{perm.length === 1 ? "" : "s"}
        </span>
        <button className="cbtn" onClick={() => setCam((c) => ({ ...c, z: Math.min(1.7, c.z * 1.15) }))}>
          +
        </button>
        <button className="cbtn" onClick={() => setCam((c) => ({ ...c, z: Math.max(0.25, c.z * 0.87) }))}>
          &minus;
        </button>
        <button className="cbtn" onClick={() => setFollow(true)}>
          follow
        </button>
      </div>
    </div>
  );
}

function ArtifactCard({ a, x, y, send }: { a: Art; x: number; y: number; send: (e: ClientEvent) => void }) {
  const isVar = !!a.variant;
  const pick = (): void => send({ type: "pick", buildId: a.buildId, themeKey: a.themeKey });
  return (
    <div
      className={"artifact" + (isVar ? " variant" : "") + (a.variant?.recommended ? " reco" : "")}
      style={{ left: x, top: y }}
      onClick={isVar ? pick : undefined}
    >
      <div className="art-head">
        <span className="art-badge">&#9670;</span>
        {isVar ? (
          <span className="art-vname">
            {a.variant!.name}
            {a.variant!.recommended ? <i>&#9733;</i> : null}
          </span>
        ) : (
          <span className="art-side">Cerebras</span>
        )}
        <span className="art-title">{a.intent}</span>
        {a.usesScreen && <span className="art-screen">&#128247; screen</span>}
        <span className="art-time">{a.status === "done" && a.ms != null ? (a.ms / 1000).toFixed(2) + "s" : "…"}</span>
      </div>
      <div className="art-body">
        <iframe sandbox="allow-scripts" srcDoc={a.html} title={a.id} />
      </div>
      {isVar && (
        <div className="art-foot">
          <button
            className="use-btn"
            onClick={(e) => {
              e.stopPropagation();
              pick();
            }}
          >
            Use this design &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

function DNA({ state, send }: { state: SidebarState; send: (e: ClientEvent) => void }) {
  const t = state.dna;
  return (
    <div className="dna">
      <div className="dna-h">
        <span>DESIGN DNA</span>
        <button className="reset" title="forget learned style" onClick={() => send({ type: "resetTaste" })}>
          &#10227;
        </button>
      </div>
      <div className="dna-sub">learned from your picks</div>
      <span className={"dna-status" + (t ? " on" : "")}>{t ? "learned · " + t.name : "learning…"}</span>
      <div className="dna-sw">
        {t ? (
          [t.bg, t.surface, t.accent, t.accent2, t.ink].map((c, i) => <i key={i} style={{ background: c }} />)
        ) : (
          <span className="ph">—</span>
        )}
      </div>
      {t ? (
        <div>
          <div className="dna-row">
            <span>Accent</span>
            <b>{t.name}</b>
          </div>
          <div className="dna-row">
            <span>Radius</span>
            <b>{t.radius}</b>
          </div>
          <div className="dna-row">
            <span>Density</span>
            <b>{t.density}</b>
          </div>
          <div className="dna-row">
            <span>Type</span>
            <b>{t.typeLabel}</b>
          </div>
          <div className="dna-learn">◆ applied to every new build</div>
        </div>
      ) : (
        <div className="dna-row">
          <span style={{ color: "var(--dim)" }}>awaiting your first pick</span>
        </div>
      )}
    </div>
  );
}
