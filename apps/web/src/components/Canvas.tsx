import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPE,
} from "react";
import type { SidebarState, Artifact as Art, ActivityEvent } from "../ws";
import type { ClientEvent, ParticipantPresence } from "@sidebar/shared";

const W = 440;
const H = 360;
const VAR_H = 404;
const GAP = 64;
const STAGE_Y = H + GAP * 1.7;
const MIN_Z = 0.28;
const MAX_Z = 1.75;

interface PositionedArtifact {
  a: Art;
  x: number;
  y: number;
  h: number;
}

interface WorldBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PointerWorld {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  artifactId?: string;
}

export function Canvas({ state, send, hostMode }: { state: SidebarState; send: (e: ClientEvent) => void; hostMode: boolean }) {
  const vpRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 40, y: 30, z: 0.9 });
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [vpSize, setVpSize] = useState({ w: 1, h: 1 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const camRef = useRef(cam);
  const positionedRef = useRef<PositionedArtifact[]>([]);
  const cursorEmit = useRef<{ t: number; x: number; y: number } | null>(null);
  const sendRef = useRef(send);

  const perm = useMemo(() => state.artifacts.filter((a) => !a.variant), [state.artifacts]);
  const positioned = useMemo<PositionedArtifact[]>(() => {
    return state.artifacts.map((a) => {
      if (a.variant) {
        const variants = state.artifacts.filter((v) => v.variant && v.buildId === a.buildId);
        const k = variants.indexOf(a);
        return { a, x: perm.length * (W + GAP) + k * (W + GAP), y: STAGE_Y, h: VAR_H };
      }
      return { a, x: perm.indexOf(a) * (W + GAP), y: 0, h: H };
    });
  }, [perm, state.artifacts]);
  const bounds = useMemo(() => worldBounds(positioned), [positioned]);
  const selected = positioned.find((p) => p.a.id === selectedId) ?? positioned[positioned.length - 1] ?? null;
  const expanded = state.artifacts.find((a) => a.id === expandedId) ?? null;
  const remotes = state.presence.filter((p) => p.id !== state.selfId);
  const participantById = new Map(state.presence.map((p) => [p.id, p]));
  const viewersByArtifact = new Map<string, ParticipantPresence[]>();

  for (const participant of remotes) {
    const artifactId = participant.cursor?.artifactId;
    if (!artifactId) continue;
    const list = viewersByArtifact.get(artifactId) ?? [];
    list.push(participant);
    viewersByArtifact.set(artifactId, list);
  }

  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    positionedRef.current = positioned;
    if (selectedId && !positioned.some((p) => p.a.id === selectedId)) setSelectedId(null);
  }, [positioned, selectedId]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return undefined;
    const resize = (): void => setVpSize({ w: vp.clientWidth, h: vp.clientHeight });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return undefined;
    const onWheel = (e: WheelEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".meeting-map,.dna,.canvas-controls,.presence-dock,.inspector,.minimap,.prototype-lightbox")) return;
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as {
        source?: string;
        type?: string;
        artifactId?: string;
        x?: number;
        y?: number;
        frameId?: string;
      };
      if (data.source !== "sidebar-artifact-frame" || !data.artifactId || typeof data.x !== "number" || typeof data.y !== "number") {
        return;
      }
      const vp = vpRef.current;
      if (!vp) return;
      const iframe = data.frameId
        ? vp.querySelector<HTMLIFrameElement>(`iframe[data-frame-id="${cssEscape(data.frameId)}"]`)
        : Array.from(vp.querySelectorAll<HTMLIFrameElement>("iframe[data-artifact-id]")).find(
            (frame) => frame.dataset.artifactId === data.artifactId,
          );
      if (!iframe) return;
      const vpRect = vp.getBoundingClientRect();
      const frameRect = iframe.getBoundingClientRect();
      const x = frameRect.left - vpRect.left + data.x;
      const y = frameRect.top - vpRect.top + data.y;
      const c = camRef.current;
      const worldX = (x - c.x) / c.z;
      const worldY = (y - c.y) / c.z;
      const payload = { x, y, worldX, worldY, artifactId: data.artifactId };
      setSelectedId(data.artifactId);
      sendRef.current({ type: "presence.cursor", cursor: payload });
      if (data.type === "ping") sendRef.current({ type: "presence.ping", ping: payload });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Camera follows the newest artifact until the user takes manual control.
  useEffect(() => {
    if (!follow || !vpRef.current || positionedRef.current.length === 0) return;
    const last = positionedRef.current[positionedRef.current.length - 1]!;
    focusPosition(last.x + W / 2, last.y + last.h / 2, 0.9, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.artifacts.length, follow]);

  const focusPosition = (worldX: number, worldY: number, z = camRef.current.z, manual = true): void => {
    const vp = vpRef.current;
    if (!vp) return;
    const nextZ = clamp(z, MIN_Z, MAX_Z);
    if (manual) setFollow(false);
    setCam({
      x: vp.clientWidth / 2 - worldX * nextZ,
      y: vp.clientHeight / 2 - worldY * nextZ,
      z: nextZ,
    });
  };

  const fitAll = (): void => {
    const vp = vpRef.current;
    if (!vp || !bounds) return;
    const pad = 104;
    const z = clamp(Math.min((vp.clientWidth - pad) / bounds.w, (vp.clientHeight - pad) / bounds.h, 1.08), MIN_Z, MAX_Z);
    setFollow(false);
    setCam({
      x: vp.clientWidth / 2 - (bounds.x + bounds.w / 2) * z,
      y: vp.clientHeight / 2 - (bounds.y + bounds.h / 2) * z,
      z,
    });
  };

  const zoomAt = (x: number, y: number, factor: number): void => {
    setFollow(false);
    setCam((c) => {
      const nextZ = clamp(c.z * factor, MIN_Z, MAX_Z);
      const worldX = (x - c.x) / c.z;
      const worldY = (y - c.y) / c.z;
      return { x: x - worldX * nextZ, y: y - worldY * nextZ, z: nextZ };
    });
  };

  const focusArtifact = (id: string): void => {
    const item = positionedRef.current.find((p) => p.a.id === id);
    if (!item) return;
    setSelectedId(id);
    focusPosition(item.x + W / 2, item.y + item.h / 2, 1.02);
  };

  const pointerWorld = (e: RPE): PointerWorld | null => {
    const vp = vpRef.current;
    if (!vp) return null;
    const rect = vp.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = camRef.current;
    const worldX = (x - c.x) / c.z;
    const worldY = (y - c.y) / c.z;
    const hit = [...positionedRef.current].reverse().find((p) => worldX >= p.x && worldX <= p.x + W && worldY >= p.y && worldY <= p.y + p.h);
    return { x, y, worldX, worldY, artifactId: hit?.a.id };
  };

  const emitCursor = (e: RPE, force = false): PointerWorld | null => {
    const point = pointerWorld(e);
    if (!point) return null;
    const last = cursorEmit.current;
    const now = performance.now();
    const far = !last || Math.hypot(point.x - last.x, point.y - last.y) > 12;
    if (force || far || now - (last?.t ?? 0) > 45) {
      cursorEmit.current = { t: now, x: point.x, y: point.y };
      send({
        type: "presence.cursor",
        cursor: {
          x: point.x,
          y: point.y,
          worldX: point.worldX,
          worldY: point.worldY,
          artifactId: point.artifactId,
        },
      });
    }
    return point;
  };

  const onDown = (e: RPE): void => {
    emitCursor(e, true);
    if ((e.target as HTMLElement).closest(".artifact")) return;
    drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    setGrabbing(true);
    setFollow(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPE): void => {
    emitCursor(e);
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.moved = drag.current.moved || Math.hypot(e.clientX - drag.current.startX, e.clientY - drag.current.startY) > 4;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };

  const onUp = (e: RPE): void => {
    const point = emitCursor(e, true);
    const wasClick = drag.current && !drag.current.moved;
    if (wasClick && point) {
      send({
        type: "presence.ping",
        ping: { x: point.x, y: point.y, worldX: point.worldX, worldY: point.worldY },
      });
    }
    drag.current = null;
    setGrabbing(false);
  };

  return (
    <div
      className={"viewport" + (grabbing ? " grab" : "")}
      ref={vpRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        drag.current = null;
        setGrabbing(false);
      }}
    >
      {state.artifacts.length === 0 && (
        <div className="empty-hint">
          <b>Nothing built yet</b>
          <span>Describe an idea in the meeting — the prototype appears here.</span>
        </div>
      )}

      <div className="world" style={{ transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.z})` }}>
        <div className="world-lane primary">build stream</div>
        {state.fanoutBuildId ? <div className="world-lane variants">design fan-out</div> : null}
        {positioned.map((p) => (
          <ArtifactCard
            key={p.a.id}
            a={p.a}
            x={p.x}
            y={p.y}
            selected={selected?.a.id === p.a.id}
            viewers={viewersByArtifact.get(p.a.id) ?? []}
            send={send}
            onSelect={() => setSelectedId(p.a.id)}
            onFocus={() => focusPosition(p.x + W / 2, p.y + p.h / 2, 1.02)}
            onOpen={() => setExpandedId(p.a.id)}
          />
        ))}
      </div>

      <div className="presence-layer" aria-hidden="true">
        {state.pings.map((ping) => {
          const participant = participantById.get(ping.participantId);
          const point = worldToScreen(ping.worldX, ping.worldY, cam);
          return (
            <span
              key={ping.id}
              className="cursor-ping"
              style={{ left: point.x, top: point.y, "--pc": participant?.color ?? "var(--mint)" } as CSSProperties}
            />
          );
        })}
        {remotes
          .filter((p) => p.cursor)
          .map((p) => {
            const point = worldToScreen(p.cursor!.worldX, p.cursor!.worldY, cam);
            return <RemoteCursor key={p.id} participant={p} x={point.x} y={point.y} />;
          })}
      </div>

      {hostMode ? <DNA state={state} send={send} /> : null}
      {hostMode ? (
        <MeetingMap
          events={state.activity}
          open={mapOpen}
          onToggle={() => setMapOpen((v) => !v)}
          onFocusArtifact={focusArtifact}
        />
      ) : null}
      <PresenceDock state={state} send={send} hostMode={hostMode} />
      <CanvasControls
        count={perm.length}
        zoom={cam.z}
        follow={follow}
        onZoomIn={() => setCam((c) => ({ ...c, z: Math.min(MAX_Z, c.z * 1.15) }))}
        onZoomOut={() => setCam((c) => ({ ...c, z: Math.max(MIN_Z, c.z * 0.87) }))}
        onFit={fitAll}
        onFollow={() => setFollow(true)}
      />
      {hostMode && selected ? (
        <Inspector
          artifact={selected.a}
          viewers={viewersByArtifact.get(selected.a.id) ?? []}
          onFocus={() => focusPosition(selected.x + W / 2, selected.y + selected.h / 2, 1.02)}
          onOpen={() => setExpandedId(selected.a.id)}
        />
      ) : null}
      <MiniMap bounds={bounds} cam={cam} positioned={positioned} vpSize={vpSize} onJump={(x, y) => focusPosition(x, y, cam.z)} />
      {expanded ? <PrototypeLightbox artifact={expanded} onClose={() => setExpandedId(null)} /> : null}

      {state.fanoutBuildId && (
        <div className="stage-banner">
          Pick a design direction — it styles every later <b>build</b>
        </div>
      )}
    </div>
  );
}

function MeetingMap({
  events,
  open,
  onToggle,
  onFocusArtifact,
}: {
  events: ActivityEvent[];
  open: boolean;
  onToggle: () => void;
  onFocusArtifact: (id: string) => void;
}) {
  const visible = events.slice(-12);
  const current = visible[visible.length - 1];
  return (
    <div className={"meeting-map" + (open ? "" : " collapsed")} onPointerDown={(e) => e.stopPropagation()}>
      <div className="map-head">
        <span>meeting map</span>
        <button className="map-collapse" data-tip={open ? "Collapse meeting map" : "Expand meeting map"} aria-label={open ? "Collapse meeting map" : "Expand meeting map"} onClick={onToggle}>
          {open ? "−" : "+"}
        </button>
      </div>
      {open ? (
        <div className="map-body">
          {visible.length === 0 ? (
            <div className="map-empty">waiting for the first meeting event</div>
          ) : (
            visible.map((event) => (
              <button
                type="button"
                key={event.id}
                className={"map-node " + event.kind + (event.artifactId ? " can-focus" : "")}
                onClick={() => {
                  if (event.artifactId) onFocusArtifact(event.artifactId);
                }}
              >
                <span className="map-dot" />
                <span className="map-copy">
                  <span className="map-meta">
                    <span>{clock(event.at)}</span>
                    <span>{kindLabel(event.kind)}</span>
                  </span>
                  <span className="map-title">{event.title}</span>
                  {event.detail ? <span className="map-detail">{event.detail}</span> : null}
                  {event.flags ? (
                    <span className="map-branches">
                      <i className={event.flags.proto ? "on proto" : ""}>proto</i>
                      <i className={event.flags.summary ? "on summary" : ""}>summary</i>
                      <i className={event.flags.fact ? "on fact" : ""}>fact</i>
                      <i className={event.flags.screen ? "on screen" : ""}>screen</i>
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="map-peek">{current ? kindLabel(current.kind) : "standby"}</div>
      )}
    </div>
  );
}

function ArtifactCard({
  a,
  x,
  y,
  selected,
  viewers,
  send,
  onSelect,
  onFocus,
  onOpen,
}: {
  a: Art;
  x: number;
  y: number;
  selected: boolean;
  viewers: ParticipantPresence[];
  send: (e: ClientEvent) => void;
  onSelect: () => void;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const isVar = !!a.variant;
  const pick = (): void => send({ type: "pick", buildId: a.buildId, themeKey: a.themeKey });
  return (
    <div
      className={"artifact" + (isVar ? " variant" : "") + (a.variant?.recommended ? " reco" : "") + (selected ? " selected" : "")}
      style={{ left: x, top: y, "--watch": viewers[0]?.color ?? "transparent" } as CSSProperties}
      onClick={isVar ? pick : onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="art-head" onClick={onSelect}>
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
        {viewers.length ? (
          <span className="art-watchers">
            {viewers.slice(0, 3).map((p) => (
              <i key={p.id} style={{ background: p.color }} data-tip={p.name}>
                {initials(p.name)}
              </i>
            ))}
          </span>
        ) : null}
        {a.usesScreen && <span className="art-screen">&#128247; screen</span>}
        <button
          className="art-icon"
          data-tip="Focus"
          aria-label="Focus"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-crosshair-icon lucide-crosshair"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>
        </button>
        <button
          className="art-icon"
          data-tip="Open large"
          aria-label="Open large"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-maximize"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
        </button>
        <span className="art-time">{a.status === "done" && a.ms != null ? (a.ms / 1000).toFixed(2) + "s" : "…"}</span>
      </div>
      <div className="art-body">
        <iframe
          data-artifact-id={a.id}
          data-frame-id={`card-${a.id}`}
          sandbox="allow-scripts"
          srcDoc={withFramePresenceBridge(a.html, a.id, `card-${a.id}`)}
          title={a.id}
        />
        {a.status === "building" ? (
          <div className="build-sheen">
            <span />
          </div>
        ) : null}
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

function CanvasControls({
  count,
  zoom,
  follow,
  onZoomIn,
  onZoomOut,
  onFit,
  onFollow,
}: {
  count: number;
  zoom: number;
  follow: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onFollow: () => void;
}) {
  return (
    <div className="canvas-controls" onPointerDown={(e) => e.stopPropagation()}>
      <span className="acount">
        {count} artifact{count === 1 ? "" : "s"}
      </span>
      <button className="cbtn" data-tip="Zoom in" aria-label="Zoom in" onClick={onZoomIn}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zoom-in-icon lucide-zoom-in" style={{ display: "block", margin: "auto" }}><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
      </button>
      <button className="cbtn" data-tip="Zoom out" aria-label="Zoom out" onClick={onZoomOut}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zoom-out-icon lucide-zoom-out" style={{ display: "block", margin: "auto" }}><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
      </button>
      <button className="cbtn" data-tip="Fit canvas" onClick={onFit}>
        fit
      </button>
      <button className={"cbtn" + (follow ? " active" : "")} data-tip="Follow latest" onClick={onFollow}>
        follow
      </button>
      <span className="zoom-read">{Math.round(zoom * 100)}%</span>
    </div>
  );
}

function RemoteCursor({ participant, x, y }: { participant: ParticipantPresence; x: number; y: number }) {
  return (
    <div className="remote-cursor" style={{ left: x, top: y, "--pc": participant.color } as CSSProperties}>
      <span className="cursor-arrow" />
      <span className="cursor-label">{participant.name}</span>
    </div>
  );
}

function PresenceDock({ state, send, hostMode }: { state: SidebarState; send: (e: ClientEvent) => void; hostMode: boolean }) {
  const kick = (p: ParticipantPresence): void => {
    if (confirm(`Remove ${p.name} from the meeting?`)) send({ type: "host.kick", id: p.id });
  };
  return (
    <div className="presence-dock" onPointerDown={(e) => e.stopPropagation()}>
      <span className="presence-title">room</span>
      <div className="presence-avatars">
        {state.presence.map((p) => {
          const isSelf = p.id === state.selfId;
          const canKick = hostMode && !isSelf;
          return (
            <span
              key={p.id}
              className={"presence-avatar" + (isSelf ? " self" : "") + (canKick ? " kickable" : "")}
              style={{ background: p.color }}
              data-tip={isSelf ? `${p.name} (you)` : canKick ? `${p.name} — click ✕ to remove` : p.name}
            >
              {initials(p.name)}
              {canKick ? (
                <button className="presence-kick" aria-label={`Remove ${p.name}`} onClick={() => kick(p)}>
                  ✕
                </button>
              ) : null}
            </span>
          );
        })}
      </div>
      <span className="presence-count">{state.presence.length} online</span>
    </div>
  );
}

function Inspector({
  artifact,
  viewers,
  onFocus,
  onOpen,
}: {
  artifact: Art;
  viewers: ParticipantPresence[];
  onFocus: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="inspector" onPointerDown={(e) => e.stopPropagation()}>
      <div className="inspector-k">selected</div>
      <div className="inspector-title">{artifact.intent}</div>
      <div className="inspector-grid">
        <span>status</span>
        <b>{artifact.status}</b>
        <span>latency</span>
        <b>{artifact.ms != null ? (artifact.ms / 1000).toFixed(2) + "s" : "streaming"}</b>
        <span>source</span>
        <b>{artifact.usesScreen ? "screen" : "transcript"}</b>
      </div>
      {viewers.length ? (
        <div className="inspector-viewers">
          {viewers.map((p) => (
            <span key={p.id}>
              <i style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="inspector-actions">
        <button className="inspect-btn" onClick={onFocus}>
          Focus
        </button>
        <button className="inspect-btn primary" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  );
}

function PrototypeLightbox({ artifact, onClose }: { artifact: Art; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="prototype-lightbox"
      role="dialog"
      aria-modal="true"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="prototype-modal">
        <div className="prototype-top">
          <div>
            <div className="prototype-k">prototype preview</div>
            <div className="prototype-title">{artifact.intent}</div>
          </div>
          <div className="prototype-meta">
            <span>{artifact.status === "done" && artifact.ms != null ? (artifact.ms / 1000).toFixed(2) + "s" : "streaming"}</span>
            {artifact.usesScreen ? <span>screen-aware</span> : <span>transcript</span>}
          </div>
          <button className="prototype-close" data-tip="Close preview" aria-label="Close preview" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="prototype-frame">
          <iframe
            data-artifact-id={artifact.id}
            data-frame-id={`large-${artifact.id}`}
            sandbox="allow-scripts"
            srcDoc={withFramePresenceBridge(artifact.html, artifact.id, `large-${artifact.id}`)}
            title={`${artifact.id} large preview`}
          />
        </div>
      </div>
    </div>
  );
}

function MiniMap({
  bounds,
  cam,
  positioned,
  vpSize,
  onJump,
}: {
  bounds: WorldBounds | null;
  cam: { x: number; y: number; z: number };
  positioned: PositionedArtifact[];
  vpSize: { w: number; h: number };
  onJump: (x: number, y: number) => void;
}) {
  if (!bounds || positioned.length === 0) return null;
  const mapW = 172;
  const mapH = 108;
  const pad = 9;
  const scale = Math.min((mapW - pad * 2) / bounds.w, (mapH - pad * 2) / bounds.h);
  const px = (x: number): number => pad + (x - bounds.x) * scale;
  const py = (y: number): number => pad + (y - bounds.y) * scale;
  const view = {
    x: -cam.x / cam.z,
    y: -cam.y / cam.z,
    w: vpSize.w / cam.z,
    h: vpSize.h / cam.z,
  };

  return (
    <div
      className="minimap"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = bounds.x + (e.clientX - rect.left - pad) / scale;
        const y = bounds.y + (e.clientY - rect.top - pad) / scale;
        onJump(x, y);
      }}
      style={{ width: mapW, height: mapH }}
    >
      {positioned.map((p) => (
        <span
          key={p.a.id}
          className={"mini-art" + (p.a.variant ? " variant" : "")}
          style={{ left: px(p.x), top: py(p.y), width: W * scale, height: p.h * scale }}
        />
      ))}
      <span
        className="mini-view"
        style={{ left: px(view.x), top: py(view.y), width: view.w * scale, height: view.h * scale }}
      />
    </div>
  );
}

function DNA({ state, send }: { state: SidebarState; send: (e: ClientEvent) => void }) {
  const t = state.dna;
  return (
    <div className="dna" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dna-h">
        <span>DESIGN DNA</span>
        <button className="reset" data-tip="forget learned style" aria-label="forget learned style" onClick={() => send({ type: "resetTaste" })}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-rotate-cw-icon lucide-rotate-cw"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
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
      <div className="dna-learn">{t ? "applied to every new build" : "awaiting your first pick"}</div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function worldToScreen(worldX: number, worldY: number, cam: { x: number; y: number; z: number }): { x: number; y: number } {
  return { x: worldX * cam.z + cam.x, y: worldY * cam.z + cam.y };
}

function worldBounds(items: PositionedArtifact[]): WorldBounds | null {
  if (items.length === 0) return null;
  const x0 = Math.min(...items.map((p) => p.x));
  const y0 = Math.min(...items.map((p) => p.y));
  const x1 = Math.max(...items.map((p) => p.x + W));
  const y1 = Math.max(...items.map((p) => p.y + p.h));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function kindLabel(kind: ActivityEvent["kind"]): string {
  switch (kind) {
    case "start":
      return "start";
    case "utterance":
      return "voice";
    case "router":
      return "decision";
    case "summary":
      return "summary";
    case "factcheck":
      return "fact";
    case "fanout":
      return "fan-out";
    case "prototype":
      return "build";
    case "complete":
      return "render";
    case "pick":
      return "pick";
    case "dna":
      return "dna";
    case "end":
      return "end";
  }
}

function clock(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(ts);
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function withFramePresenceBridge(html: string, artifactId: string, frameId: string): string {
  const bridge = `<script>(()=>{const id=${JSON.stringify(artifactId)},frameId=${JSON.stringify(frameId)};let last=0;function post(type,e){parent.postMessage({source:"sidebar-artifact-frame",type,artifactId:id,frameId,x:e.clientX,y:e.clientY},"*")}addEventListener("pointermove",e=>{const now=performance.now();if(now-last>45){last=now;post("cursor",e)}},true);addEventListener("pointerdown",e=>post("cursor",e),true);addEventListener("click",e=>post("ping",e),true)})();<\/script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bridge}</body>`) : `${html}${bridge}`;
}
