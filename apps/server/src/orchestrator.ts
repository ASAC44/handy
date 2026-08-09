import { config } from "./config";
import type { MeetingRuntime } from "./runtime";
import { getScenario, type FixtureSegment } from "./source/fixtures";
import {
  buildPrototype,
  THEMES,
  FANOUT,
  RECOMMENDED,
  type ThemeKey,
  type PrototypeKey,
  type ServerEvent,
  type MeetingSummary,
  type RouterDecision,
  type FactcheckResult,
  type VariantInfo,
  type AgentName,
} from "@sidebar/shared";
import { mockStream, liveStream, getBaseline } from "./agents/prototype";
import { routeLive } from "./agents/router";
import { summarizeLive } from "./agents/summarizer";
import { factcheckLive } from "./agents/factcheck";

const RATE = 0.6; // compress fixture pacing for a snappier replay
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let buildSeq = 0;
let liveTurnSeq = 0;

/** Safe "do nothing" decision used when a live router call fails — skips the turn. */
const NOOP_DECISION: RouterDecision = {
  topic_shift: false,
  summary_update: false,
  prototype: { trigger: false, intent: "", uses_screen: false },
  factcheck: { trigger: false, claims: [] },
};
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const PROTOTYPE_WORDS =
  /\b(build|make|mock|mockup|prototype|design|sketch|wireframe|dashboard|chart|graph|page|landing|board|kanban|flow|form|table|app|ui|screen|widget|visuali[sz]e)\b/i;
const SCREEN_WORDS = /\b(this|screen|share|shared|slide|deck|diagram|whiteboard|mockup|figma|visual|screenshot|as shown)\b/i;
const FACT_WORDS = /\b(\d+[%$kmb]?|percent|million|billion|q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|industry|category|market)\b/i;

function heuristicExpect(text: string, prev: MeetingSummary | null): FixtureSegment["expect"] {
  const prototype = PROTOTYPE_WORDS.test(text);
  const usesScreen = prototype && SCREEN_WORDS.test(text);
  const factcheck = !prototype && FACT_WORDS.test(text);
  return {
    router: {
      topic_shift: !prev,
      summary_update: true,
      prototype: {
        trigger: prototype,
        intent: prototype ? intentFrom(text) : "",
        uses_screen: usesScreen,
      },
      factcheck: {
        trigger: factcheck,
        claims: factcheck ? [text] : [],
      },
    },
    summary: summarizeMockLine(text, prev),
    prototype: prototype ? { build: inferPrototypeKey(text), intent: intentFrom(text), uses_screen: usesScreen } : undefined,
    factcheck: factcheck
      ? { claim: text, verdict: "unverified", confidence: 0.35, source: "live heuristic; web search not wired" }
      : undefined,
  };
}

function intentFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 120 ? clean.slice(0, 117) + "..." : clean;
}

function inferPrototypeKey(text: string): PrototypeKey {
  const lower = text.toLowerCase();
  if (/\b(landing|hero|waitlist|signup|marketing|page)\b/.test(lower)) return "landing";
  if (/\b(dashboard|metric|mrr|churn|chart|graph|analytics|revenue)\b/.test(lower)) return "dashboard";
  return "kanban";
}

function summarizeMock(transcript: string[], prev: MeetingSummary | null): MeetingSummary {
  const last = transcript[transcript.length - 1]?.replace(/^[^:]+:\s*/, "") ?? "Listening.";
  return summarizeMockLine(last, prev);
}

function summarizeMockLine(text: string, prev: MeetingSummary | null): MeetingSummary {
  const decisions = [...(prev?.decisions ?? [])];
  const action_items = [...(prev?.action_items ?? [])];
  const open_questions = [...(prev?.open_questions ?? [])];
  if (/\b(ship|go with|decided|decision|make this|use this)\b/i.test(text)) decisions.push(intentFrom(text));
  if (/\b(can you|please|todo|follow up|need to|wire|implement|send|create)\b/i.test(text)) {
    action_items.push({ owner: "unassigned", task: intentFrom(text) });
  }
  if (text.includes("?")) open_questions.push(intentFrom(text));
  return {
    tldr: intentFrom(text),
    decisions: decisions.slice(-5),
    action_items: action_items.slice(-5),
    open_questions: open_questions.slice(-5),
  };
}

/**
 * Drives a meeting end-to-end: streams the transcript (from fixtures for now),
 * runs the router + agents (mock = fixture gold labels, live = Cerebras), and
 * orchestrates the prototype fan-out → pick → learn loop.
 */
export class Orchestrator {
  private runId = 0;
  private transcript: string[] = [];
  private summary: MeetingSummary | null = null;
  private liveQueue: Promise<void> = Promise.resolve();

