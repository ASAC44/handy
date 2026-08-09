import type { ServerWebSocket } from "bun";
import {
  decodeClient,
  encode,
  THEMES,
  type AgentToggles,
  type ClientEvent,
  type CursorPing,
  type CursorPoint,
  type ParticipantPresence,
  type ServerEvent,
  type ThemeKey,
  type ThemeTokens,
} from "@sidebar/shared";
import { Orchestrator } from "./orchestrator";
import { ContextStore, ContextUploadError } from "./context";
import type { MeetingRuntime } from "./runtime";
import type { WsData } from "./session";

const PRESENCE_COLORS = ["#4dffd2", "#ff7a90", "#ffc857", "#5cc8ff", "#b39dff", "#5ce08a", "#ff9f43"];
const PRESENCE_NAMES = ["Host", "Priya", "Maya", "Dev", "Alex", "Jordan", "Sam", "Riley"];
const CONTEXT_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-sidebar-key",
};

export class Room implements MeetingRuntime {
  learned: ThemeTokens | null = null;
  abMode = false;
  agents: AgentToggles = { router: true, summarizer: true, prototype: true, factcheck: true };
  latestScreenDataUri: string | null = null;
  readonly context = new ContextStore();

  private clients = new Set<ServerWebSocket<WsData>>();
  private presence = new Map<ServerWebSocket<WsData>, ParticipantPresence>();
  private history: ServerEvent[] = [];
  private picks = new Map<string, (k: ThemeKey) => void>();
  private orch = new Orchestrator(this);
  private screenOn = false;
  private speechOn = false;
  private host = "Host";
  private lastFrameTs: number | undefined;
  private nextPresence = 1;

  get workspaceRoot(): string {
    return this.context.workspaceRoot;
  }

  contextSummary(): string {
    return this.context.summary();
  }

  open(ws: ServerWebSocket<WsData>): void {
    this.clients.add(ws);
    const participant = this.makeParticipant();
    this.presence.set(ws, participant);
    for (const ev of this.history) ws.send(encode(ev));
    if (this.history.length === 0 && this.learned) ws.send(encode({ type: "dna.update", theme: this.learned }));
    if (this.screenOn || this.speechOn) this.sendStatus(ws);
    ws.send(encode({ type: "presence.snapshot", selfId: participant.id, participants: this.participants() }));
    ws.send(encode({ type: "context.snapshot", context: this.context.snapshot() }));
    ws.send(encode({ type: "agents.changed", agents: this.agents }));
    this.broadcast({ type: "presence.join", participant }, ws);
  }

  close(ws: ServerWebSocket<WsData>): void {
    this.clients.delete(ws);
    const participant = this.presence.get(ws);
    this.presence.delete(ws);
    if (participant) this.broadcast({ type: "presence.leave", id: participant.id });
  }

