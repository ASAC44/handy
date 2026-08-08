import { useSidebar } from "./ws";
import { Rail } from "./components/Rail";
import { Hud } from "./components/Hud";
import { Canvas } from "./components/Canvas";
import { Bottom } from "./components/Bottom";

export function App() {
  const { state, send, setAbMode } = useSidebar();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">&#9624;</span> Sidebar <span className="bsub">ambient meeting copilot</span>
        </div>
        <span className="ambient">&#9889; transcript-driven &middot; learns your taste</span>
        <span className={"conn " + (state.connected ? "on" : "off")}>
          {state.connected ? "● connected" : "○ offline"}
        </span>
        <div className="spacer" />
        <div className="status">
          <span className="live">
            <i /> REC
          </span>
        </div>
        <div className="model">{state.title}</div>
        <div className="model">gemma-4-31b</div>
      </header>
      <main className="main">
        <Rail state={state} />
        <section className="canvasCol">
          <Hud state={state} />
          <Canvas state={state} send={send} />
        </section>
      </main>
      <Bottom state={state} send={send} setAbMode={setAbMode} />
    </div>
  );
}
