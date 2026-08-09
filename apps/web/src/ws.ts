import { useEffect, useReducer, useRef } from "react";
import {
  decodeServer,
  encode,
  type ClientEvent,
  type ServerEvent,
  type MeetingSummary,
  type FactcheckCheck,
  type ThemeKey,
  type ThemeTokens,
  type VariantInfo,
  type AgentName,
  type AgentToggles,
  type ParticipantPresence,
  type CursorPing,
  type ContextSnapshot,
} from "@sidebar/shared";
import { getKey, clearKey } from "./auth";

export interface TLine {
  id: number;
  kind: "partial" | "final" | "router";
  text?: string;
  speaker?: string;
  router?: { proto: boolean; summary: boolean; fact: boolean; screen: boolean };
}
export interface Artifact {
  id: string;
  buildId: string;
  intent: string;
  usesScreen: boolean;
  themeKey: ThemeKey;
  html: string;
  status: "building" | "done";
  ms?: number;
  variant?: VariantInfo;
}
export interface Telem { tokPerS: number; tokens: number; latencyMs: number }
export interface PresencePing extends CursorPing {
  id: string;
  participantId: string;
}
export type ActivityKind =
  | "start"
  | "utterance"
  | "router"
  | "summary"
  | "factcheck"
  | "fanout"
  | "prototype"
  | "complete"
  | "pick"
  | "dna"
  | "end";
export interface ActivityEvent {
  id: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
  speaker?: string;
  buildId?: string;
  artifactId?: string;
  flags?: { proto: boolean; summary: boolean; fact: boolean; screen: boolean };
  at: number;
}

export interface SidebarState {
  connected: boolean;
  title: string;
  participants: string[];
  selfId: string | null;
  presence: ParticipantPresence[];
  pings: PresencePing[];
  context: ContextSnapshot;
  scenarioId?: string;
  running: boolean;
  capture: { screen: boolean; speech: boolean; lastFrameTs?: number; host?: string };
  seq: number;
  activitySeq: number;
  activity: ActivityEvent[];
  transcript: TLine[];
  summary: MeetingSummary | null;
  factchecks: FactcheckCheck[];
  artifacts: Artifact[];
  fanoutBuildId: string | null;
  dna: ThemeTokens | null;
  telemetry: Partial<Record<AgentName, Telem>>;
  latencyMs: number | null;
  abMode: boolean;
  agents: AgentToggles;
  /** Set when the host removed you — show a "removed" screen and stop reconnecting. */
  kicked: boolean;
}

const initial: SidebarState = {
  connected: false,
  title: "Sidebar",
  participants: [],
  selfId: null,
  presence: [],
  pings: [],
  context: { meetingId: "", workspaceRoot: "", items: [] },
  running: false,
  capture: { screen: false, speech: false },
  seq: 1,
  activitySeq: 1,
  activity: [],
  transcript: [],
  summary: null,
  factchecks: [],
  artifacts: [],
  fanoutBuildId: null,
  dna: null,
  telemetry: {},
  latencyMs: null,
  abMode: false,
  agents: { router: true, summarizer: true, prototype: true, factcheck: true },
  kicked: false,
};

type Action =
  | { kind: "event"; ev: ServerEvent }
  | { kind: "connected"; v: boolean }
  | { kind: "abMode"; v: boolean };

