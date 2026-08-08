import type { SidebarState } from "../ws";
import type { ClientEvent, AgentName } from "@sidebar/shared";

const SCENARIOS = [
  { id: "sprint-planning", title: "Q3 Sprint Planning", sub: "kanban" },
  { id: "growth-review", title: "Growth Review", sub: "dashboard" },
  { id: "launch-page", title: "Launch Page Jam", sub: "landing" },
];
const AGENTS: AgentName[] = ["router", "summarizer", "prototype"];

export function Bottom({
  state,
  send,
  setAbMode,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
  setAbMode: (v: boolean) => void;
}) {
  const toggleAb = (): void => {
    const v = !state.abMode;
    setAbMode(v);
    send({ type: "setAbMode", enabled: v });
  };
  return (
    <footer className="bottom">
      <div className="scenarios">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            className={"pill" + (state.scenarioId === sc.id ? " active" : "")}
            onClick={() => send({ type: "start", scenarioId: sc.id })}
          >
            {sc.title}
            <small style={{ display: "block", fontSize: 9, color: "var(--dim)" }}>{sc.sub}</small>
          </button>
        ))}
      </div>

      <div className="agents">
        {AGENTS.map((ag) => {
          const t = state.telemetry[ag];
          return (
            <div className={"achip " + ag} key={ag}>
              <div className="top">
                <span className="dot" />
                <span className="nm">{ag}</span>
                <span className="tps">
                  {t ? t.tokPerS.toLocaleString() : 0}
                  <small> tok/s</small>
                </span>
              </div>
              <div className="bar">
                <i style={{ width: Math.min(100, (t?.tokPerS ?? 0) / 19) + "%" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="controls">
        <button className="btn" onClick={() => send({ type: "start", scenarioId: state.scenarioId })}>
          &#9654; Replay
        </button>
      </div>

      <div className="controls">
        <label className="abtoggle" onClick={toggleAb}>
          <span className={"switch" + (state.abMode ? " on" : "")}>
            <i />
          </span>{" "}
          A/B race
        </label>
      </div>
    </footer>
  );
}
