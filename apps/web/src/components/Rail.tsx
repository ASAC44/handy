import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPE,
  type ReactNode,
  type RefObject,
} from "react";
import type { ClientEvent } from "@handy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HandyState } from "../ws";
import { clamp, PANEL_MIN_PX, RAIL_MAX, RAIL_MIN, type PanelId, type PanelLayout, type Side } from "../useLayout";
import type { DragLayerHandle } from "./DragLayer";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface PanelProps {
  state: HandyState;
  hostMode: boolean;
  send: (e: ClientEvent) => void;
}

/** id → title + renderer. Lets a rail render any subset of panels, in any order,
 *  on either side. The three renderers below are the original panel bodies. */
const PANELS: Record<PanelId, { title: string; render: (p: PanelProps) => ReactNode }> = {
  transcript: { title: "Live transcript", render: (p) => <Transcript {...p} /> },
  summary: { title: "Rolling summary", render: (p) => <Summary state={p.state} /> },
  factcheck: { title: "Fact & safety", render: (p) => <FactCheck state={p.state} /> },
};

interface RailProps {
  side: Side;
  panels: PanelLayout[];
  collapsed: boolean;
  onToggle: () => void;
  panelProps: PanelProps;
  railWidth: number;
  dragging: boolean;
  dragRef: RefObject<DragLayerHandle | null>;
  resizePanels: (aId: PanelId, bId: PanelId, aWeight: number, bWeight: number) => void;
  previewRail: (side: Side, px: number) => void;
  commitRail: (side: Side, px: number) => void;
}

/** A docked column of panels beside the canvas. Panels are flex
 *  items whose grow factor is their height weight; a PanelSplitter sits between
 *  each pair, and a RailWidthHandle hugs the inner edge. */
export function Rail({ side, panels, collapsed, onToggle, panelProps, railWidth, dragging, dragRef, resizePanels, previewRail, commitRail }: RailProps) {
  const transcript = panels.find((panel) => panel.id === "transcript");
  const insights = panels.filter((panel) => panel.id !== "transcript");
  return (
    <aside className={`rail rail-${side}${collapsed ? " collapsed" : ""}`} aria-label="Meeting sidebar">
      {collapsed ? (
        <div className="railCollapsedBar">
          <Button
            variant="ghost"
            size="icon-sm"
            className="railToggle"
            onClick={onToggle}
            aria-label="Expand meeting sidebar"
            aria-expanded={false}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="transcript" className="railTabs">
          <div className="railTabsBar">
            <TabsList variant="line" className="railTabList" aria-label="Meeting sidebar views">
              <TabsTrigger value="transcript" className="railTabTrigger">
                Transcript <span className="rec" aria-hidden="true" />
              </TabsTrigger>
              <TabsTrigger value="insights" className="railTabTrigger">Insights</TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon-sm"
              className="railToggle"
              onClick={onToggle}
              aria-label="Collapse meeting sidebar"
              aria-expanded={true}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          </div>
          <TabsContent value="transcript" className="railTabContent">
            {transcript ? (
              <PanelFrame panel={transcript} title={PANELS.transcript.title} weight={1} dragRef={dragRef}>
                {PANELS.transcript.render(panelProps)}
              </PanelFrame>
            ) : dragging ? <div className="dropZone">Drop panel here</div> : null}
          </TabsContent>
          <TabsContent value="insights" className="railTabContent railInsights">
            {insights.length === 0 && dragging ? <div className="dropZone">Drop panel here</div> : null}
            {insights.map((panel, index) => (
              <Fragment key={panel.id}>
                <PanelFrame panel={panel} title={PANELS[panel.id].title} weight={panel.weight} dragRef={dragRef}>
                  {PANELS[panel.id].render(panelProps)}
                </PanelFrame>
                {index < insights.length - 1 ? (
                  <PanelSplitter above={panel} below={insights[index + 1]} onResize={resizePanels} />
                ) : null}
              </Fragment>
            ))}
          </TabsContent>
        </Tabs>
      )}
      {!collapsed ? <RailWidthHandle side={side} width={railWidth} onPreview={previewRail} onCommit={commitRail} /> : null}
    </aside>
  );
}

/** A drag begins only on the header chrome — never on a control inside it
 *  (the host scenario picker, buttons, etc.), so those stay fully usable. */
function isHeaderGrab(e: RPE): boolean {
  const t = e.target as HTMLElement;
  if (!t.closest(".panel-h")) return false;
  if (t.closest("button, select, input, a, .custom-select-container")) return false;
  return true;
}

