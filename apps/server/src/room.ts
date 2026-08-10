import type { ServerWebSocket } from "bun";
import {
  decodeClient,
  encode,
  THEMES,
  type AgentToggles,
  type ClientEvent,
  type CursorPing,
  type CursorPoint,
  type InviteInfo,
  type ParticipantPresence,
  type ServerEvent,
  type ThemeKey,
  type ThemeTokens,
} from "@sidebar/shared";
import { config } from "./config";
import { Orchestrator } from "./orchestrator";
import { ContextStore, ContextUploadError } from "./context";
import type { MeetingRuntime } from "./runtime";
import type { AuthResult, WsData } from "./session";

/** Constant-time string compare (avoids leaking the passcode via timing). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

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
  agents: AgentToggles = { router: true, summarizer: true, prototype: true, factcheck: true, nextstep: true };
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
  /** Host-minted guest invite codes, keyed by code. In-memory for this one room. */
  private invites = new Map<string, InviteInfo>();
  private inviteSeq = 0;
  /** True once the host has ended the meeting for everyone (recap is being shown). */
  private ended = false;

  get workspaceRoot(): string {
    return this.context.workspaceRoot;
  }

  contextSummary(): string {
    return this.context.summary();
  }

  /** Authenticate a connection's key. Open mode (no host passcode) authorizes
   *  everyone with an undefined role, so the legacy `?host` client flag still
   *  decides host-ness in local dev. Locked mode is server-authoritative: the host
   *  passcode grants `host`, a live (non-revoked) invite code grants `viewer`, and
   *  anything else is rejected. */
  authenticate(key: string): AuthResult {
    if (!config.hostPasscode) return { ok: true };
    if (key && safeEqual(key, config.hostPasscode)) return { ok: true, role: "host" };
    const invite = this.invites.get(key);
    if (invite && !invite.revoked) return { ok: true, role: "viewer", inviteId: invite.id, label: invite.label };
    return { ok: false };
  }

  /** Mint a fresh, unique guest invite code and return its public info. */
  createInvite(): InviteInfo {
    const n = ++this.inviteSeq;
    const invite: InviteInfo = {
      id: `inv-${n.toString(36)}-${crypto.randomUUID().slice(0, 4)}`,
      code: `g-${crypto.randomUUID().replace(/-/g, "")}`, // full ~122-bit secret, not truncated
      label: `Guest ${n}`,
      createdAt: Date.now(),
      revoked: false,
    };
    this.invites.set(invite.code, invite);
    return invite;
  }

  /** Revoke an invite by id so its link can no longer authenticate. */
  revokeInvite(id: string): void {
    for (const invite of this.invites.values()) {
      if (invite.id === id) invite.revoked = true;
    }
  }

  /** Disconnect any guest currently seated on this invite — revoking the code only
   *  blocks future reconnects, so we evict the live socket too (mirrors kick()). The
   *  close handler broadcasts presence.leave. */
  private evictByInvite(id: string): void {
    for (const ws of this.clients) {
      if (ws.data.auth?.inviteId !== id) continue;
      try {
        ws.send(encode({ type: "kicked" }));
      } catch {
        /* socket already gone */
      }
      setTimeout(() => {
        try {
          ws.close(4001, "invite revoked");
        } catch {
          /* already closed */
        }
      }, 60);
    }
  }

  private inviteList(): InviteInfo[] {
    return Array.from(this.invites.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Push the current invite list to every host socket (codes are host-only). */
  private broadcastInviteList(): void {
    const ev: ServerEvent = { type: "invite.list", invites: this.inviteList() };
    for (const ws of this.clients) {
      if (this.isHost(ws)) ws.send(encode(ev));
    }
  }

  open(ws: ServerWebSocket<WsData>): void {
    this.clients.add(ws);
    const participant = this.makeParticipant(ws.data.auth);
    this.presence.set(ws, participant);
    for (const ev of this.history) ws.send(encode(ev));
    if (this.history.length === 0 && this.learned) ws.send(encode({ type: "dna.update", theme: this.learned }));
    if (this.screenOn || this.speechOn) this.sendStatus(ws);
    ws.send(encode({ type: "presence.snapshot", selfId: participant.id, participants: this.participants() }));
    ws.send(encode({ type: "context.snapshot", context: this.context.snapshot() }));
    ws.send(encode({ type: "agents.changed", agents: this.agents }));
    // Hosts get the live invite-code list; guests never see other codes.
    if (this.isHost(ws)) ws.send(encode({ type: "invite.list", invites: this.inviteList() }));
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
      this.ended = false; // a fresh meeting (scenario or live) lifts any prior recap lock
    }
    // Streaming token deltas (and in-flight partials) are broadcast live but NOT kept
    // in history: the matching *.complete / transcript.final carries the settled text,
    // so late joiners reconstruct full state without replaying hundreds of deltas.
    if (ev.type !== "prototype.token" && ev.type !== "finaldoc.token" && ev.type !== "transcript.partial") {
      this.history.push(ev);
    }
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
      case "meeting.clear":
        if (this.isHost(ws)) this.clearMeeting(ws);
        break;
      case "meeting.end":
        if (this.isHost(ws)) this.endMeeting(ws);
        break;
      case "invite.create":
        if (this.isHost(ws)) {
          this.createInvite();
          this.broadcastInviteList();
        }
        break;
      case "invite.revoke":
        if (this.isHost(ws)) {
          this.revokeInvite(ev.id);
          this.evictByInvite(ev.id); // also remove the guest if they're currently connected
          this.broadcastInviteList();
        }
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
      // Attribute by the sender's presence, not a client-supplied name — in the
      // shared listening room every participant's mic is its own clean track, so
      // "who said it" is known by construction (no diarization).
      case "transcript.partial":
        if (!this.ended) this.orch.ingestPartial(ev.text, this.presence.get(ws)?.name);
        break;
      case "transcript.final":
        if (!this.ended) this.orch.ingestFinal(ev.text, this.presence.get(ws)?.name);
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
      case "prototype.next":
        if (!this.ended) this.orch.requestPrototypeNext(ev.artifactId, ev.intent, this.presence.get(ws)?.name);
        break;
      case "prototype.renderReport":
        // Host-authoritative so one shared repair runs (not one per guest); the
        // orchestrator caps it to one attempt per artifact so it can't loop.
        if (this.isHost(ws) && !this.ended) void this.orch.repairRender(ev.artifactId, ev.buildId, ev.errors);
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

  private makeParticipant(auth: AuthResult): ParticipantPresence {
    const n = this.nextPresence++;
    // In locked mode the matched credential decides the role server-side; the host
    // gets the "Host" name, a guest gets their invite seat label. In open mode role
    // stays undefined and is set later by the client's presence.hello.
    const role = auth.role;
    const name =
      role === "host"
        ? "Host"
        : auth.label ?? PRESENCE_NAMES[(n - 1) % PRESENCE_NAMES.length] ?? `Viewer ${n}`;
    return {
      id: `p${n.toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      color: PRESENCE_COLORS[(n - 1) % PRESENCE_COLORS.length] ?? "#4dffd2",
      role,
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
    // Role is client-assertable ONLY in open mode. When the connection authenticated
    // with a real credential (ws.data.auth.role set), that role is authoritative and
    // a client cannot self-promote to host.
    if (role && !ws.data.auth.role) participant.role = role;
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
      // Invalidate the kicked guest's invite code so their link can't rejoin.
      const inviteId = ws.data.auth?.inviteId;
      if (inviteId) {
        this.revokeInvite(inviteId);
        this.broadcastInviteList();
      }
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

  /** Host clears the meeting and starts fresh: stop any running scenario/live run,
   *  wipe history, learned DNA, pending picks, screen capture, and uploaded context,
   *  then broadcast a single `meeting.clear` so every client resets to a clean slate.
   *  Presence (who's in the room) is intentionally preserved. */
  private clearMeeting(ws: ServerWebSocket<WsData>): void {
    this.orch.clear();
    this.learned = null;
    this.picks.clear();
    this.screenOn = false;
    this.speechOn = false;
    this.latestScreenDataUri = null;
    this.lastFrameTs = undefined;
    this.history = [];
    this.ended = false; // starting fresh also lifts the recap lock
    const byHostId = this.presence.get(ws)?.id ?? "";
    void this.context.clear();
    this.broadcast({ type: "meeting.clear", byHostId, at: Date.now() });
  }

  /** Host ends the meeting for everyone: stop in-flight work (KEEPING the transcript
   *  and summary for the recap), lock every client to the read-only final document,
   *  and kick off the closing agent that streams the recap HTML to the whole room. */
  private endMeeting(ws: ServerWebSocket<WsData>): void {
    if (this.ended) return;
    this.ended = true;
    this.orch.stop(); // cancel any in-flight build; transcript + summary are preserved
    this.screenOn = false;
    this.speechOn = false;
    this.latestScreenDataUri = null;
    this.lastFrameTs = undefined;
    const byHostId = this.presence.get(ws)?.id ?? "";
    this.send({ type: "meeting.over", at: Date.now(), byHostId });
    void this.orch.finalizeDocument();
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