function reducer(s: SidebarState, a: Action): SidebarState {
  if (a.kind === "connected") return { ...s, connected: a.v };
  if (a.kind === "abMode") return { ...s, abMode: a.v };
  const ev = a.ev;
  switch (ev.type) {
    case "meeting.start": {
      const started = makeActivity(s, {
        kind: "start",
        title: ev.title,
        detail: ev.participants.length ? ev.participants.join(", ") : "live room",
      });
      return {
        ...s,
        title: ev.title,
        participants: ev.participants,
        scenarioId: ev.scenarioId,
        running: true,
        transcript: [],
        summary: null,
        factchecks: [],
        artifacts: [],
        fanoutBuildId: null,
        latencyMs: null,
        activitySeq: started.activitySeq,
        activity: [started.event],
      };
    }
    case "presence.snapshot":
      return { ...s, selfId: ev.selfId, presence: ev.participants };
    case "presence.join":
      return { ...s, presence: upsertPresence(s.presence, ev.participant) };
    case "presence.update":
      return { ...s, presence: upsertPresence(s.presence, ev.participant) };
    case "presence.leave":
      return { ...s, presence: s.presence.filter((p) => p.id !== ev.id) };
    case "kicked":
      return { ...s, kicked: true, connected: false };
    case "presence.cursor":
      return {
        ...s,
        presence: s.presence.map((p) => (p.id === ev.id ? { ...p, cursor: ev.cursor } : p)),
      };
    case "presence.ping":
      return {
        ...s,
        pings: [
          ...s.pings,
          {
            ...ev.ping,
            id: `${ev.id}-${ev.ping.updatedAt}`,
            participantId: ev.id,
          },
        ].slice(-16),
      };
    case "context.snapshot":
      return { ...s, context: ev.context };
    case "context.item":
      return { ...s, context: { ...s.context, items: upsertContext(s.context.items, ev.item) } };
    case "context.updated":
      return { ...s, context: { ...s.context, items: upsertContext(s.context.items, ev.item) } };
    case "capture.status":
      return {
        ...s,
        capture: {
          screen: ev.screen,
          speech: ev.speech,
          lastFrameTs: ev.lastFrameTs,
          host: ev.host,
        },
      };
    case "transcript.partial": {
      const t = s.transcript.filter((l) => l.kind !== "partial");
      return { ...s, seq: s.seq + 1, transcript: [...t, { id: s.seq, kind: "partial", text: ev.text, speaker: ev.speaker }] };
    }
    case "transcript.final": {
      const t = s.transcript.filter((l) => l.kind !== "partial");
      const patch = appendActivity(s, {
        kind: "utterance",
        title: ev.text,
        speaker: ev.speaker,
        detail: ev.speaker ? `${ev.speaker} spoke` : "meeting utterance",
      });
      return {
        ...s,
        seq: s.seq + 1,
        transcript: [...t, { id: s.seq, kind: "final", text: ev.text, speaker: ev.speaker }],
        ...patch,
      };
    }
    case "router.decision": {
      const flags = {
        proto: ev.decision.prototype.trigger,
        summary: ev.decision.summary_update,
        fact: ev.decision.factcheck.trigger,
        screen: ev.decision.prototype.uses_screen,
      };
      const patch = appendActivity(s, {
        kind: "router",
        title: ev.decision.prototype.trigger ? ev.decision.prototype.intent || "Prototype route" : "Router checked the turn",
        detail: decisionDetail(flags),
        flags,
      });
      return {
        ...s,
        seq: s.seq + 1,
        transcript: [
          ...s.transcript,
          {
            id: s.seq,
            kind: "router",
            router: {
              proto: ev.decision.prototype.trigger,
              summary: ev.decision.summary_update,
              fact: ev.decision.factcheck.trigger,
              screen: ev.decision.prototype.uses_screen,
            },
          },
        ],
        ...patch,
      };
    }
    case "summary.update": {
      const patch = appendActivity(s, {
        kind: "summary",
        title: "Summary updated",
        detail: ev.summary.tldr,
      });
      return { ...s, summary: ev.summary, ...patch };
    }
    case "factcheck.result": {
      const patch = appendActivity(s, {
        kind: "factcheck",
        title: ev.result.checks.length ? `${ev.result.checks.length} claim${ev.result.checks.length === 1 ? "" : "s"} checked` : "Fact-check checked",
        detail: ev.result.checks[0]?.claim ?? "No checkable claims",
      });
      return { ...s, factchecks: [...ev.result.checks], ...patch };
    }
    case "fanout.start": {
      const patch = appendActivity(s, {
        kind: "fanout",
        title: "Design fan-out",
        detail: `${ev.variants.length} variants for ${ev.intent}`,
        buildId: ev.buildId,
      });
      return { ...s, fanoutBuildId: ev.buildId, ...patch };
    }
    case "prototype.start":
      return {
        ...s,
        artifacts: [
          ...s.artifacts,
          { id: ev.id, buildId: ev.buildId, intent: ev.intent, usesScreen: ev.usesScreen, themeKey: ev.themeKey, html: "", status: "building", variant: ev.variant },
        ],
        ...appendActivity(s, {
          kind: "prototype",
          title: ev.variant ? `${ev.variant.name} variant started` : "Prototype started",
          detail: ev.intent,
          buildId: ev.buildId,
          artifactId: ev.id,
        }),
      };
    case "prototype.token":
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: p.html + ev.delta } : p)) };
    case "prototype.complete":
      return {
        ...s,
        latencyMs: ev.ideaToArtifactMs,
        artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: ev.html, status: "done", ms: ev.ideaToArtifactMs } : p)),
        ...appendActivity(s, {
          kind: "complete",
          title: "Artifact rendered",
          detail: `${(ev.ideaToArtifactMs / 1000).toFixed(2)}s`,
          buildId: ev.buildId,
          artifactId: ev.id,
        }),
      };
    case "fanout.resolved": {
      const artifacts = s.artifacts
        .filter((p) => p.buildId !== ev.buildId || !p.variant || p.themeKey === ev.chosenThemeKey)
        .map((p) => (p.buildId === ev.buildId && p.themeKey === ev.chosenThemeKey ? { ...p, variant: undefined } : p));
      return {
        ...s,
        artifacts,
        fanoutBuildId: null,
        ...appendActivity(s, {
          kind: "pick",
          title: "Design picked",
          detail: ev.chosenThemeKey,
          buildId: ev.buildId,
        }),
      };
    }
    case "dna.update":
      return {
        ...s,
        dna: ev.theme,
        ...appendActivity(s, {
          kind: "dna",
          title: ev.theme ? "Design DNA learned" : "Design DNA reset",
          detail: ev.theme?.name ?? "style memory cleared",
        }),
      };
    case "telemetry":
      return { ...s, telemetry: { ...s.telemetry, [ev.agent]: { tokPerS: ev.tokPerS, tokens: ev.tokens, latencyMs: ev.latencyMs } } };
    case "mode.changed":
      return { ...s, abMode: ev.baseline === "gpu" };
    case "agents.changed":
      return { ...s, agents: ev.agents };
    case "meeting.end":
      return { ...s, running: false, ...appendActivity(s, { kind: "end", title: "Meeting ended", detail: `${ev.artifacts} artifacts` }) };
    default:
      return s;
  }
}

