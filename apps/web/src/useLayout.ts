import { useCallback, useEffect, useMemo, useState } from "react";

/** UI-only layout preferences for the meeting rails — which side each panel is
 *  docked on, its order within that rail, its relative height, and each rail's
 *  width. Persisted to localStorage like the other `sidebar.*` prefs
 *  (see ThemeToggle.tsx); deliberately NOT in the ws.ts reducer, which is
 *  driven purely by server events. */

export type PanelId = "transcript" | "summary" | "factcheck";
export type Side = "left" | "right";

export interface PanelLayout {
  id: PanelId;
  side: Side;
  /** Relative height within the rail — used directly as flex-grow. */
  weight: number;
}

export interface LayoutState {
  v: 3; // schema version → validate/migrate hook (bump to reset stale saved layouts)
  /** Flat, ordered list; a rail's render order is `order.filter(side)`. */
  order: PanelLayout[];
  /** Independent px width per rail (applied to the .main grid track). */
  railWidth: Record<Side, number>;
}

const KEY = "sidebar.layout";
const KNOWN: PanelId[] = ["transcript", "summary", "factcheck"];

export const RAIL_MIN = 240;
export const RAIL_MAX = 560; // conservative vs .app { min-width:1120px }
export const PANEL_MIN_PX = 120; // smallest a panel can be dragged to
const WEIGHT_MIN = 0.25;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Default: transcript + fact-check stacked on the left, rolling summary on its
 *  own right rail. Both rails 300px; left keeps the 1.8 / 0.7 transcript-heavy ratio. */
const DEFAULT: LayoutState = {
  v: 3,
  order: [
    { id: "transcript", side: "left", weight: 1.8 },
    { id: "factcheck", side: "left", weight: 0.7 },
    { id: "summary", side: "right", weight: 1.0 },
  ],
  railWidth: { left: 300, right: 300 },
};

function validate(x: unknown): x is LayoutState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 3 || !Array.isArray(o.order)) return false;
  const rw = o.railWidth as Record<string, unknown> | undefined;
  if (!rw || !Number.isFinite(rw.left) || !Number.isFinite(rw.right)) return false;
  const ids = new Set<string>();
  for (const p of o.order) {
    if (!p || typeof p !== "object") return false;
    const e = p as Record<string, unknown>;
    if (typeof e.id !== "string" || !KNOWN.includes(e.id as PanelId)) return false;
    if (e.side !== "left" && e.side !== "right") return false;
    if (!Number.isFinite(e.weight)) return false;
    ids.add(e.id);
  }
  // The id set must be exactly the three known panels — no missing/dup/unknown.
  // Any drift (e.g. a renamed/added panel) intentionally resets to DEFAULT.
  return ids.size === KNOWN.length && o.order.length === KNOWN.length;
}

function normalize(x: LayoutState): LayoutState {
  return {
    v: 3,
    order: x.order.map((p) => ({ ...p, weight: Math.max(WEIGHT_MIN, p.weight) })),
    railWidth: {
      left: clamp(x.railWidth.left, RAIL_MIN, RAIL_MAX),
      right: clamp(x.railWidth.right, RAIL_MIN, RAIL_MAX),
    },
  };
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return validate(parsed) ? normalize(parsed) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function saveLayout(l: LayoutState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // ignore quota / private-mode failures — layout is best-effort
  }
}

export interface LayoutApi {
  leftPanels: PanelLayout[];
  rightPanels: PanelLayout[];
  railWidth: Record<Side, number>;
  /** Move `id` to `toSide`, inserting before `beforeId` on that side
   *  (null → append). Handles both cross-rail docking and in-rail reorder. */
  movePanel: (id: PanelId, toSide: Side, beforeId: PanelId | null) => void;
  /** Set two adjacent panels' height weights at once (from a splitter drag). */
  resizePanels: (aId: PanelId, bId: PanelId, aWeight: number, bWeight: number) => void;
  /** Set a rail's width in px (clamped). */
  resizeRail: (side: Side, px: number) => void;
  resetLayout: () => void;
}

export function useLayout(): LayoutApi {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);

  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const leftPanels = useMemo(() => layout.order.filter((p) => p.side === "left"), [layout]);
  const rightPanels = useMemo(() => layout.order.filter((p) => p.side === "right"), [layout]);

  const movePanel = useCallback((id: PanelId, toSide: Side, beforeId: PanelId | null) => {
    setLayout((l) => {
      const moving = l.order.find((p) => p.id === id);
      if (!moving) return l;
      const rest = l.order.filter((p) => p.id !== id);
      const updated: PanelLayout = { ...moving, side: toSide };
      let idx = rest.length; // default: append to the end of that side's block
      if (beforeId && beforeId !== id) {
        const i = rest.findIndex((p) => p.id === beforeId && p.side === toSide);
        if (i >= 0) idx = i;
      }
      return { ...l, order: [...rest.slice(0, idx), updated, ...rest.slice(idx)] };
    });
  }, []);

  const resizePanels = useCallback((aId: PanelId, bId: PanelId, aWeight: number, bWeight: number) => {
    setLayout((l) => ({
      ...l,
      order: l.order.map((p) =>
        p.id === aId
          ? { ...p, weight: Math.max(WEIGHT_MIN, aWeight) }
          : p.id === bId
            ? { ...p, weight: Math.max(WEIGHT_MIN, bWeight) }
            : p,
      ),
    }));
  }, []);

  const resizeRail = useCallback((side: Side, px: number) => {
    setLayout((l) => {
      const w = clamp(px, RAIL_MIN, RAIL_MAX);
      if (l.railWidth[side] === w) return l;
      return { ...l, railWidth: { ...l.railWidth, [side]: w } };
    });
  }, []);

  const resetLayout = useCallback(() => setLayout(DEFAULT), []);

  return { leftPanels, rightPanels, railWidth: layout.railWidth, movePanel, resizePanels, resizeRail, resetLayout };
}
