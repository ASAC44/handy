import { useSidebar } from "./ws";
import { Rail } from "./components/Rail";
import { Hud } from "./components/Hud";
import { Canvas } from "./components/Canvas";
import { Bottom } from "./components/Bottom";
import { CaptureDock } from "./components/CaptureDock";
import { ThemeToggle } from "./components/ThemeToggle";

export function App() {
  const { state, send, setAbMode } = useSidebar();
  const hostMode = new URLSearchParams(location.search).has("host");
  return (
    <div className={"app" + (hostMode ? "" : " viewer")}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">&#9624;</span> Sidebar <span className="bsub">ambient meeting copilot</span>
        </div>
        <span className={"conn " + (state.connected ? "on" : "off")}>
          {state.connected ? "● connected" : "○ offline"}
        </span>
        <CaptureDock hostMode={hostMode} state={state} send={send} />
        <div className="spacer" />
        {state.capture.speech ? (
          <div className="status">
            <span className="live">
              <i /> REC
            </span>
          </div>
        ) : null}
        <ThemeToggle />
        <div className="model">gemma-4-31b</div>
      </header>
      <main className="main">
        <Rail state={state} hostMode={hostMode} />
        <section className="canvasCol">
          <Hud state={state} send={send} hostMode={hostMode} />
          <Canvas state={state} send={send} hostMode={hostMode} />
        </section>
      </main>
      {hostMode ? <Bottom state={state} send={send} setAbMode={setAbMode} /> : null}
    </div>
  );
}