  receive(raw: string, ws: ServerWebSocket<WsData>): void {
    let ev: ClientEvent;
    try {
      ev = decodeClient(raw);
    } catch {
      return;
    }
    this.onEvent(ev, ws);
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

  async uploadContext(req: Request): Promise<Response> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "Expected multipart form data" }, { status: 400, headers: CONTEXT_CORS });
    }
    try {
      const item = await this.context.upload(form);
      this.broadcast({ type: "context.item", item });
      return Response.json({ ok: true, item, workspaceRoot: this.context.workspaceRoot }, { headers: CONTEXT_CORS });
    } catch (err) {
      if (err instanceof ContextUploadError) return Response.json({ error: err.message }, { status: err.status, headers: CONTEXT_CORS });
      console.error("[context] upload failed", err);
      return Response.json({ error: "Context upload failed" }, { status: 500, headers: CONTEXT_CORS });
    }
  }

  contextOptions(): Response {
    return new Response(null, { status: 204, headers: CONTEXT_CORS });
  }

  private onEvent(ev: ClientEvent, ws: ServerWebSocket<WsData>): void {
    switch (ev.type) {
      case "presence.hello":
        this.updatePresence(ws, ev.name, ev.color, ev.role);
        break;
      case "presence.cursor":
        this.updateCursor(ws, ev.cursor);
        break;
      case "presence.ping":
        this.broadcastPing(ws, ev.ping);
        break;
      case "context.accept":
        if (this.isHost(ws)) void this.acceptContext(ev.id);
        break;
      case "context.reject":
        if (this.isHost(ws)) void this.rejectContext(ev.id);
        break;
      case "context.clear":
        if (this.isHost(ws)) void this.clearContext();
        break;
      case "host.kick":
        if (this.isHost(ws)) this.kick(ev.id, ws);
        break;
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
      case "setAgent":
        this.agents = { ...this.agents, [ev.agent]: ev.enabled };
        this.broadcast({ type: "agents.changed", agents: this.agents });
        break;
    }
  }

  private makeParticipant(): ParticipantPresence {
    const n = this.nextPresence++;
    return {
      id: `p${n.toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
      name: PRESENCE_NAMES[(n - 1) % PRESENCE_NAMES.length] ?? `Viewer ${n}`,
      color: PRESENCE_COLORS[(n - 1) % PRESENCE_COLORS.length] ?? "#4dffd2",
      connectedAt: Date.now(),
    };
  }

  private participants(): ParticipantPresence[] {
    return Array.from(this.presence.values());
  }

  private updatePresence(ws: ServerWebSocket<WsData>, name?: string, color?: string, role?: "host" | "viewer"): void {
    const participant = this.presence.get(ws);
    if (!participant) return;
    const cleanName = name?.trim().replace(/\s+/g, " ").slice(0, 18);
    const cleanColor = color?.trim();
    if (cleanName) participant.name = cleanName;
    if (cleanColor && /^#[0-9a-f]{6}$/i.test(cleanColor)) participant.color = cleanColor;
    if (role) participant.role = role;
    this.broadcast({ type: "presence.update", participant });
  }

  private updateCursor(ws: ServerWebSocket<WsData>, cursor: Omit<CursorPoint, "updatedAt">): void {
    const participant = this.presence.get(ws);
    if (!participant) return;
    const next: CursorPoint = {
      x: Math.round(cursor.x),
      y: Math.round(cursor.y),
      worldX: Math.round(cursor.worldX),
      worldY: Math.round(cursor.worldY),
      artifactId: cursor.artifactId,
      updatedAt: Date.now(),
    };
    participant.cursor = next;
    this.broadcast({ type: "presence.cursor", id: participant.id, cursor: next }, ws);
  }

  private broadcastPing(ws: ServerWebSocket<WsData>, ping: Omit<CursorPing, "updatedAt">): void {
    const participant = this.presence.get(ws);
    if (!participant) return;
    const next: CursorPing = {
      x: Math.round(ping.x),
      y: Math.round(ping.y),
      worldX: Math.round(ping.worldX),
      worldY: Math.round(ping.worldY),
      updatedAt: Date.now(),
    };
    this.broadcast({ type: "presence.ping", id: participant.id, ping: next });
  }

  private broadcast(ev: ServerEvent, except?: ServerWebSocket<WsData>): void {
    for (const ws of this.clients) {
      if (ws !== except) ws.send(encode(ev));
    }
  }

  private isHost(ws: ServerWebSocket<WsData>): boolean {
    return this.presence.get(ws)?.role === "host";
  }

  /** Host removes a participant: tell them they're out, then drop the socket. The
   *  close handler broadcasts presence.leave. (A short delay lets the message flush.) */
  private kick(id: string, by: ServerWebSocket<WsData>): void {
    for (const [ws, p] of this.presence) {
      if (p.id !== id || ws === by) continue; // can't kick yourself
      try {
        ws.send(encode({ type: "kicked" }));
      } catch {
        /* socket already gone */
      }
      setTimeout(() => {
        try {
          ws.close(4001, "removed by host");
        } catch {
          /* already closed */
        }
      }, 60);
      return;
    }
  }

  private async acceptContext(id: string): Promise<void> {
    const item = await this.context.accept(id);
    if (item) this.broadcast({ type: "context.updated", item });
  }

  private async rejectContext(id: string): Promise<void> {
    const item = await this.context.reject(id);
    if (item) this.broadcast({ type: "context.updated", item });
  }

  private async clearContext(): Promise<void> {
    const context = await this.context.clear();
    this.broadcast({ type: "context.snapshot", context });
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
