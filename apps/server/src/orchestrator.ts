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
  type PrototypeReview,
  type ReviewIssue,
} from "@sidebar/shared";
import { mockStream, liveStream, evolveStream, getBaseline, type StreamResult } from "./agents/prototype";
import { routeLive } from "./agents/router";
import { summarizeLive } from "./agents/summarizer";
import { factcheckLive } from "./agents/factcheck";
import { reviewLive, reviewMock } from "./agents/critic";
import { nextStepsLive, nextStepsMock } from "./agents/nextsteps";
import { finalDocLive, buildRecapHtml, type RecapInput } from "./agents/finaldoc";
import { prototypeModel } from "./llm";

/** A completed prototype kept in memory — the base for the next evolution and the
 *  source for the final recap's artifact gallery. */
interface BuiltArtifact {
  id: string;
  buildId: string;
  intent: string;
  themeKey: ThemeKey;
  html: string;
  variant?: VariantInfo;
}

const RATE = 0.6; // compress fixture pacing for a snappier replay
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let buildSeq = 0;
let liveTurnSeq = 0;
/** Max review rounds per artifact: review (1) → refine → re-review (2) → refine → re-review (3). */
const MAX_REVIEW_PASSES = 3;

/** Compile a critic's fixable issues into a single edit instruction for the evolve pass. */
function compileChange(issues: ReviewIssue[]): string {
  const lines = issues.map((it, i) => `${i + 1}. [${it.severity}/${it.area}] ${it.what} — FIX: ${it.fix}`);
  return (
    "A reviewer flagged these fixable issues in the current prototype. Apply the smallest set of " +
    "edits that fixes ALL of them while preserving everything that already works:\n" +
    lines.join("\n")
  );
}

