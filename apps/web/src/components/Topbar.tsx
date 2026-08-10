import type { ClientEvent } from "@handy/shared";
import type { Capture } from "../useCapture";
import type { HandyState } from "../ws";
import { Logo } from "./Logo";
import { CaptureDock } from "./CaptureDock";
import { Settings } from "./Settings";
import { RoomPresence } from "./RoomPresence";
import { Badge } from "./ui/badge";

type TopbarProps = {
  hostMode: boolean;
  state: HandyState;
  send: (event: ClientEvent) => void;
  setAbMode: (enabled: boolean) => void;
  onLeave: () => void;
  capture: Pick<Capture, "speechOn" | "mode" | "talking">;
};

/** Flat meeting masthead composed from shared shadcn controls. */
export function Topbar({ hostMode, state, send, setAbMode, onLeave, capture }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">
          <Logo />
        </span>
        Handy
      </div>
      <RoomPresence state={state} send={send} hostMode={hostMode} />
      {hostMode ? <CaptureDock hostMode state={state} send={send} onLeave={onLeave} /> : null}
      <div className="spacer" />
      {capture.speechOn ? (
        <Badge variant="outline" className="live">
          <i /> {capture.mode === "ptt" ? (capture.talking ? "Talking" : "Push to talk") : "Recording"}
        </Badge>
      ) : null}
      {!hostMode ? <CaptureDock hostMode={false} state={state} send={send} onLeave={onLeave} /> : null}
      <Settings state={state} send={send} setAbMode={setAbMode} hostMode={hostMode} />
    </header>
  );
}