  constructor(private runtime: MeetingRuntime) {}

  stop(): void {
    this.runId++;
  }

  /** Reset all in-memory meeting state: cancel in-flight work, drop the transcript
   *  and rolling summary, and reset the live turn sequence. The room emits the
   *  matching `meeting.clear` event; this just zeroes the orchestrator's state. */
  clear(): void {
    this.stop();
    this.transcript = [];
    this.summary = null;
    this.liveQueue = Promise.resolve();
    liveTurnSeq = 0;
  }

  async start(scenarioId?: string): Promise<void> {
    const my = ++this.runId;
    const scn = getScenario(scenarioId ?? config.scenario);
    this.transcript = [];
    this.summary = null;
    this.send({ type: "meeting.start", scenarioId: scn.id, title: scn.title, participants: scn.participants });
    await sleep(300);
    for (const seg of scn.segments) {
      if (my !== this.runId) return;
      await this.playSegment(seg, my);
    }
    if (my === this.runId) this.send({ type: "meeting.end", artifacts: buildSeq });
  }

  startLive(title = "Live Meeting", host = "Host"): void {
    this.stop();
    this.runId++;
    this.transcript = [];
    this.summary = null;
    this.liveQueue = Promise.resolve();
    this.send({ type: "meeting.start", scenarioId: "live", title, participants: [host] });
    this.send({
      type: "capture.status",
      screen: !!this.runtime.latestScreenDataUri,
      speech: false,
      host,
    });
  }

  ingestPartial(text: string, speaker?: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.send({ type: "transcript.partial", text: clean, ts: Date.now(), speaker });
  }

  ingestFinal(text: string, speaker?: string): void {
    const clean = text.trim();
    if (!clean) return;
    const my = this.runId;
    const seg: FixtureSegment = {
      t: liveTurnSeq++,
      speaker: speaker?.trim() || "Speaker",
      ms: 0,
      text: clean,
      expect: heuristicExpect(clean, this.summary),
    };
    this.liveQueue = this.liveQueue
      .then(() => this.playSegment(seg, my, false))
      .catch((err) => {
        console.error("[live] transcript processing failed", errMsg(err));
      });
  }

  private send(ev: ServerEvent): void {
    this.runtime.send(ev);
  }

  private async playSegment(seg: FixtureSegment, my: number, paced = true): Promise<void> {
    if (seg.partials) {
      for (const p of seg.partials) {
        if (my !== this.runId) return;
        this.send({ type: "transcript.partial", text: p, ts: Date.now(), speaker: seg.speaker });
        await sleep(460 * RATE);
      }
    }
    this.send({ type: "transcript.final", text: seg.text, ts: Date.now(), speaker: seg.speaker });
    this.transcript.push(`${seg.speaker}: ${seg.text}`);
    if (paced) await sleep(Math.max(500, seg.ms * RATE));
    if (my !== this.runId || !seg.expect) return;

    // Per-agent toggles for testing. Router off = pure audio path (transcripts only,
    // no inference); each downstream agent is gated independently.
    const agents = this.runtime.agents;
    if (!agents.router) return;

    const decision = await this.router(seg);
    if (my !== this.runId) return;
    this.send({ type: "router.decision", decision });

    if (decision.summary_update && agents.summarizer) {
      const summary = await this.summarize(seg);
      if (summary) {
        this.summary = summary;
        this.send({ type: "summary.update", summary });
      }
    }
    if (decision.factcheck.trigger && agents.factcheck) {
      const result = await this.factcheck(seg, decision.factcheck.claims);
      if (result) this.send({ type: "factcheck.result", result });
    }
    if (decision.prototype.trigger && agents.prototype) {
      await this.build(seg, decision, my);
    }
    await sleep(400);
  }

  private async router(seg: FixtureSegment): Promise<RouterDecision> {
    this.telemetry("router", 950, 180);
    if (config.agents === "mock") return seg.expect!.router;
    try {
      return await routeLive(seg.text, JSON.stringify(this.summary ?? {}), this.runtime.contextSummary());
    } catch (err) {
      console.error("[router] live call failed", errMsg(err));
      return NOOP_DECISION;
    }
  }

  private async summarize(seg: FixtureSegment): Promise<MeetingSummary | null> {
    this.telemetry("summarizer", 760, 520);
    if (config.agents === "mock") return seg.expect!.summary ?? summarizeMock(this.transcript, this.summary);
    try {
      return await summarizeLive(this.transcript.join("\n"), this.summary, this.runtime.contextSummary());
    } catch (err) {
      console.error("[summarizer] live call failed", errMsg(err));
      return summarizeMock(this.transcript, this.summary);
    }
  }