/** Safe "do nothing" decision used when a live router call fails — skips the turn. */
const NOOP_DECISION: RouterDecision = {
  topic_shift: false,
  summary_update: false,
  prototype: { trigger: false, intent: "", uses_screen: false },
  factcheck: { trigger: false, claims: [] },
};
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Reject after `ms` if `p` hasn't settled — so a slow/hung agent call can't spin forever.
 *  (The underlying request may keep running; this only unblocks the caller + the UI.) */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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
  /** True while a first-build fan-out is on screen waiting for the room to pick a
   *  design direction (live mode only — mock auto-picks). Blocks a second fan-out
   *  from stacking, and is resolved off the segment queue so the transcript keeps flowing. */
  private awaitingPick = false;
  /** Prototypes built this meeting — the latest is the base for the next evolution,
   *  and all of them are embedded in the final recap document. */
  private artifacts: BuiltArtifact[] = [];
  private lastTitle = "Live Meeting";
  /** Artifacts already repaired once from a client render-failure report. The LOOP GUARD:
   *  a page is auto-repaired at most once, so a persistently-broken render can't ping-pong. */
  private renderRepaired = new Set<string>();

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
    this.artifacts = [];
    this.renderRepaired.clear();
    this.liveQueue = Promise.resolve();
    this.awaitingPick = false;
    liveTurnSeq = 0;
  }

  /**
   * Closing agent: draft the final meeting document — a themed, self-contained HTML
   * recap — and stream it to the whole room as `finaldoc.*` events. Called once when
   * the host ends the meeting; reads the PRESERVED transcript + rolling summary +
   * accepted file context (the room sets `ended` so no new turns mutate them).
   * Mock mode assembles the recap deterministically; live mode streams from Cerebras.
   * Honours the runId guard, so a subsequent clear/start cancels a stale draft.
   */
  async finalizeDocument(): Promise<void> {
    const my = this.runId; // endMeeting bumped runId via stop(); a later bump cancels this
    const id = `doc-${buildSeq}-${liveTurnSeq}`;
    this.send({ type: "finaldoc.start", id });

    const input: RecapInput = {
      title: this.lastTitle,
      summary: this.summary ?? summarizeMock(this.transcript, null),
      transcript: this.transcript.join("\n"),
      context: this.runtime.contextSummary(),
      artifacts: this.artifacts.map((a) => ({ intent: a.intent, html: a.html, themeKey: a.themeKey })),
      theme: this.runtime.learned,
    };
    const alive = (): boolean => my === this.runId;
    const onToken = (delta: string): void => {
      if (alive()) this.send({ type: "finaldoc.token", id, delta });
    };

    let result: StreamResult;
    if (config.agents === "mock") {
      result = await mockStream(buildRecapHtml(input), 2600, onToken, alive);
    } else {
      try {
        result = await finalDocLive(input, onToken);
        // A stream that completes but yields no usable HTML must NOT silently produce a
        // blank recap — fall back to the deterministic doc (the catch handles it).
        if (!result.html.trim()) throw new Error("empty final-doc html");
      } catch (err) {
        console.error("[finaldoc] live call failed", errMsg(err));
        result = await mockStream(buildRecapHtml(input), 1600, onToken, alive);
      }
    }
    if (!alive()) return;
    this.send({ type: "finaldoc.complete", id, html: result.html, ms: result.ms });
  }

  async start(scenarioId?: string): Promise<void> {
    const my = ++this.runId;
    const scn = getScenario(scenarioId ?? config.scenario);
    this.transcript = [];
    this.summary = null;
    this.artifacts = [];
    this.awaitingPick = false;
    this.lastTitle = scn.title;
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
    this.artifacts = [];
    this.lastTitle = title;
    this.liveQueue = Promise.resolve();
    this.awaitingPick = false;
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

  /** A user clicked one of the generated next-step buttons under a prototype. Treat
   *  that as an explicit prototype evolution request, bypassing the router. */
  requestPrototypeNext(artifactId: string, intent: string, speaker?: string): void {
    const clean = intent.replace(/\s+/g, " ").trim().slice(0, 240);
    if (!clean) return;
    const my = this.runId;
    const by = speaker?.trim() || "Host";
    this.liveQueue = this.liveQueue
      .then(() => this.buildSuggestedNext(artifactId, clean, by, my))
      .catch((err) => {
        console.error("[nextstep] suggested prototype failed", errMsg(err));
      });
  }

  private send(ev: ServerEvent): void {
    this.runtime.send(ev);
  }

  private async playSegment(seg: FixtureSegment, my: number, paced = true): Promise<void> {
    // A queued live segment may resume after the run was cancelled (stop/end/clear bumps
    // runId). Bail before emitting transcript.final or mutating this.transcript so nothing
    // lands after a meeting has ended.
    if (my !== this.runId) return;
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
    // Live mode waits for a human to pick the design DNA (no auto-pick). While that
    // first fan-out is still on screen, skip new fan-outs so we don't stack competing
    // first-builds before a direction is locked in.
    if (!this.runtime.learned && this.awaitingPick) return;

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
      // Partner agent polishes EVERY variant in the background, in place — the variant
      // cards keep updating while the room studies them and picks a direction.
      for (const a of this.artifacts.filter((x) => x.buildId === buildId)) {
        void this.reviewAndRefine(a, my).finally(() => {
          void this.suggestNextSteps(a, my);
        });
      }
      if (config.agents === "mock") {
        // Unattended fixture replay: auto-pick the recommended theme after a short beat.
        const chosen = await this.awaitPickWithTimeout(buildId, 4200);
        if (my !== this.runId) return;
        this.resolveFanout(buildId, chosen, my);
      } else {
        // Live: let the room decide in their own time — no auto-pick. Resolve OFF the
        // segment queue so the transcript / summary keep flowing while people choose.
        this.awaitingPick = true;
        void this.runtime.awaitPick(buildId).then((chosen) => {
          this.resolveFanout(buildId, chosen, my);
        });
      }
    } else {
      const theme = this.runtime.learned.key;
      // Every later build EVOLVES the current artifact (clone + edit) instead of starting
      // from a blank canvas — so the agent can actually iterate on what's on screen.
      const base = this.currentArtifact();
      // A/B: race Cerebras and the GPU baseline concurrently so both timers run live.
      const tasks = [this.streamOne(`${buildId}-cer`, buildId, intent, usesScreen, theme, buildKey, 1800, my, undefined, false, base)];
      if (this.runtime.abMode) {
        tasks.push(this.streamOne(`${buildId}-gpu`, buildId, intent, usesScreen, theme, buildKey, 9200, my, undefined, true, base));
      }
      await Promise.all(tasks);
      if (my !== this.runId) return;
      // Single learned-style build: review + refine before returning, so the next
      // evolution clones the polished artifact (and the recap embeds the polished one).
      const built = this.currentArtifact();
      if (built && built.buildId === buildId) {
        await this.reviewAndRefine(built, my);
        await this.suggestNextSteps(built, my);
      }
    }
  }

  private async buildSuggestedNext(artifactId: string, intent: string, speaker: string, my: number): Promise<void> {
    if (my !== this.runId || !this.runtime.agents.prototype) return;
    const base = this.artifacts.find((a) => a.id === artifactId) ?? this.currentArtifact();
    if (!base) return;

    // Clicking a suggestion under a first-pass variant should count as choosing that
    // design direction before we evolve it.
    if (!this.runtime.learned && base.variant) {
      this.resolveFanout(base.buildId, base.themeKey, my);
      this.runtime.resolvePick(base.buildId, base.themeKey);
    }

    const text = `Next step: ${intent}`;
    this.send({ type: "transcript.final", text, ts: Date.now(), speaker });
    this.transcript.push(`${speaker}: ${text}`);

    const buildId = `b${++buildSeq}`;
    const theme = this.runtime.learned?.key ?? base.themeKey;
    const buildKey: PrototypeKey = inferPrototypeKey(`${intent} ${base.intent}`);
    const usesScreen = false;
    const tasks = [this.streamOne(`${buildId}-cer`, buildId, intent, usesScreen, theme, buildKey, 1800, my, undefined, false, base)];
    if (this.runtime.abMode) {
      tasks.push(this.streamOne(`${buildId}-gpu`, buildId, intent, usesScreen, theme, buildKey, 9200, my, undefined, true, base));
    }
    await Promise.all(tasks);
    if (my !== this.runId) return;
    const built = this.currentArtifact();
    if (built && built.buildId === buildId) {
      await this.reviewAndRefine(built, my);
      await this.suggestNextSteps(built, my);
    }
  }

  private async suggestNextSteps(a: BuiltArtifact, my: number): Promise<void> {
    if (my !== this.runId || !this.runtime.agents.nextstep || !this.hasArtifact(a.id) || !a.html.trim()) return;
    this.send({ type: "nextsteps.start", id: a.id, buildId: a.buildId });
    this.telemetry("nextstep", 720, 140);
    const theme = THEMES[a.themeKey];
    const transcript = withContext(this.transcript.join("\n"), this.runtime.contextSummary());
    try {
      const suggestions =
        config.agents === "mock"
          ? await nextStepsMock(a.intent)
          : await withTimeout(nextStepsLive(a.intent, transcript, a.html, theme), 8_000, "next-step suggestions timed out");
      if (my !== this.runId || !this.hasArtifact(a.id)) return;
      this.send({ type: "nextsteps.result", id: a.id, buildId: a.buildId, suggestions });
    } catch (err) {
      console.error("[nextstep] suggestions failed", errMsg(err));
      if (my === this.runId && this.hasArtifact(a.id)) this.send({ type: "nextsteps.error", id: a.id, buildId: a.buildId });
    }
  }

  /**
   * Partner / critic loop: review a built artifact against the intent, and while the
   * critic asks to `refine`, apply an edit pass (reuses the SEARCH/REPLACE evolve path)
   * and re-review — up to MAX_REVIEW_PASSES. Mutates the artifact's HTML in place so it
   * becomes the base for the next evolution and the version embedded in the recap.
   * Emits `critic.*` so the UI can show the reviewer working. Honours the runId guard.
   */
  private async reviewAndRefine(a: BuiltArtifact, my: number): Promise<void> {
    const theme = THEMES[a.themeKey];
    const transcript = withContext(this.transcript.join("\n"), this.runtime.contextSummary());
    for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
      if (my !== this.runId) return;
      this.send({ type: "critic.start", id: a.id, buildId: a.buildId, pass });

      let review: PrototypeReview;
      try {
        review =
          config.agents === "mock"
            ? await reviewMock(a.intent)
            : await withTimeout(reviewLive(a.intent, transcript, a.html, theme), 12_000, "review timed out");
      } catch (err) {
        console.error("[critic] review failed", errMsg(err));
        // Settle the UI so the "reviewing…" chip clears instead of spinning forever.
        if (my === this.runId) this.send({ type: "critic.error", id: a.id, buildId: a.buildId });
        return; // never block on a failed/slow review
      }
      if (my !== this.runId) return;

      const willRefine = config.agents !== "mock" && review.verdict === "refine" && review.issues.length > 0 && pass < MAX_REVIEW_PASSES;
      this.send({ type: "critic.result", id: a.id, buildId: a.buildId, pass, review, final: !willRefine });
      if (!willRefine) return;

      // Refine: edit the current document to address the flagged issues.
      try {
        const r = await evolveStream(a.html, compileChange(review.issues), transcript, theme, null, () => {}, prototypeModel());
        if (my !== this.runId) return;
        if (r.html && r.html !== a.html) {
          a.html = r.html; // base for the next evolution + the recap
          this.send({ type: "critic.refined", id: a.id, buildId: a.buildId, pass, html: r.html, ms: r.ms });
        } else {
          // The edit couldn't be applied (no-op) — settle the UI as reviewed and stop.
          this.send({ type: "critic.result", id: a.id, buildId: a.buildId, pass, review, final: true });
          return;
        }
      } catch (err) {
        console.error("[critic] refine failed", errMsg(err));
        this.send({ type: "critic.result", id: a.id, buildId: a.buildId, pass, review, final: true });
        return;
      }
    }
  }

  /**
   * Repair a prototype whose LIVE iframe reported runtime/CDN/load failures (things the
   * static critic can't see — a script that 404'd, Tailwind that never initialized, a JS
   * throw). Runs ONE evolve pass targeting those exact errors, surfaced through the same
   * `critic.*` UI as the partner agent. Host-gated at the call site.
   *
   * LOOP GUARD: each artifact is repaired at most once (`renderRepaired`). If the page is
   * STILL broken after the fix, the next report is ignored — we surface + attempt once,
   * never ping-pong. (Also no-op in mock mode and when the artifact/build is unknown.)
   */
  async repairRender(artifactId: string, buildId: string, errors: string[]): Promise<void> {
    if (config.agents === "mock" || !errors.length) return;
    const a = this.artifacts.find((x) => x.id === artifactId && x.buildId === buildId);
    if (!a || this.renderRepaired.has(artifactId)) return;
    this.renderRepaired.add(artifactId);

    const my = this.runId;
    const theme = THEMES[a.themeKey];
    const transcript = withContext(this.transcript.join("\n"), this.runtime.contextSummary());
    const change =
      "The rendered prototype reported these BROWSER runtime/load failures. Fix them so it renders " +
      "correctly — correct or replace a failed resource URL, guard against the missing dependency, or " +
      "inline a minimal fallback. Change as little else as possible:\n" +
      errors.slice(0, 8).map((e, i) => `${i + 1}. ${e}`).join("\n");

    this.send({ type: "critic.start", id: a.id, buildId, pass: 1 });
    try {
      const r = await withTimeout(
        evolveStream(a.html, change, transcript, theme, null, () => {}, prototypeModel()),
        30_000,
        "render repair timed out",
      );
      if (my !== this.runId) return;
      if (r.html && r.html !== a.html) {
        a.html = r.html; // base for the next evolution + the recap
        this.send({ type: "critic.refined", id: a.id, buildId, pass: 1, html: r.html, ms: r.ms });
      }
      this.send({
        type: "critic.result",
        id: a.id,
        buildId,
        pass: 1,
        review: {
          verdict: "ship",
          score: 0.8,
          summary: `Repaired ${errors.length} render issue${errors.length === 1 ? "" : "s"} reported by the browser.`,
          issues: [],
        },
        final: true,
      });
    } catch (err) {
      console.error("[repair] render repair failed", errMsg(err));
      if (my === this.runId) this.send({ type: "critic.error", id: a.id, buildId });
    }
  }

  private currentArtifact(): BuiltArtifact | undefined {
    return this.artifacts[this.artifacts.length - 1];
  }

  private recordArtifact(a: BuiltArtifact): void {
    this.artifacts.push(a);
  }

  private hasArtifact(id: string): boolean {
    return this.artifacts.some((a) => a.id === id);
  }

  /** Resolve a fan-out once, whether the room clicked "use this design" or a
   *  suggestion button under a variant implicitly chose that direction. */
  private resolveFanout(buildId: string, chosen: ThemeKey, my: number): void {
    const stillHasVariants = this.artifacts.some((a) => a.buildId === buildId && a.variant);
    if (!this.awaitingPick && !stillHasVariants) return;
    this.awaitingPick = false;
    if (my !== this.runId) return;
    this.pruneFanout(buildId, chosen);
    this.runtime.learn(chosen);
    this.send({ type: "fanout.resolved", buildId, chosenThemeKey: chosen });
  }

  /** After a fan-out pick, drop the losing variants so the chosen one is the base for
   *  the next evolution and the only entry in the recap for that build. */
  private pruneFanout(buildId: string, chosen: ThemeKey): void {
    this.artifacts = this.artifacts
      .filter((a) => a.buildId !== buildId || a.themeKey === chosen)
      .map((a) => (a.buildId === buildId && a.themeKey === chosen ? { ...a, variant: undefined } : a));
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
    base?: BuiltArtifact,
  ): Promise<void> {
    // The GPU baseline build needs BASELINE_* configured; skip (don't fake) if absent.
    if (baseline && config.agents !== "mock" && !getBaseline()) {
      console.warn("[ab] BASELINE_* not configured — skipping GPU baseline build");
      return;
    }
    // Evolve mode = a live build cloned from an existing artifact. The client seeds the
    // new card with the base HTML (no blank canvas), and the agent returns edit blocks —
    // so we DON'T stream raw edit-block tokens into the rendered iframe.
    const evolving = !!base && config.agents !== "mock";
    this.send({ type: "prototype.start", id, buildId, intent, usesScreen, themeKey, variant, baseId: evolving ? base!.id : undefined });
    const alive = (): boolean => my === this.runId;
    const onToken = evolving ? (): void => {} : (delta: string): void => this.send({ type: "prototype.token", id, delta });

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
      const model = baseline ? getBaseline()! : undefined;
      const r = evolving
        ? await evolveStream(base!.html, intent, transcript, THEMES[themeKey], screenshot, onToken, model)
        : await liveStream(intent, transcript, THEMES[themeKey], screenshot, onToken, model);
      ({ html, ms, tokPerS, tokens } = r);
    }
    if (!alive()) return;
    this.telemetry("prototype", tokPerS, tokens);
    this.send({ type: "prototype.complete", id, buildId, html, ideaToArtifactMs: ms, themeKey });
    // Remember the canonical (non-baseline) build: base for the next evolution + recap.
    if (!baseline) this.recordArtifact({ id, buildId, intent, themeKey, html, variant });
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
