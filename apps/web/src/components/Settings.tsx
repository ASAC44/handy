import { useEffect, useRef, useState } from "react";
import type { ClientEvent, AgentName } from "@sidebar/shared";
import type { SidebarState } from "../ws";
import { ThemeToggle } from "./ThemeToggle";

const AGENTS: AgentName[] = ["router", "summarizer", "prototype", "factcheck"];

/** Gear in the masthead → a small settings popover. Houses the low-frequency controls
 *  that used to clutter the top bar (theme) and footer (A/B race), plus a discoverable
 *  home for the per-agent on/off toggles that were hidden inside the footer chips.
 *  Theme is offered to everyone; the host-only controls are gated behind `hostMode`. */
export function Settings({
  state,
  send,
  setAbMode,
  hostMode,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
  setAbMode: (v: boolean) => void;
  hostMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleAb = (): void => {
    const v = !state.abMode;
    setAbMode(v);
    send({ type: "setAbMode", enabled: v });
  };

  return (
    <div className="settings" ref={ref}>
      <button
        className={"capBtn settingsBtn" + (open ? " on" : "")}
        onClick={() => setOpen((o) => !o)}
        data-tip="Settings"
        aria-label="Settings"
        aria-expanded={open}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings-icon lucide-settings" style={{ display: "block", margin: "auto" }}><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      {open ? (
        <div className="settingsPanel" role="dialog" aria-label="Settings">
          <div className="setRow">
            <span className="setK">Theme</span>
            <ThemeToggle />
          </div>

          {hostMode ? (
            <>
              <button className="setRow setToggle" onClick={toggleAb} aria-pressed={state.abMode} data-tip="Race Cerebras against a GPU baseline">
                <span className="setK">A/B race</span>
                <span className="setRight">
                  <span className="setVal">{state.abMode ? "GPU baseline" : "Cerebras only"}</span>
                  <span className={"switch" + (state.abMode ? " on" : "")}>
                    <i />
                  </span>
                </span>
              </button>

              <div className="setSec">
                <div className="setSecH">Agents</div>
                {AGENTS.map((ag) => {
                  const on = state.agents[ag];
                  return (
                    <button
                      key={ag}
                      type="button"
                      className="setRow setToggle"
                      onClick={() => send({ type: "setAgent", agent: ag, enabled: !on })}
                      aria-pressed={on}
                      data-tip={`${ag}: ${on ? "on — click to disable" : "off — click to enable"}`}
                    >
                      <span className="setK">
                        <span className={"adot " + ag} /> {ag}
                      </span>
                      <span className={"switch pos" + (on ? " on" : "")}>
                        <i />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