  private async factcheck(seg: FixtureSegment, claims: string[]): Promise<FactcheckResult | null> {
    if (config.agents === "mock") {
      const f = seg.expect!.factcheck;
      return f ? { checks: [f] } : null;
    }
    return factcheckLive(claims);
  }

  /** Prototype build: fan-out 3 variants the first time, single learned-style build after. */
  private async build(seg: FixtureSegment, decision: RouterDecision, my: number): Promise<void> {
    const buildKey: PrototypeKey = seg.expect?.prototype?.build ?? inferPrototypeKey(`${decision.prototype.intent} ${seg.text}`);
    const intent = decision.prototype.intent || seg.expect?.prototype?.intent || "Prototype";
    const usesScreen = decision.prototype.uses_screen;
    const buildId = `b${++buildSeq}`;

    if (!this.runtime.learned) {
      const variants: VariantInfo[] = FANOUT.map((k) => ({
        id: `${buildId}-${k}`,
        themeKey: k,
        name: THEMES[k].name,
        recommended: k === RECOMMENDED,
      }));
      this.send({ type: "fanout.start", buildId, intent, usesScreen, variants });
      await Promise.all(
        variants.map((v) => this.streamOne(v.id, buildId, intent, usesScreen, v.themeKey, buildKey, 1850, my, v)),
      );
      if (my !== this.runId) return;
      const chosen = await this.awaitPickWithTimeout(buildId, 4200);
      this.runtime.learn(chosen);
      this.send({ type: "fanout.resolved", buildId, chosenThemeKey: chosen });
    } else {
      const theme = this.runtime.learned.key;
      // A/B: race Cerebras and the GPU baseline concurrently so both timers run live.
      const tasks = [this.streamOne(`${buildId}-cer`, buildId, intent, usesScreen, theme, buildKey, 1800, my)];
      if (this.runtime.abMode) {
        tasks.push(this.streamOne(`${buildId}-gpu`, buildId, intent, usesScreen, theme, buildKey, 9200, my, undefined, true));
      }
      await Promise.all(tasks);
    }
  }

  private async streamOne(
    id: string,
    buildId: string,
    intent: string,
    usesScreen: boolean,
    themeKey: ThemeKey,
    buildKey: PrototypeKey,
    totalMs: number,
    my: number,
    variant?: VariantInfo,
    baseline = false,
  ): Promise<void> {
    // The GPU baseline build needs BASELINE_* configured; skip (don't fake) if absent.
    if (baseline && config.agents !== "mock" && !getBaseline()) {
      console.warn("[ab] BASELINE_* not configured — skipping GPU baseline build");
      return;
    }
    this.send({ type: "prototype.start", id, buildId, intent, usesScreen, themeKey, variant });
    const alive = (): boolean => my === this.runId;
    const onToken = (delta: string): void => this.send({ type: "prototype.token", id, delta });

    let html: string, ms: number, tokPerS: number, tokens: number;
    if (config.agents === "mock") {
      const r = await mockStream(buildPrototype(buildKey, THEMES[themeKey]), totalMs, onToken, alive);
      ({ html, ms, tokPerS, tokens } = r);
    } else {
      // Inject THIS variant's design language (not runtime.learned, which is null
      // on the first build) so the fan-out yields three visually distinct designs.
      // On later single builds, themeKey is already the learned theme's key.
      // baseline=true routes the build through the GPU baseline model (honest A/B).
      const screenshot = usesScreen ? this.runtime.latestScreenDataUri : null;
      const transcript = withContext(this.transcript.join("\n"), this.runtime.contextSummary());
      const r = await liveStream(intent, transcript, THEMES[themeKey], screenshot, onToken, baseline ? getBaseline()! : undefined);
      ({ html, ms, tokPerS, tokens } = r);
    }
    if (!alive()) return;
    this.telemetry("prototype", tokPerS, tokens);
    this.send({ type: "prototype.complete", id, buildId, html, ideaToArtifactMs: ms, themeKey });
  }

  private async awaitPickWithTimeout(buildId: string, ms: number): Promise<ThemeKey> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<ThemeKey>((res) => {
      timer = setTimeout(() => res(RECOMMENDED), ms);
    });
    const pick = this.runtime.awaitPick(buildId).then((k) => {
      clearTimeout(timer);
      return k;
    });
    return Promise.race([pick, timeout]);
  }

  private telemetry(agent: AgentName, tokPerS: number, tokens: number): void {
    this.send({
      type: "telemetry",
      agent,
      latencyMs: Math.round((tokens / Math.max(1, tokPerS)) * 1000),
      tokens,
      tokPerS,
    });
  }
}

function withContext(transcript: string, context: string): string {
  return context ? `${context}\n\nRolling transcript:\n${transcript}` : transcript;
}
