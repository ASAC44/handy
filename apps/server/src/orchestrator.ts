import { config } from "./config";
import type { Session } from "./session";
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
import { mockStream, liveStream } from "./agents/prototype";
import { routeLive } from "./agents/router";
import { summarizeLive } from "./agents/summarizer";
import { factcheckLive } from "./agents/factcheck";

const RATE = 0.6; // compress fixture pacing for a snappier replay
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let buildSeq = 0;

/**
 * Drives a meeting end-to-end: streams the transcript (from fixtures for now),
 * runs the router + agents (mock = fixture gold labels, live = Cerebras), and
 * orchestrates the prototype fan-out → pick → learn loop.
 */
export class Orchestrator {
  private runId = 0;
  private transcript: string[] = [];
  private summary: MeetingSummary | null = null;

  constructor(private session: Session) {}

  stop(): void {
    this.runId++;
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

  private send(ev: ServerEvent): void {
    this.session.send(ev);
  }

  private async playSegment(seg: FixtureSegment, my: number): Promise<void> {
    if (seg.partials) {
      for (const p of seg.partials) {
        if (my !== this.runId) return;
        this.send({ type: "transcript.partial", text: p, ts: Date.now(), speaker: seg.speaker });
        await sleep(460 * RATE);
      }
    }
    this.send({ type: "transcript.final", text: seg.text, ts: Date.now(), speaker: seg.speaker });
    this.transcript.push(`${seg.speaker}: ${seg.text}`);
    await sleep(Math.max(500, seg.ms * RATE));
    if (my !== this.runId || !seg.expect) return;

    const decision = await this.router(seg);
    if (my !== this.runId) return;
    this.send({ type: "router.decision", decision });

    if (decision.summary_update) {
      const summary = await this.summarize(seg);
      if (summary) {
        this.summary = summary;
        this.send({ type: "summary.update", summary });
      }
    }
    if (decision.factcheck.trigger) {
      const result = await this.factcheck(seg, decision.factcheck.claims);
      if (result) this.send({ type: "factcheck.result", result });
    }
    if (decision.prototype.trigger) {
      await this.build(seg, decision, my);
    }
    await sleep(400);
  }

  private async router(seg: FixtureSegment): Promise<RouterDecision> {
    this.telemetry("router", 950, 180);
    if (config.agents === "mock") return seg.expect!.router;
    return routeLive(seg.text, JSON.stringify(this.summary ?? {}));
  }

  private async summarize(seg: FixtureSegment): Promise<MeetingSummary | null> {
    this.telemetry("summarizer", 760, 520);
    if (config.agents === "mock") return seg.expect!.summary ?? this.summary;
    return summarizeLive(this.transcript.join("\n"), this.summary);
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
    const buildKey: PrototypeKey = seg.expect!.prototype?.build ?? "kanban";
    const intent = decision.prototype.intent || seg.expect!.prototype?.intent || "Prototype";
    const usesScreen = decision.prototype.uses_screen;
    const buildId = `b${++buildSeq}`;

    if (!this.session.learned) {
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
      this.session.learn(chosen);
      this.send({ type: "fanout.resolved", buildId, chosenThemeKey: chosen });
    } else {
      const theme = this.session.learned.key;
      await this.streamOne(`${buildId}-cer`, buildId, intent, usesScreen, theme, buildKey, 1800, my);
      if (this.session.abMode) {
        await this.streamOne(`${buildId}-gpu`, buildId, intent, usesScreen, theme, buildKey, 9200, my);
      }
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
  ): Promise<void> {
    this.send({ type: "prototype.start", id, buildId, intent, usesScreen, themeKey, variant });
    const alive = (): boolean => my === this.runId;
    const onToken = (delta: string): void => this.send({ type: "prototype.token", id, delta });

    let html: string, ms: number, tokPerS: number, tokens: number;
    if (config.agents === "mock") {
      const r = await mockStream(buildPrototype(buildKey, THEMES[themeKey]), totalMs, onToken, alive);
      ({ html, ms, tokPerS, tokens } = r);
    } else {
      // Inject THIS variant's design language (not session.learned, which is null
      // on the first build) so the fan-out yields three visually distinct designs.
      // On later single builds, themeKey is already the learned theme's key.
      const r = await liveStream(intent, this.transcript.join("\n"), THEMES[themeKey], null, onToken);
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
    const pick = this.session.awaitPick(buildId).then((k) => {
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
