import type { SidebarState } from "../ws";

export function Hud({ state }: { state: SidebarState }) {
  const lat = state.latencyMs != null ? (state.latencyMs / 1000).toFixed(2) + "s" : "0.00s";
  return (
    <div className="hud">
      <div className="lat-label">idea &rarr; artifact</div>
      <div className="lat-num">{lat}</div>
      <div>
        <div className="lat-sub">
          Cerebras &middot; <b>~1900 tok/s</b>
        </div>
        <div className={"lat-state" + (state.latencyMs ? " ok" : "")}>
          {state.running ? (state.latencyMs ? "✓ rendered live" : "generating…") : "standby"}
        </div>
      </div>
    </div>
  );
}