/** The `.panel` box. Owns the dock gesture: pointer-capture on a header grab,
 *  a >4px move threshold (matching Canvas), then drives the DragLayer by ref so
 *  per-move updates never re-render this tree. */
function PanelFrame({
  panel,
  title,
  weight,
  dragRef,
  children,
}: {
  panel: PanelLayout;
  title: string;
  weight: number;
  dragRef: RefObject<DragLayerHandle | null>;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [srcDrag, setSrcDrag] = useState(false);
  const style = useMemo<CSSProperties>(() => ({ flexGrow: weight, flexShrink: 1, flexBasis: 0 }), [weight]);

  const onDown = (e: RPE): void => {
    if (e.button !== 0 || !isHeaderGrab(e)) return;
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPE): void => {
    const s = start.current;
    if (!s) return;
    if (!s.moved) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) <= 4) return;
      s.moved = true;
      setSrcDrag(true);
      dragRef.current?.begin(panel.id, title, e.clientX, e.clientY);
    } else {
      dragRef.current?.update(e.clientX, e.clientY);
    }
  };
  const onUp = (e: RPE): void => {
    const s = start.current;
    start.current = null;
    if (s?.moved) {
      dragRef.current?.end();
      setSrcDrag(false);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };
  const onCancel = (): void => {
    const s = start.current;
    start.current = null;
    if (s?.moved) {
      dragRef.current?.cancel();
      setSrcDrag(false);
    }
  };

  return (
    <div
      className={"panel" + (srcDrag ? " dragging-src" : "")}
      data-panel-id={panel.id}
      style={style}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      {children}
    </div>
  );
}

/** Horizontal splitter between two stacked panels. Trades height between just
 *  the adjacent pair (the rest of the column is pinned), writing flex-grow to
 *  the DOM live and committing the final weights to layout on release. */
