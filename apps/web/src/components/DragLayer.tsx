import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { PanelId, Side } from "../useLayout";

/** The floating drag overlay for docking panels. It owns all per-pointer-move
 *  state (ghost position + computed drop target) so that dragging re-renders
 *  ONLY this component — never the Meeting tree, the rails, or the canvas.
 *  PanelFrame drives it imperatively through a ref (begin/update/end/cancel). */

interface Ghost {
  title: string;
  x: number;
  y: number;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface DropTarget {
  side: Side;
  beforeId: PanelId | null; // insert before this panel on `side`, or append if null
  line: { top: number; left: number; width: number } | null; // insertion indicator
  rail: Rect | null; // target rail outline
}

export interface DragLayerHandle {
  begin: (id: PanelId, title: string, x: number, y: number) => void;
  update: (x: number, y: number) => void;
  end: () => void;
  cancel: () => void;
}

/** Hit-test the pointer against the live rail DOM: which side, and where in it. */
function hitTest(x: number, y: number, dragId: PanelId): DropTarget {
  const mainEl = document.querySelector(".main");
  let side: Side = "left";
  if (mainEl) {
    const r = mainEl.getBoundingClientRect();
    side = x < r.left + r.width / 2 ? "left" : "right";
  }
  const railEl = document.querySelector(".rail-" + side) as HTMLElement | null;
  if (!railEl) return { side, beforeId: null, line: null, rail: null };
  const rr = railEl.getBoundingClientRect();
  const rail: Rect = { top: rr.top, left: rr.left, width: rr.width, height: rr.height };
  const left = rr.left + 1;
  const width = rr.width - 2;
  // Exclude the panel being dragged — it still renders (dimmed) in its origin slot.
  const panels = Array.from(railEl.querySelectorAll<HTMLElement>(".panel")).filter(
    (el) => el.dataset.panelId && el.dataset.panelId !== dragId,
  );
  for (const el of panels) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      return { side, beforeId: el.dataset.panelId as PanelId, line: { top: r.top - 6, left, width }, rail };
    }
  }
  // Below every panel → append. Empty rail → no line (the rail shows a "drop here" zone).
  const last = panels[panels.length - 1];
  const line = last ? { top: last.getBoundingClientRect().bottom + 4, left, width } : null;
  return { side, beforeId: null, line, rail };
}

export const DragLayer = forwardRef<
  DragLayerHandle,
  {
    movePanel: (id: PanelId, side: Side, beforeId: PanelId | null) => void;
    onDraggingChange: (v: boolean) => void;
  }
>(function DragLayer({ movePanel, onDraggingChange }, ref) {
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const idRef = useRef<PanelId | null>(null);
  const dropRef = useRef<DropTarget | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      begin(id, title, x, y) {
        idRef.current = id;
        const dt = hitTest(x, y, id);
        dropRef.current = dt;
        setGhost({ title, x, y });
        setDrop(dt);
        onDraggingChange(true);
      },
      update(x, y) {
        const id = idRef.current;
        if (!id) return;
        const dt = hitTest(x, y, id);
        dropRef.current = dt;
        setGhost((g) => (g ? { ...g, x, y } : { title: "", x, y }));
        setDrop(dt);
      },
      end() {
        const id = idRef.current;
        const dt = dropRef.current;
        if (id && dt) movePanel(id, dt.side, dt.beforeId);
        idRef.current = null;
        dropRef.current = null;
        setGhost(null);
        setDrop(null);
        onDraggingChange(false);
      },
      cancel() {
        idRef.current = null;
        dropRef.current = null;
        setGhost(null);
        setDrop(null);
        onDraggingChange(false);
      },
    }),
    [movePanel, onDraggingChange],
  );

  if (!ghost) return null;
  return (
    <>
      {drop?.rail && (
        <div
          className="dropZoneHi"
          style={{ top: drop.rail.top, left: drop.rail.left, width: drop.rail.width, height: drop.rail.height }}
        />
      )}
      {drop?.line && <div className="dropIndicator" style={{ top: drop.line.top, left: drop.line.left, width: drop.line.width }} />}
      <div className="dragGhost" style={{ transform: `translate(${ghost.x + 14}px, ${ghost.y + 14}px)` }}>
        {ghost.title}
      </div>
    </>
  );
});
