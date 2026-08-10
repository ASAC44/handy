import { useState, type FormEvent } from "react";
import type { ClientEvent, AgentName } from "@handy/shared";
import { Pencil } from "lucide-react";
import { SCENARIOS } from "../scenarios";
import type { HandyState } from "../ws";
import { CustomSelect } from "./CustomSelect";
import { ThemeToggle } from "./ThemeToggle";
import { Button, buttonVariants } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const AGENTS: AgentName[] = ["router", "summarizer", "prototype", "factcheck", "nextstep"];

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
  state: HandyState;
  send: (e: ClientEvent) => void;
  setAbMode: (v: boolean) => void;
  hostMode: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");

  const toggleAb = (): void => {
    const v = !state.abMode;
    setAbMode(v);
    send({ type: "setAbMode", enabled: v });
  };

  const currentName = state.presence.find((participant) => participant.id === state.selfId)?.name ?? "";

  const openNameDialog = (): void => {
    setName(currentName.startsWith("Viewer ") || currentName.startsWith("Guest ") ? "" : currentName);
    setSettingsOpen(false);
    setNameOpen(true);
  };

  const saveName = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    localStorage.setItem("handy.viewer", clean);
    send({ type: "presence.hello", name: clean, role: "viewer" });
    setNameOpen(false);
  };

  return (
    <>
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <div className="settings">
          <PopoverTrigger
            className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "settingsBtn" })}
            data-tip={`Settings · ${state.connected ? "connected" : "offline"}`}
            aria-label={`Settings — ${state.connected ? "connected" : "offline"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings-icon lucide-settings" style={{ display: "block", margin: "auto" }}><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>
            <span className={"settingsConn " + (state.connected ? "on" : "off")} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="settingsPanel" aria-label="Settings">
            {!hostMode ? (
              <Button variant="ghost" className="setRow setToggle" onClick={openNameDialog}>
                <span className="setK">Change name</span>
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}

            <div className="setRow">
              <span className="setK">Theme</span>
              <ThemeToggle />
            </div>

            {hostMode ? (
              <>
                <div className="setSec">
                  <div className="setSecH">Demo meeting</div>
                  <CustomSelect
                    className="scenarioSelect"
                    value={state.scenarioId ?? ""}
                    onChange={(scenarioId) => {
                      send({ type: "start", scenarioId });
                      setSettingsOpen(false);
                    }}
                    ariaLabel="Demo meeting"
                    title="Switch demo meeting"
                    placeholder="Pick a demo…"
                    options={SCENARIOS.map((scenario) => ({ value: scenario.id, label: scenario.title }))}
                  />
                </div>

                <Button variant="ghost" className="setRow setToggle" onClick={toggleAb} aria-pressed={state.abMode} data-tip="Compare Cerebras with the baseline model">
                  <span className="setK">Model comparison</span>
                  <span className="setRight">
                    <span className="setVal">{state.abMode ? "Baseline enabled" : "Cerebras only"}</span>
                    <span className={"switch" + (state.abMode ? " on" : "")}>
                      <i />
                    </span>
                  </span>
                </Button>

                <div className="setSec">
                  <div className="setSecH">Agents</div>
                  {AGENTS.map((ag) => {
                    const on = state.agents[ag];
                    return (
                      <Button
                        key={ag}
                        type="button"
                        variant="ghost"
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
                      </Button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </PopoverContent>
        </div>
      </Popover>

      {!hostMode ? (
        <Dialog open={nameOpen} onOpenChange={setNameOpen}>
          <DialogContent className="nameDialog">
            <form className="nameForm" onSubmit={saveName}>
              <DialogHeader>
                <DialogTitle>Change your name</DialogTitle>
                <DialogDescription>This is how you appear to everyone in the meeting.</DialogDescription>
              </DialogHeader>
              <div className="nameField">
                <Label htmlFor="viewer-name">Name</Label>
                <Input
                  id="viewer-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  autoFocus
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNameOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save name</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
