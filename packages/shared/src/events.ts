import type { RouterDecision, MeetingSummary, FactcheckResult } from "./schemas";
import type { ThemeKey, ThemeTokens } from "./themes";

export type AgentName = "router" | "summarizer" | "prototype" | "factcheck";

export interface VariantInfo {
  id: string;
  themeKey: ThemeKey;
  name: string;
  recommended: boolean;
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
  | { type: "prototype.start"; id: string; buildId: string; intent: string; usesScreen: boolean; themeKey: ThemeKey; variant?: VariantInfo }
  | { type: "prototype.token"; id: string; delta: string }
  | { type: "prototype.complete"; id: string; buildId: string; html: string; ideaToArtifactMs: number; themeKey: ThemeKey }
  | { type: "fanout.resolved"; buildId: string; chosenThemeKey: ThemeKey }
  | { type: "dna.update"; theme: ThemeTokens | null }
  | { type: "factcheck.result"; result: FactcheckResult }
  | { type: "telemetry"; agent: AgentName; latencyMs: number; tokens: number; tokPerS: number }
  | { type: "mode.changed"; baseline: "cerebras" | "gpu" }
  | { type: "meeting.end"; artifacts: number };

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
  | { type: "resetTaste" }
  | { type: "setAbMode"; enabled: boolean };

export function encode(ev: ServerEvent | ClientEvent): string {
  return JSON.stringify(ev);
}
export function decodeClient(raw: string): ClientEvent {
  return JSON.parse(raw) as ClientEvent;
}
export function decodeServer(raw: string): ServerEvent {
  return JSON.parse(raw) as ServerEvent;
}
