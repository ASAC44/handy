import type { RouterDecision, MeetingSummary, FactcheckResult, PrototypeReview, PrototypeSuggestion } from "./schemas";
import type { ThemeKey, ThemeTokens } from "./themes";

export type AgentName = "router" | "summarizer" | "prototype" | "factcheck" | "nextstep";
/** Global on/off per agent — lets you isolate the audio path or a single agent for testing. */
export type AgentToggles = Record<AgentName, boolean>;

export interface VariantInfo {
  id: string;
  themeKey: ThemeKey;
  name: string;
  recommended: boolean;
}

export interface CursorPoint {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  artifactId?: string;
  updatedAt: number;
}

export interface ParticipantPresence {
  id: string;
  name: string;
  color: string;
  role?: "host" | "viewer";
  connectedAt: number;
  cursor?: CursorPoint;
}

export interface CursorPing {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  updatedAt: number;
}

export type ContextStatus = "pending" | "accepted" | "rejected";

export interface ContextFileInfo {
  name: string;
  relativePath: string;
  size: number;
  type?: string;
}

export interface ContextBundle {
  id: string;
  title: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: number;
  status: ContextStatus;
  fileCount: number;
  totalBytes: number;
  files: ContextFileInfo[];
  acceptedAt?: number;
  rejectedAt?: number;
  workspacePath?: string;
}

export interface ContextSnapshot {
  meetingId: string;
  workspaceRoot: string;
  items: ContextBundle[];
}

/** A unique, host-minted guest invitation. The `code` is the per-guest secret that
 *  authorizes a viewer (carried as `?key=` on their link); the host authenticates
 *  with the separate host passcode. Lives only in the (in-memory) room registry. */
export interface InviteInfo {
  id: string;
  code: string;
  label: string;
  createdAt: number;
  revoked: boolean;
}

/** Backend -> frontend events (the WebSocket protocol, spec section 7 + learned-style additions). */
export type ServerEvent =
  | { type: "meeting.start"; scenarioId: string; title: string; participants: string[] }
  | { type: "transcript.partial"; text: string; ts: number; speaker?: string }
  | { type: "transcript.final"; text: string; ts: number; speaker?: string }
  | { type: "capture.status"; screen: boolean; speech: boolean; lastFrameTs?: number; host?: string }
  | { type: "router.decision"; decision: RouterDecision }
  | { type: "summary.update"; summary: MeetingSummary }
  | { type: "fanout.start"; buildId: string; intent: string; usesScreen: boolean; variants: VariantInfo[] }
  // `baseId` (evolve mode): the artifact this build is cloned from + edited — the
  // client seeds the new card with that artifact's HTML instead of a blank canvas.
  | { type: "prototype.start"; id: string; buildId: string; intent: string; usesScreen: boolean; themeKey: ThemeKey; variant?: VariantInfo; baseId?: string }
  | { type: "prototype.token"; id: string; delta: string }
  | { type: "prototype.complete"; id: string; buildId: string; html: string; ideaToArtifactMs: number; themeKey: ThemeKey }
  // Partner / critic agent reviewing a built artifact (id), then refining it in place.
  // `pass` is the 1-based review round; `final` marks the last review (shipped or capped).
  | { type: "critic.start"; id: string; buildId: string; pass: number }
  | { type: "critic.result"; id: string; buildId: string; pass: number; review: PrototypeReview; final: boolean }
  | { type: "critic.refined"; id: string; buildId: string; pass: number; html: string; ms: number }
  // Review couldn't complete (model error / timeout) — settle the artifact's UI so the
  // "reviewing…" chip clears instead of spinning forever.
  | { type: "critic.error"; id: string; buildId: string }
  // Follow-up design suggestions shown as action buttons below a ready prototype.
  | { type: "nextsteps.start"; id: string; buildId: string }
  | { type: "nextsteps.result"; id: string; buildId: string; suggestions: PrototypeSuggestion[] }
  | { type: "nextsteps.error"; id: string; buildId: string }
  | { type: "fanout.resolved"; buildId: string; chosenThemeKey: ThemeKey }
  | { type: "dna.update"; theme: ThemeTokens | null }
  | { type: "factcheck.result"; result: FactcheckResult }
  | { type: "telemetry"; agent: AgentName; latencyMs: number; tokens: number; tokPerS: number }
  | { type: "mode.changed"; baseline: "cerebras" | "gpu" }
  | { type: "agents.changed"; agents: AgentToggles }
  | { type: "meeting.end"; artifacts: number }
  | { type: "presence.snapshot"; selfId: string; participants: ParticipantPresence[] }
  | { type: "presence.join"; participant: ParticipantPresence }
  | { type: "presence.update"; participant: ParticipantPresence }
  | { type: "presence.leave"; id: string }
  | { type: "kicked"; reason?: string }
  | { type: "presence.cursor"; id: string; cursor: CursorPoint }
  | { type: "presence.ping"; id: string; ping: CursorPing }
  | { type: "context.snapshot"; context: ContextSnapshot }
  | { type: "context.item"; item: ContextBundle }
  | { type: "context.updated"; item: ContextBundle }
  | { type: "meeting.clear"; byHostId: string; at: number }
  // Host ended the meeting for everyone: all clients lock to the read-only recap.
  | { type: "meeting.over"; at: number; byHostId: string }
  // Final meeting document (a themed, self-contained HTML recap) streamed live.
  | { type: "finaldoc.start"; id: string }
  | { type: "finaldoc.token"; id: string; delta: string }
  | { type: "finaldoc.complete"; id: string; html: string; ms: number }
  // Host-only: the live list of minted guest invite codes.
  | { type: "invite.list"; invites: InviteInfo[] };

