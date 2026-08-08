import type { ServerWebSocket } from "bun";
import {
  encode,
  decodeClient,
  THEMES,
  type ServerEvent,
  type ThemeKey,
  type ThemeTokens,
} from "@sidebar/shared";
import { Orchestrator } from "./orchestrator";

export interface WsData {
  session: Session | null;
}

/** One in-memory session per WebSocket connection (no DB, spec section 8). */
export class Session {
  learned: ThemeTokens | null = null;
  abMode = false;
  private orch: Orchestrator;
  private picks = new Map<string, (k: ThemeKey) => void>();

  constructor(private ws: ServerWebSocket<WsData>) {
    this.orch = new Orchestrator(this);
  }

  send(ev: ServerEvent): void {
    this.ws.send(encode(ev));
  }

  onMessage(raw: string): void {
    let ev;
    try {
      ev = decodeClient(raw);
    } catch {
      return;
    }
    switch (ev.type) {
      case "start":
        void this.orch.start(ev.scenarioId);
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

  /** Pending fan-out picks, keyed by buildId. */
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

  /** Learn a design language and broadcast the new Design DNA. */
  learn(themeKey: ThemeKey): void {
    this.learned = THEMES[themeKey];
    this.send({ type: "dna.update", theme: this.learned });
  }

  dispose(): void {
    this.orch.stop();
  }
}
