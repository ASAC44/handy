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
} from "@sidebar/shared";

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

export interface SidebarState {
  connected: boolean;
  title: string;
  participants: string[];
  scenarioId?: string;
  running: boolean;
  seq: number;
  transcript: TLine[];
  summary: MeetingSummary | null;
  factchecks: FactcheckCheck[];
  artifacts: Artifact[];
  fanoutBuildId: string | null;
  dna: ThemeTokens | null;
  telemetry: Partial<Record<AgentName, Telem>>;
  latencyMs: number | null;
  abMode: boolean;
}

const initial: SidebarState = {
  connected: false,
  title: "Sidebar",
  participants: [],
  running: false,
  seq: 1,
  transcript: [],
  summary: null,
  factchecks: [],
  artifacts: [],
  fanoutBuildId: null,
  dna: null,
  telemetry: {},
  latencyMs: null,
  abMode: false,
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
    case "meeting.start":
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
      };
    case "transcript.partial": {
      const t = s.transcript.filter((l) => l.kind !== "partial");
      return { ...s, seq: s.seq + 1, transcript: [...t, { id: s.seq, kind: "partial", text: ev.text, speaker: ev.speaker }] };
    }
    case "transcript.final": {
      const t = s.transcript.filter((l) => l.kind !== "partial");
      return { ...s, seq: s.seq + 1, transcript: [...t, { id: s.seq, kind: "final", text: ev.text, speaker: ev.speaker }] };
    }
    case "router.decision":
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
      };
    case "summary.update":
      return { ...s, summary: ev.summary };
    case "factcheck.result":
      return { ...s, factchecks: [...ev.result.checks] };
    case "fanout.start":
      return { ...s, fanoutBuildId: ev.buildId };
    case "prototype.start":
      return {
        ...s,
        artifacts: [
          ...s.artifacts,
          { id: ev.id, buildId: ev.buildId, intent: ev.intent, usesScreen: ev.usesScreen, themeKey: ev.themeKey, html: "", status: "building", variant: ev.variant },
        ],
      };
    case "prototype.token":
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: p.html + ev.delta } : p)) };
    case "prototype.complete":
      return {
        ...s,
        latencyMs: ev.ideaToArtifactMs,
        artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: ev.html, status: "done", ms: ev.ideaToArtifactMs } : p)),
      };
    case "fanout.resolved": {
      const artifacts = s.artifacts
        .filter((p) => p.buildId !== ev.buildId || !p.variant || p.themeKey === ev.chosenThemeKey)
        .map((p) => (p.buildId === ev.buildId && p.themeKey === ev.chosenThemeKey ? { ...p, variant: undefined } : p));
      return { ...s, artifacts, fanoutBuildId: null };
    }
    case "dna.update":
      return { ...s, dna: ev.theme };
    case "telemetry":
      return { ...s, telemetry: { ...s.telemetry, [ev.agent]: { tokPerS: ev.tokPerS, tokens: ev.tokens, latencyMs: ev.latencyMs } } };
    case "meeting.end":
      return { ...s, running: false };
    default:
      return s;
  }
}

export function useSidebar() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url =
      (import.meta.env.VITE_WS_URL as string | undefined) ?? `ws://${location.hostname}:3001/ws`;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket;
    const connect = (): void => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => dispatch({ kind: "connected", v: true });
      ws.onclose = () => {
        dispatch({ kind: "connected", v: false });
        if (!closed) retry = setTimeout(connect, 1000);
      };
      ws.onmessage = (e) => dispatch({ kind: "event", ev: decodeServer(String(e.data)) });
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const send = (ev: ClientEvent): void => wsRef.current?.send(encode(ev));
  const setAbMode = (v: boolean): void => dispatch({ kind: "abMode", v });
  return { state, send, setAbMode };
}
