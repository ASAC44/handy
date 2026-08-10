/**
 * NATIVE reasoning experiment: Cerebras gemma-4-31b supports `reasoning_effort`
 * (none=default → off; low/medium/high → on, returned in a separate `reasoning` field).
 * universal-llm-client never auto-sends it for gemma, but defaultParameters pass through
 * and the provider already parses `reasoning` back out — so this needs NO library change.
 *
 *   bun scripts/reasoning-effort-exp.ts
 *
 * Part 1 — probes: does native reasoning fix hard cases UNDER strict JSON output?
 * Part 2 — prototypes: does it produce more advanced/complete code, and at what latency?
 */
import { AIModel } from "universal-llm-client";

const apiKey = process.env.CEREBRAS_API_KEY ?? "";
const modelId = process.env.MODEL_ID ?? "gemma-4-31b";
const url = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai";
if (!apiKey) throw new Error("no CEREBRAS_API_KEY in env");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const model = (effort: string, maxTokens: number, temp: number): AIModel =>
  new AIModel({
    model: modelId, thinking: false, providers: [{ type: "openai", url, apiKey }], timeout: 180_000,
    // reasoning_effort rides in defaultParameters → the OpenAI-compat provider forwards it verbatim.
    defaultParameters: { temperature: temp, top_p: 0.95, max_tokens: maxTokens, reasoning_effort: effort },
  });

let lastCall = 0;
const MIN_GAP = 1300;
async function call(m: AIModel, messages: unknown, opts?: unknown): Promise<{ content: string; outTok?: number; reasoning?: string }> {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, MIN_GAP - (performance.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = performance.now();
    try {
      const r = (await m.chat(messages as never, opts as never)) as { message: { content?: string }; usage?: { outputTokens?: number }; reasoning?: string };
      return { content: r.message.content ?? "", outTok: r.usage?.outputTokens, reasoning: r.reasoning };
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("429") && attempt < 5) { const b = 4000 * 2 ** attempt; console.error(`  429 backoff ${b}ms`); await sleep(b); continue; }
      throw e;
    }
  }
}

