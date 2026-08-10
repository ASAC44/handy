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
  type PrototypeReview,
  type PrototypeSuggestion,
  type AgentToggles,
  type ParticipantPresence,
  type CursorPing,
  type ContextSnapshot,
  type InviteInfo,
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
  /** This build is an edit cloned from a prior artifact (seeded with its HTML). */
  evolving?: boolean;
  /** Partner / critic agent: latest verdict + where it is in the review→refine loop. */
  review?: PrototypeReview;
  reviewState?: "reviewing" | "refining" | "reviewed";
  reviewPass?: number;
  /** Follow-up design moves generated once the prototype is ready. */
  nextSteps?: PrototypeSuggestion[];
  nextStepsState?: "thinking" | "ready" | "error";
}
export interface Telem { tokPerS: number; tokens: number; latencyMs: number }
/** The final meeting document (themed HTML recap) streamed when the host ends. */
export interface FinalDoc {
  id: string;
  html: string;
  status: "building" | "done";
  ms?: number;
}
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
  | "critic"
  | "nextstep"
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
  /** Set when YOU chose to leave — show a "you left" screen and stop reconnecting. */
  left: boolean;
  /** Set when the host ended the meeting for everyone — lock all clients to the recap. */
  ended: { at: number; byHostId: string } | null;
  /** The streamed final meeting document (recap), once the host ends the meeting. */
  finalDoc: FinalDoc | null;
  /** Host-only: live list of minted guest invite codes (empty for guests). */
  invites: InviteInfo[];
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
  agents: { router: true, summarizer: true, prototype: true, factcheck: true, nextstep: true },
  kicked: false,
  left: false,
  ended: null,
  finalDoc: null,
  invites: [],
};

type Action =
  | { kind: "event"; ev: ServerEvent }
  | { kind: "connected"; v: boolean }
  | { kind: "left" }
  | { kind: "abMode"; v: boolean };