/** Frontend -> backend events. */
export type ClientEvent =
  | { type: "start"; scenarioId?: string }
  | { type: "live.start"; title?: string; host?: string }
  | { type: "live.stop" }
  | { type: "transcript.partial"; text: string; speaker?: string }
  | { type: "transcript.final"; text: string; speaker?: string }
  | { type: "screen.frame"; dataUri: string; width: number; height: number; ts: number }
  | { type: "capture.status"; screen: boolean; speech: boolean; host?: string }
  | { type: "pick"; buildId: string; themeKey: ThemeKey }
  | { type: "prototype.next"; artifactId: string; buildId: string; intent: string }
  // A rendered artifact's iframe reported runtime/CDN/load failures — feed them to the
  // repair (critic/evolve) agent. Server is host-gated + caps repairs per artifact (no loop).
  | { type: "prototype.renderReport"; artifactId: string; buildId: string; errors: string[] }
  | { type: "resetTaste" }
  | { type: "setAbMode"; enabled: boolean }
  | { type: "setAgent"; agent: AgentName; enabled: boolean }
  | { type: "presence.hello"; name?: string; color?: string; role?: "host" | "viewer" }
  | { type: "host.kick"; id: string }
  | { type: "presence.cursor"; cursor: Omit<CursorPoint, "updatedAt"> }
  | { type: "presence.ping"; ping: Omit<CursorPing, "updatedAt"> }
  | { type: "context.accept"; id: string }
  | { type: "context.reject"; id: string }
  | { type: "meeting.clear" }
  | { type: "context.clear" }
  // Host ends the meeting for everyone (triggers the final-document recap).
  | { type: "meeting.end" }
  // Host mints / revokes a unique guest invite code.
  | { type: "invite.create" }
  | { type: "invite.revoke"; id: string };

export function encode(ev: ServerEvent | ClientEvent): string {
  return JSON.stringify(ev);
}
export function decodeClient(raw: string): ClientEvent {
  return JSON.parse(raw) as ClientEvent;
}
export function decodeServer(raw: string): ServerEvent {
  return JSON.parse(raw) as ServerEvent;
}
