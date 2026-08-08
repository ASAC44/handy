import type { ServerWebSocket } from "bun";
import {
  decodeClient,
  encode,
  THEMES,
  type ClientEvent,
  type ServerEvent,
  type ThemeKey,
  type ThemeTokens,
} from "@sidebar/shared";
import { Orchestrator } from "./orchestrator";
import type { MeetingRuntime } from "./runtime";
import type { WsData } from "./session";

export class Room implements MeetingRuntime {
  learned: ThemeTokens | null = null;
  abMode = false;
  latestScreenDataUri: string | null = null;

  private clients = new Set<ServerWebSocket<WsData>>();
  private history: ServerEvent[] = [];
  private picks = new Map<string, (k: ThemeKey) => void>();
  private orch = new Orchestrator(this);
  private screenOn = false;
  private speechOn = false;
  private host = "Host";
  private lastFrameTs: number | undefined;

  open(ws: ServerWebSocket<WsData>): void {
    this.clients.add(ws);
    for (const ev of this.history) ws.send(encode(ev));
    if (this.history.length === 0 && this.learned) ws.send(encode({ type: "dna.update", theme: this.learned }));
    if (this.screenOn || this.speechOn) this.sendStatus(ws);
  }

  close(ws: ServerWebSocket<WsData>): void {
    this.clients.delete(ws);
  }

  receive(raw: string): void {
    let ev: ClientEvent;
    try {
      ev = decodeClient(raw);
    } catch {
      return;
    }
    this.onEvent(ev);
  }

  send(ev: ServerEvent): void {
    if (ev.type === "meeting.start") {
      this.history = [];
      this.picks.clear();
    }
    this.history.push(ev);
    for (const ws of this.clients) ws.send(encode(ev));
  }

  awaitPick(buildId: string): Promise<ThemeKey> {
    return new Promise((res) => this.picks.set(buildId, res));
  }

  resolvePick(buildId: string, themeKey: ThemeKey): void {
    const r = this.picks.get(buildId);
    if (r) {
      this.picks.delete(buildId);
      r(themeKey);
    }
  }

  learn(themeKey: ThemeKey): void {
    this.learned = THEMES[themeKey];
    this.send({ type: "dna.update", theme: this.learned });
  }

  stop(): void {
    this.orch.stop();
  }

  private onEvent(ev: ClientEvent): void {
    switch (ev.type) {
      case "start":
        void this.orch.start(ev.scenarioId);
        break;
      case "live.start":
        this.host = ev.host?.trim() || "Host";
        this.orch.startLive(ev.title?.trim() || "Live Meeting", this.host);
        break;
      case "live.stop":
        this.orch.stop();
        this.send({ type: "meeting.end", artifacts: 0 });
        break;
      case "transcript.partial":
        this.orch.ingestPartial(ev.text, ev.speaker);
        break;
      case "transcript.final":
        this.orch.ingestFinal(ev.text, ev.speaker);
        break;
      case "screen.frame":
        this.latestScreenDataUri = ev.dataUri;
        this.screenOn = true;
        this.lastFrameTs = ev.ts;
        this.send({
          type: "capture.status",
          screen: this.screenOn,
          speech: this.speechOn,
          lastFrameTs: this.lastFrameTs,
          host: this.host,
        });
        break;
      case "capture.status":
        this.screenOn = ev.screen;
        this.speechOn = ev.speech;
        this.host = ev.host?.trim() || this.host;
        if (!ev.screen) {
          this.latestScreenDataUri = null;
          this.lastFrameTs = undefined;
        }
        this.send({
          type: "capture.status",
          screen: this.screenOn,
          speech: this.speechOn,
          lastFrameTs: this.lastFrameTs,
          host: this.host,
        });
        break;
      case "pick":
        this.resolvePick(ev.buildId, ev.themeKey);
        break;
      case "resetTaste":
        this.learned = null;
        this.send({ type: "dna.update", theme: null });
        break;
      case "setAbMode":
        this.abMode = ev.enabled;
        this.send({ type: "mode.changed", baseline: ev.enabled ? "gpu" : "cerebras" });
        break;
    }
  }

  private sendStatus(ws: ServerWebSocket<WsData>): void {
    ws.send(
      encode({
        type: "capture.status",
        screen: this.screenOn,
        speech: this.speechOn,
        lastFrameTs: this.lastFrameTs,
        host: this.host,
      }),
    );
  }
}

export const room = new Room();