function reducer(s: SidebarState, a: Action): SidebarState {
  if (a.kind === "connected") return { ...s, connected: a.v };
  if (a.kind === "left") return { ...s, left: true, connected: false };
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
        ended: null,
        finalDoc: null,
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
      // Keep one in-flight partial PER speaker so concurrent talkers each show a live line.
      const t = s.transcript.filter((l) => !(l.kind === "partial" && l.speaker === ev.speaker));
      return { ...s, seq: s.seq + 1, transcript: [...t, { id: s.seq, kind: "partial", text: ev.text, speaker: ev.speaker }] };
    }
    case "transcript.final": {
      const t = s.transcript.filter((l) => !(l.kind === "partial" && l.speaker === ev.speaker));
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
    case "prototype.start": {
      // Evolve mode: seed the new card with the base artifact's HTML (a clone) instead
      // of a blank canvas, so the edit is visibly applied to what's already on screen.
      const baseHtml = ev.baseId ? s.artifacts.find((a) => a.id === ev.baseId)?.html ?? "" : "";
      return {
        ...s,
        artifacts: [
          ...s.artifacts,
          { id: ev.id, buildId: ev.buildId, intent: ev.intent, usesScreen: ev.usesScreen, themeKey: ev.themeKey, html: baseHtml, status: "building", variant: ev.variant, evolving: !!ev.baseId },
        ],
        ...appendActivity(s, {
          kind: "prototype",
          title: ev.variant ? `${ev.variant.name} variant started` : ev.baseId ? "Revising prototype" : "Prototype started",
          detail: ev.intent,
          buildId: ev.buildId,
          artifactId: ev.id,
        }),
      };
    }
    case "prototype.token":
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: p.html + ev.delta } : p)) };
    case "prototype.cancel":
      // A superseded learned build — remove its (half-built) card(s) so only the latest stays.
      return {
        ...s,
        artifacts: s.artifacts.filter((p) => p.buildId !== ev.buildId),
        fanoutBuildId: s.fanoutBuildId === ev.buildId ? null : s.fanoutBuildId,
      };
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
    case "critic.start":
      return {
        ...s,
        artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, reviewState: "reviewing", reviewPass: ev.pass } : p)),
      };
    case "critic.result": {
      const reviewState: Artifact["reviewState"] = ev.final ? "reviewed" : ev.review.verdict === "refine" ? "refining" : "reviewed";
      const n = ev.review.issues.length;
      const title =
        ev.review.verdict === "ship" || ev.final
          ? `Reviewer: shipped (${Math.round(ev.review.score * 100)})`
          : `Reviewer: ${n} fix${n === 1 ? "" : "es"} → polishing`;
      return {
        ...s,
        artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, review: ev.review, reviewState, reviewPass: ev.pass } : p)),
        ...appendActivity(s, { kind: "critic", title, detail: ev.review.summary, buildId: ev.buildId, artifactId: ev.id }),
      };
    }
    case "critic.refined":
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, html: ev.html } : p)) };
    case "critic.error":
      // Review failed/timed out — clear the spinner; leave the artifact otherwise intact.
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, reviewState: "reviewed" } : p)) };
    case "nextsteps.start":
      return {
        ...s,
        artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, nextSteps: undefined, nextStepsState: "thinking" } : p)),
      };
    case "nextsteps.result": {
      const patch = appendActivity(s, {
        kind: "nextstep",
        title: ev.suggestions.length ? `${ev.suggestions.length} next step${ev.suggestions.length === 1 ? "" : "s"} suggested` : "No next steps suggested",
        detail: ev.suggestions.map((item) => item.label).join(", "),
        buildId: ev.buildId,
        artifactId: ev.id,
      });
      return {
        ...s,
        artifacts: s.artifacts.map((p) =>
          p.id === ev.id ? { ...p, nextSteps: ev.suggestions.slice(0, 3), nextStepsState: "ready" } : p,
        ),
        ...patch,
      };
    }
    case "nextsteps.error":
      return { ...s, artifacts: s.artifacts.map((p) => (p.id === ev.id ? { ...p, nextStepsState: "error" } : p)) };
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
    case "meeting.over":
      // Host ended the meeting for everyone: lock to the read-only recap.
      return {
        ...s,
        running: false,
        ended: { at: ev.at, byHostId: ev.byHostId },
        ...appendActivity(s, { kind: "end", title: "Meeting ended", detail: "drafting the final recap…" }),
      };
    case "finaldoc.start":
      return { ...s, finalDoc: { id: ev.id, html: "", status: "building" } };
    case "finaldoc.token":
      return {
        ...s,
        finalDoc: s.finalDoc && s.finalDoc.id === ev.id ? { ...s.finalDoc, html: s.finalDoc.html + ev.delta } : s.finalDoc,
      };
    case "finaldoc.complete":
      return { ...s, finalDoc: { id: ev.id, html: ev.html, status: "done", ms: ev.ms } };
    case "invite.list":
      return { ...s, invites: ev.invites };
    case "meeting.clear":
      // Host cleared the meeting: wipe transcript, summary, artifacts, factchecks,
      // learned DNA, telemetry, and activity to a fresh slate. Connection, identity,
      // presence, and context snapshot are preserved (the room is shared, not torn down).
      return {
        ...s,
        title: "Sidebar",
        participants: [],
        scenarioId: undefined,
        running: false,
        capture: { screen: false, speech: false },
        seq: 1,
        activitySeq: 1,
        activity: [
          {
            id: 1,
            kind: "start",
            title: "Meeting cleared",
            detail: ev.byHostId ? "host started fresh" : "started fresh",
            at: ev.at,
          },
        ],
        transcript: [],
        summary: null,
        factchecks: [],
        artifacts: [],
        fanoutBuildId: null,
        dna: null,
        telemetry: {},
        latencyMs: null,
        ended: null,
        finalDoc: null,
      };
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
  // A deliberate guest "exit": stop auto-reconnect and show the "you left" screen.
  const leftRef = useRef(false);
  const leaveRef = useRef<() => void>(() => {});

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
        // Don't reconnect once removed or after a deliberate exit — either would rejoin.
        if (!closed && !kicked && !leftRef.current) retry = setTimeout(connect, 1000);
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
    // Leaving: flag it (so onclose won't reconnect), flip the UI, then drop the socket.
    leaveRef.current = () => {
      leftRef.current = true;
      dispatch({ kind: "left" });
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
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
  const leave = (): void => leaveRef.current();
  return { state, send, setAbMode, leave };
}
