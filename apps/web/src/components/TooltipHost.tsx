import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One global, themed tooltip for the whole app. Mount once near the root.
 *
 * Any element carrying a `data-tip="…"` attribute gets a hovered/focused tooltip —
 * positioned with JS so it flips above/below depending on where the anchor sits and
 * clamps to the viewport (a CSS-only pseudo-element tooltip would clip off the edges
 * of the masthead/footer). Replaces native `title=` so the bubble matches the app's
 * look. Icon-only triggers keep an `aria-label` for screen readers.
 */
interface TipState {
  text: string;
  cx: number; // anchor centre x (viewport coords)
  y: number; // anchor edge y the bubble hangs from
  place: "top" | "bottom";
}

/** True only for keyboard focus. Wrapped because older engines throw on the selector. */
function safeFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

export function TooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const show = (el: Element): void => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      const r = el.getBoundingClientRect();
      const place: "top" | "bottom" = r.top > window.innerHeight * 0.6 ? "top" : "bottom";
      current.current = el;
      setTip({ text, cx: r.left + r.width / 2, y: place === "bottom" ? r.bottom + 8 : r.top - 8, place });
    };
    const clear = (): void => {
      current.current = null;
      setTip(null);
    };
    const onOver = (e: Event): void => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (el && el !== current.current) show(el);
    };
    // Keyboard focus only. A pointer click also focuses the trigger, but we don't want a
    // tooltip lingering after a click — e.g. a dropdown whose data-tip disappears when it
    // opens would otherwise leave the bubble stuck on screen.
    const onFocusIn = (e: Event): void => {
      const el = (e.target as Element)?.closest?.("[data-tip]");
      if (el && el !== current.current && safeFocusVisible(el)) show(el);
    };
    // Hide when pointer/focus leaves the *tracked* anchor — keyed off the element we're
    // showing, not off `[data-tip]`, which an open dropdown may have already removed.
    const onLeave = (e: Event): void => {
      const cur = current.current;
      if (!cur) return;
      const target = e.target as Node | null;
      if (target !== cur && !cur.contains(target)) return;
      const to = (e as PointerEvent | FocusEvent).relatedTarget as Node | null;
      if (to && cur.contains(to)) return; // moved within the same anchor
      clear();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onLeave);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onLeave);
    document.addEventListener("pointerdown", clear); // dismiss on mouse activation
    document.addEventListener("click", clear); // …and on keyboard activation (Enter/Space)
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onLeave);
      document.removeEventListener("pointerdown", clear);
      document.removeEventListener("click", clear);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);

  // Centre on the anchor, then clamp so the bubble never spills off-screen.
  useLayoutEffect(() => {
    if (!tip || !outerRef.current || !innerRef.current) return;
    const half = innerRef.current.offsetWidth / 2;
    const left = Math.min(Math.max(tip.cx, 8 + half), window.innerWidth - 8 - half);
    outerRef.current.style.left = `${left}px`;
    outerRef.current.style.top = `${tip.y}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={outerRef} className={"tip tip-" + tip.place} style={{ left: tip.cx, top: tip.y }} aria-hidden="true">
      <div ref={innerRef} className="tip-inner">
        {tip.text}
      </div>
    </div>
  );
}