function PanelSplitter({
  above,
  below,
  onResize,
}: {
  above: PanelLayout;
  below: PanelLayout;
  onResize: (aId: PanelId, bId: PanelId, aWeight: number, bWeight: number) => void;
}) {
  const st = useRef<{
    y: number;
    hA: number;
    sumPx: number;
    sumW: number;
    aEl: HTMLElement;
    bEl: HTMLElement;
    lastA: number;
    lastB: number;
  } | null>(null);

  const onDown = (e: RPE): void => {
    if (e.button !== 0) return;
    const rail = e.currentTarget.parentElement;
    if (!rail) return;
    const aEl = rail.querySelector<HTMLElement>(`.panel[data-panel-id="${above.id}"]`);
    const bEl = rail.querySelector<HTMLElement>(`.panel[data-panel-id="${below.id}"]`);
    if (!aEl || !bEl) return;
    const hA = aEl.getBoundingClientRect().height;
    const hB = bEl.getBoundingClientRect().height;
    st.current = { y: e.clientY, hA, sumPx: hA + hB, sumW: above.weight + below.weight, aEl, bEl, lastA: above.weight, lastB: below.weight };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.classList.add("resizing", "resizing-rows");
  };
  const onMove = (e: RPE): void => {
    const s = st.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    const nextHA = clamp(s.hA + dy, PANEL_MIN_PX, s.sumPx - PANEL_MIN_PX);
    const nextWA = s.sumW * (nextHA / s.sumPx);
    const nextWB = s.sumW - nextWA;
    s.aEl.style.flexGrow = String(nextWA);
    s.bEl.style.flexGrow = String(nextWB);
    s.lastA = nextWA;
    s.lastB = nextWB;
  };
  const onUp = (e: RPE): void => {
    const s = st.current;
    st.current = null;
    document.documentElement.classList.remove("resizing", "resizing-rows");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (s) onResize(above.id, below.id, s.lastA, s.lastB);
  };

  return (
    <div
      className="panelSplitter"
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}

/** Vertical handle on a rail's inner edge. Resizes the rail's .main grid track
 *  live by writing grid-template-columns (via previewRail) during the drag, and
 *  commits the final width to layout on release. */
function RailWidthHandle({
  side,
  width,
  onPreview,
  onCommit,
}: {
  side: Side;
  width: number;
  onPreview: (side: Side, px: number) => void;
  onCommit: (side: Side, px: number) => void;
}) {
  const st = useRef<{ x: number; w: number; last: number } | null>(null);

  const onDown = (e: RPE): void => {
    if (e.button !== 0) return;
    st.current = { x: e.clientX, w: width, last: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.classList.add("resizing", "resizing-cols");
  };
  const onMove = (e: RPE): void => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    // Inner-edge handles: the left rail grows as you drag right, the right rail as you drag left.
    const next = clamp(side === "left" ? s.w + dx : s.w - dx, RAIL_MIN, RAIL_MAX);
    s.last = next;
    onPreview(side, next);
  };
  const onUp = (e: RPE): void => {
    const s = st.current;
    st.current = null;
    document.documentElement.classList.remove("resizing", "resizing-cols");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (s) onCommit(side, s.last);
  };

  return (
    <div
      className={"railWidthHandle railWidthHandle-" + side}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}

function Transcript({ state, hostMode }: { state: HandyState; hostMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.transcript.length]);
  return (
      <div className="panel-b trans" ref={ref}>
        {state.transcript.length === 0 && <div className="empty">Waiting for the meeting…</div>}
        {state.transcript.map((l) => {
          // Router decisions are operator insight — keep them out of the participants' read.
          if (l.kind === "router" && l.router) {
            if (!hostMode) return null;
            return (
              <div key={l.id} className="line router">
                <b>&rarr; router</b>&nbsp; prototype{" "}
                <span className={l.router.proto ? "y" : "n"}>{l.router.proto ? "fire" : "skip"}</span> &middot; summary{" "}
                <span className={l.router.summary ? "y" : "n"}>{l.router.summary ? "update" : "skip"}</span> &middot; factcheck{" "}
                <span className={l.router.fact ? "y" : "n"}>{l.router.fact ? "fire" : "skip"}</span>
                {l.router.screen ? (
                  <>
                    {" "}
                    &middot; <span className="y">+screenshot</span>
                  </>
                ) : null}
              </div>
            );
          }
          return (
            <div key={l.id} className={"line" + (l.kind === "partial" ? " partial" : "")}>
              <span className="sp">{l.speaker ?? "…"}</span>
              <span className="utterance">{l.text}</span>
            </div>
          );
        })}
      </div>
  );
}

function Summary({ state }: { state: HandyState }) {
  const s = state.summary;
  return (
    <>
      <div className="panel-h">
        Rolling summary
      </div>
      <div className="panel-b">
        <div className="sum-tldr">
          <span className="k">Summary</span>
          {s?.tldr ?? "Listening…"}
        </div>
        <Sec cls="" title="Decisions" items={s?.decisions ?? []} render={(d) => d} />
        <Sec
          cls="act"
          title="Action items"
          items={s?.action_items ?? []}
          render={(a) => (
            <>
              <span className="owner">{a.owner}</span>
              {a.task}
            </>
          )}
        />
        <Sec cls="open" title="Open questions" items={s?.open_questions ?? []} render={(q) => q} />
      </div>
    </>
  );
}

function Sec<T>({
  cls,
  title,
  items,
  render,
}: {
  cls: string;
  title: string;
  items: T[];
  render: (x: T) => ReactNode;
}) {
  return (
    <div className={"sum-sec " + cls}>
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((it, i) => (
            <li key={i}>{render(it)}</li>
          ))}
        </ul>
      ) : (
        <div className="empty">—</div>
      )}
    </div>
  );
}

function FactCheck({ state }: { state: HandyState }) {
  return (
    <>
      <div className="panel-h factcheck-h">Fact &amp; safety</div>
      <div className="panel-b factcheck-b">
        {state.factchecks.length === 0 && state.impacts.length === 0 && <div className="empty">No claims or changes checked yet.</div>}
        {state.impacts.map((impact, i) => (
          <div className="impact" key={`${impact.change}-${i}`}>
            <div className="claim">&ldquo;{impact.change}&rdquo;</div>
            <div className="row">
              <span className={"impactVerdict " + impact.verdict}>
                {impact.verdict === "known-impact" ? "review impact" : impact.verdict === "low-known-impact" ? "low known impact" : "unavailable"}
              </span>
              {impact.affected.length ? <span className="conf">{impact.affected.length} downstream</span> : null}
            </div>
            <div className="note">{impact.note}</div>
          </div>
        ))}
        {state.factchecks.map((f, i) => (
          <div className="fc" key={i}>
            <div className="claim">&ldquo;{f.claim}&rdquo;</div>
            <div className="row">
              <span className={"verdict v-" + f.verdict}>{f.verdict}</span>
              <span className="conf">confidence {f.confidence}</span>
              <span className="src">&#128279; {f.source}</span>
            </div>
            {f.note && <div className="note">{f.note}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
