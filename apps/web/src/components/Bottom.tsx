import type { SidebarState } from "../ws";
import type { ClientEvent, AgentName } from "@sidebar/shared";

const AGENTS: AgentName[] = ["router", "summarizer", "prototype", "factcheck"];

export function Bottom({
  state,
  send,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
}) {
  return (
    <footer className="bottom">
      <Metrics state={state} />

      <div className="agents">
        {AGENTS.map((ag) => {
          const t = state.telemetry[ag];
          const on = state.agents[ag];
          return (
            <button
              type="button"
              className={"achip " + ag + (on ? "" : " off")}
              key={ag}
              onClick={() => send({ type: "setAgent", agent: ag, enabled: !on })}
              data-tip={`${ag}: ${on ? "on — click to disable" : "off — click to enable"}`}
            >
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
            </button>
          );
        })}
      </div>

      <div className="controls">
        <button className="btn" onClick={() => send({ type: "start", scenarioId: state.scenarioId })}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48"><path d="M0 0h48v48H0z" fill="none" /><g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4"><path fill="currentColor" d="M21 24v-6l5 3l5 3l-5 3l-5 3z" /><path strokeLinecap="round" d="M11.272 36.728A17.94 17.94 0 0 0 24 42c9.941 0 18-8.059 18-18S33.941 6 24 6c-4.97 0-9.47 2.015-12.728 5.272C9.614 12.93 6 17 6 17" /><path strokeLinecap="round" d="M6 9v8h8" /></g></svg>
          Replay
        </button>
      </div>
    </footer>
  );
}

/** The "idea → artifact" hero metric, relocated from the old top HUD into the footer:
 *  build latency + live throughput + state, compact. */
function Metrics({ state }: { state: SidebarState }) {
  const lat = state.latencyMs != null ? (state.latencyMs / 1000).toFixed(2) + "s" : "0.00s";
  const tps = protoTokPerS(state);
  return (
    <div className="foot-metric">
      <div className="fm-label">idea &rarr; artifact</div>
      <div className="fm-line">
        <b className="fm-num">{lat}</b>
        <span className="fm-sep">&middot;</span>
        <span className="fm-tps">Cerebras · {tps != null ? tps.toLocaleString() + " tok/s" : "— tok/s"}</span>
        <span className={"fm-state" + (state.latencyMs ? " ok" : "")}>
          {state.running ? (state.latencyMs ? "✓ live" : "generating…") : "standby"}
        </span>
      </div>
    </div>
  );
}

/** Real throughput of the prototype agent — the one that produces the artifact whose
 *  latency we headline — falling back to the fastest agent we've heard from. */
function protoTokPerS(state: SidebarState): number | null {
  const proto = state.telemetry.prototype?.tokPerS;
  if (proto != null && proto > 0) return Math.round(proto);
  const all = Object.values(state.telemetry)
    .map((t) => t?.tokPerS ?? 0)
    .filter((n) => n > 0);
  return all.length ? Math.round(Math.max(...all)) : null;
}
