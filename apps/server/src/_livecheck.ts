/**
 * Live smoke test — runs every agent against real Cerebras/Gemma (no mock).
 * Run from repo root:  bun apps/server/src/_livecheck.ts
 * Requires CEREBRAS_API_KEY in .env (Bun auto-loads it).
 */
import { config } from "./config";
import { getScenario } from "./source/fixtures";
import { routeLive } from "./agents/router";
import { summarizeLive } from "./agents/summarizer";
import { factcheckLive } from "./agents/factcheck";
import { liveStream } from "./agents/prototype";
import { THEMES, type MeetingSummary } from "@sidebar/shared";

const ok = (b: boolean): string => (b ? "✅" : "❌");
const ms = () => performance.now();

async function main(): Promise<void> {
  console.log(`\n▚ livecheck — model=${config.modelId} key=${config.cerebrasApiKey ? "set" : "MISSING"}\n`);
  if (!config.cerebrasApiKey) throw new Error("CEREBRAS_API_KEY missing");

  const scn = getScenario("sprint-planning");
  const transcript: string[] = [];
  let summary: MeetingSummary | null = null;

  // 1) ROUTER — run on every expect-bearing segment, compare trigger flags vs gold.
  console.log("── ROUTER ──");
  for (const seg of scn.segments) {
    transcript.push(`${seg.speaker}: ${seg.text}`);
    if (!seg.expect) continue;
    const t0 = ms();
    const d = await routeLive(seg.text, JSON.stringify(summary ?? {}));
    const dt = Math.round(ms() - t0);
    const g = seg.expect.router;
    const match =
      d.prototype.trigger === g.prototype.trigger &&
      d.summary_update === g.summary_update &&
      d.factcheck.trigger === g.factcheck.trigger;
    console.log(
      `${ok(match)} ${dt}ms  "${seg.text.slice(0, 48)}…"\n` +
        `     live: proto=${d.prototype.trigger} sum=${d.summary_update} fact=${d.factcheck.trigger} screen=${d.prototype.uses_screen}` +
        `  intent="${d.prototype.intent}"\n` +
        `     gold: proto=${g.prototype.trigger} sum=${g.summary_update} fact=${g.factcheck.trigger}`,
    );

    if (d.summary_update) {
      summary = await summarizeLive(transcript.join("\n"), summary);
    }
  }

  // 2) SUMMARIZER — show the final rolling summary it built.
  console.log("\n── SUMMARIZER (final rolling state) ──");
  console.log(JSON.stringify(summary, null, 2));
  const sumOk = !!summary && Array.isArray(summary.decisions) && Array.isArray(summary.action_items);
  console.log(ok(sumOk), "summary shape valid");

  // 3) PROTOTYPE (hero) — stream real HTML, measure idea→artifact latency + tok/s.
  console.log("\n── PROTOTYPE (hero, live stream) ──");
  let tokens = 0;
  const t0 = ms();
  const r = await liveStream(
    "Kanban board with drag-and-drop columns and a sprint burndown chart",
    transcript.join("\n"),
    null,
    null,
    () => { tokens++; },
  );
  const startsOk = r.html.trim().startsWith("<!DOCTYPE html") || r.html.trim().startsWith("<!doctype html");
  const hasBody = /<body[\s>]/i.test(r.html);
  console.log(`${ok(startsOk && hasBody)} ${r.ms}ms  ~${r.tokens} tok  ${r.tokPerS} tok/s  (${tokens} stream deltas, ${r.html.length} chars)`);
  console.log(`     starts<!DOCTYPE>=${startsOk}  has<body>=${hasBody}  wall=${Math.round(ms() - t0)}ms`);

  // 3b) Learned-style build — inject a theme, confirm it still produces a doc.
  const t1 = ms();
  const r2 = await liveStream("Same board, restyled", transcript.join("\n"), THEMES.neon, null, () => {});
  console.log(`${ok(r2.html.toLowerCase().includes("<!doctype"))} learned(neon) ${r2.ms}ms ${r2.tokPerS} tok/s`);

  // 4) FACTCHECK — the growth-review contradiction claim.
  console.log("\n── FACTCHECK ──");
  const fc = await factcheckLive(["Our churn is under 2% — best in the category"]);
  console.log(JSON.stringify(fc, null, 2));
  console.log(ok(Array.isArray(fc.checks) && fc.checks.length > 0), "factcheck shape valid");

  console.log("\n▚ livecheck done.\n");
}

main().catch((e) => {
  console.error("\n❌ livecheck FAILED:", e?.message ?? e);
  if (e?.cause) console.error("   cause:", e.cause);
  process.exit(1);
});
