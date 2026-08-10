import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function BottomDock({ children, hostMode }: { children: ReactNode; hostMode: boolean }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={"bottomDock" + (hostMode ? " host" : "") + (collapsed ? " collapsed" : "")}>
      {hostMode ? (
        <div className="hostDockHead">
          <span className="hostDockTitle">Host controls</span>
          <span className="hostDockHint">Agent controls</span>
          <button
            type="button"
            className="hostDockToggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-controls="host-dock-content"
          >
            {collapsed ? "Expand" : "Collapse"}
            {collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
        </div>
      ) : null}
      <div id={hostMode ? "host-dock-content" : undefined} className="bottomDockInner" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