// ---------- Part 1: probes ----------
const PROBES = [
  { q: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost, in dollars?", a: "0.05" },
  { q: "How many times does the letter 'r' appear in the word 'strawberry'?", a: "3" },
  { q: "If today is Wednesday, what day of the week was it 100 days ago?", a: "Monday" },
  { q: "Which number is larger: 9.11 or 9.9?", a: "9.9" },
  { q: "A store sells pencils at 7 for $2. How much does it cost to buy 35 pencils, in dollars?", a: "10" },
  { q: "Twelve people each shake hands with every other person exactly once. How many handshakes happen in total?", a: "66" },
  { q: "A train travels 60 km in 45 minutes. What is its speed in km/h?", a: "80" },
  { q: "What is the next number in the sequence: 2, 6, 12, 20, 30, ?", a: "42" },
  { q: "How many positive divisors does 36 have?", a: "9" },
  { q: "How many times does the digit 9 appear when writing all the page numbers from 1 to 100?", a: "20" },
  { q: "Three consecutive integers sum to 72. What is the largest of the three?", a: "25" },
  { q: "Sally has 3 brothers. Each brother has 2 sisters. How many sisters does Sally have?", a: "1" },
];
const norm = (s: string): string => s.toLowerCase().replace(/[$,\s]/g, "").replace(/^the/, "").trim();
function correct(got: string, want: string): boolean {
  const g = norm(got), w = norm(want);
  if (g === w) return true;
  const gf = parseFloat(g), wf = parseFloat(w);
  if (!Number.isNaN(gf) && !Number.isNaN(wf)) return Math.abs(gf - wf) < 1e-6;
  return g.includes(w);
}
const RF = { responseFormat: { type: "json_schema", json_schema: { name: "ans", strict: true, schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } } };

async function probes(effort: string) {
  const m = model(effort, 4096, 0.3);
  let hits = 0, ms = 0, rtok = 0, n = 0;
  const misses: string[] = [];
  for (const p of PROBES) {
    const t0 = performance.now();
    try {
      const r = await call(m, [{ role: "system", content: "You answer carefully and correctly." }, { role: "user", content: p.q }], RF);
      const got = String(JSON.parse((r.content.match(/\{[\s\S]*\}/) || ["{}"])[0]).answer ?? "");
      n++; ms += performance.now() - t0; rtok += Math.round((r.reasoning?.length ?? 0) / 4);
      if (correct(got, p.a)) hits++; else misses.push(`${p.q.slice(0, 28)}… got=${JSON.stringify(got)} want=${p.a}`);
    } catch (e) { n++; misses.push(`${p.q.slice(0, 28)}… ERR ${(e as Error).message.slice(0, 40)}`); }
  }
  return { effort, acc: (hits / n) * 100, hits, n, ms: ms / n, rtok: rtok / n, misses };
}

// ---------- Part 2: prototypes ----------
const INTENTS = [
  "A kanban board with drag-and-drop between To Do / In Progress / Done columns, cards with story points and assignees, and a live burndown chart.",
  "A real-time analytics dashboard: a revenue line chart, a churn gauge, MRR summary cards, and a sortable, filterable customer table.",
  "A pomodoro focus timer with start/pause/reset, an animated circular progress ring, configurable work/break lengths, and a task checklist.",
];
const PROTO_SYS = "You are a real-time prototyping agent. Produce ONE self-contained HTML document (inline CSS+JS, deps only from https://cdnjs.cloudflare.com) that is a complete, genuinely interactive proof-of-concept: realistic sample data, every described control wired with working JS, no placeholders. Output ONLY the HTML starting with <!DOCTYPE html>. No markdown fences.";
function extractHtml(s: string): string {
  let h = s.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const st = h.search(/<!doctype html|<html[\s>]/i); if (st > 0) h = h.slice(st);
  const e = h.toLowerCase().lastIndexOf("</html>"); if (e !== -1) h = h.slice(0, e + 7);
  return h.trim();
}
const cnt = (s: string, re: RegExp) => (s.match(re) || []).length;
function analyze(html: string) {
  return {
    complete: /<\/html>\s*$/i.test(html),
    bytes: html.length,
    els: cnt(html, /<button|<input|<select|<textarea|<canvas|<svg|draggable\s*=/gi),
    adv: [/<canvas[\s>]/i, /<svg[\s>]/i, /requestAnimationFrame/, /drag(start|over|end)/i, /localStorage/, /@keyframes/i, /@media/i, /cdnjs/i].filter((re) => re.test(html)).length,
  };
}
const JUDGE_RF = { responseFormat: { type: "json_schema", json_schema: { name: "j", strict: true, schema: { type: "object", properties: { assessment: { type: "string" }, completeness: { type: "integer" }, interactivity: { type: "integer" }, sophistication: { type: "integer" }, overall: { type: "integer" } }, required: ["assessment", "completeness", "interactivity", "sophistication", "overall"], additionalProperties: false } } } };
async function judge(intent: string, html: string): Promise<number> {
  const jm = model("none", 1024, 0.2);
  const r = await call(jm, [
    { role: "system", content: "Strictly judge this HTML prototype vs the intent. Score 0-100: completeness, interactivity, sophistication, overall. FIRST fill `assessment` with terse reasoning, THEN the scores. Reserve 80+ for genuinely strong work." },
    { role: "user", content: `INTENT: ${intent}\n\nHTML:\n${html.slice(0, 14000)}` },
  ], JUDGE_RF);
  return JSON.parse((r.content.match(/\{[\s\S]*\}/) || ["{}"])[0]).overall ?? 0;
}
async function protos(effort: string) {
  const m = model(effort, 16384, 1.0);
  let overall = 0, els = 0, adv = 0, complete = 0, ms = 0, otok = 0, rtok = 0, n = 0;
  for (const intent of INTENTS) {
    const t0 = performance.now();
    try {
      const r = await call(m, [{ role: "system", content: PROTO_SYS }, { role: "user", content: `Idea (intent): ${intent}\nOutput the document now.` }]);
      const html = extractHtml(r.content); const a = analyze(html); const o = await judge(intent, html);
      n++; overall += o; els += a.els; adv += a.adv; complete += a.complete ? 1 : 0; ms += performance.now() - t0; otok += r.outTok ?? 0; rtok += Math.round((r.reasoning?.length ?? 0) / 4);
      console.log(`  [effort=${effort}] ${intent.slice(0, 26)}… overall=${o} complete=${a.complete ? "Y" : "N"} els=${a.els} adv=${a.adv}/8 reasoning≈${Math.round((r.reasoning?.length ?? 0) / 4)}tok ${Math.round(performance.now() - t0)}ms`);
    } catch (e) { console.error(`  [effort=${effort}] FAIL ${(e as Error).message.slice(0, 60)}`); }
  }
  return { effort, overall: overall / n, els: els / n, adv: adv / n, donePct: (complete / n) * 100, ms: ms / n, otok: otok / n, rtok: rtok / n };
}

async function main() {
  console.log(`model=${modelId}\n\n=== PART 1: probes (strict JSON {answer}) ===`);
  const p: Awaited<ReturnType<typeof probes>>[] = [];
  for (const e of ["none", "low", "medium"]) p.push(await probes(e));
  console.log("\neffort   acc      hits   avg_ms   reasoning_tok");
  console.log("-".repeat(50));
  for (const r of p) console.log(`${r.effort.padEnd(7)} ${r.acc.toFixed(0).padStart(3)}%    ${r.hits}/${r.n}   ${Math.round(r.ms).toString().padStart(6)}   ${Math.round(r.rtok).toString().padStart(6)}`);
  for (const r of p) if (r.misses.length) console.log(`\n[effort=${r.effort}] misses:\n  ` + r.misses.join("\n  "));

  console.log("\n\n=== PART 2: prototypes ===");
  const q: Awaited<ReturnType<typeof protos>>[] = [];
  for (const e of ["none", "medium"]) q.push(await protos(e));
  console.log("\neffort   overall  els   adv/8  done%   gen_ms   out_tok  reasoning_tok");
  console.log("-".repeat(72));
  for (const r of q) console.log(`${r.effort.padEnd(7)} ${r.overall.toFixed(0).padStart(6)}  ${r.els.toFixed(1).padStart(4)}  ${r.adv.toFixed(1).padStart(4)}  ${r.donePct.toFixed(0).padStart(5)}  ${Math.round(r.ms).toString().padStart(6)}  ${Math.round(r.otok).toString().padStart(6)}  ${Math.round(r.rtok).toString().padStart(6)}`);
}
await main();