function makeActivity(s: SidebarState, event: Omit<ActivityEvent, "id" | "at">): { activitySeq: number; event: ActivityEvent } {
  return {
    activitySeq: s.activitySeq + 1,
    event: { ...event, id: s.activitySeq, at: Date.now() },
  };
}

function appendActivity(s: SidebarState, event: Omit<ActivityEvent, "id" | "at">): Pick<SidebarState, "activity" | "activitySeq"> {
  const next = makeActivity(s, event);
  return { activitySeq: next.activitySeq, activity: [...s.activity, next.event].slice(-80) };
}

function decisionDetail(flags: { proto: boolean; summary: boolean; fact: boolean; screen: boolean }): string {
  const parts = [
    flags.proto ? "prototype" : "",
    flags.summary ? "summary" : "",
    flags.fact ? "fact-check" : "",
    flags.screen ? "screen" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "no agent fired";
}

function upsertPresence(list: ParticipantPresence[], participant: ParticipantPresence): ParticipantPresence[] {
  const found = list.some((p) => p.id === participant.id);
  return found ? list.map((p) => (p.id === participant.id ? participant : p)) : [...list, participant];
}

function upsertContext(list: ContextSnapshot["items"], item: ContextSnapshot["items"][number]): ContextSnapshot["items"] {
  const found = list.some((p) => p.id === item.id);
  return found ? list.map((p) => (p.id === item.id ? item : p)) : [item, ...list];
}

function clientPresenceName(): string {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("name")?.trim();
  if (fromUrl) return fromUrl;
  if (params.has("host")) return localStorage.getItem("sidebar.host") || "Host";
  const stored = localStorage.getItem("sidebar.viewer");
  if (stored) return stored;
  const generated = `Viewer ${Math.floor(100 + Math.random() * 900)}`;
  localStorage.setItem("sidebar.viewer", generated);
  return generated;
}

function clientPresenceRole(): "host" | "viewer" {
  return new URLSearchParams(location.search).has("host") ? "host" : "viewer";
}

export function useSidebar() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const base =
      (import.meta.env.VITE_WS_URL as string | undefined) ??
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const k = getKey();
    const url = k ? `${base}${base.includes("?") ? "&" : "?"}key=${encodeURIComponent(k)}` : base;
    let closed = false;
    let kicked = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket;
    const connect = (): void => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        dispatch({ kind: "connected", v: true });
        ws.send(encode({ type: "presence.hello", name: clientPresenceName(), role: clientPresenceRole() }));
      };
      ws.onclose = () => {
        dispatch({ kind: "connected", v: false });
        // Don't reconnect once removed — that would just rejoin the meeting.
        if (!closed && !kicked) retry = setTimeout(connect, 1000);
      };
      ws.onmessage = (e) => {
        const ev = decodeServer(String(e.data));
        if (ev.type === "kicked") {
          kicked = true;
          clearKey(); // force the password again on a reload
        }
        dispatch({ kind: "event", ev });
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const send = (ev: ClientEvent): void => {
    // Guard: the socket may still be CONNECTING (or closed/reconnecting) when a
    // component mount/unmount or capture toggle fires. Calling send() then throws
    // InvalidStateError and crashes the tree — drop the event instead.
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(ev));
  };
  const setAbMode = (v: boolean): void => dispatch({ kind: "abMode", v });
  return { state, send, setAbMode };
}
