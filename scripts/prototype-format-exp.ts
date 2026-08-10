/**
 * Prototype-format experiment for gemma-4-31b on Cerebras.
 *
 * Hypothesis (from the reasoning probes): the OUTPUT FORMAT, not prompt wording, is the
 * lever. Giving the model room to PLAN before emitting HTML should yield more advanced,
 * complete prototypes — "more advanced code from the format alone".
 *
 *   bun scripts/prototype-format-exp.ts [reps]
 *
 * Strategies (all same hot sampling, max_tokens=16384 so nothing truncates):
 *   direct        current prompt → HTML only                         (baseline)
 *   demand        baseline + "be ambitious / production-grade" wording (control: words, not format)
 *   plan-comment  emit a <!-- PLAN: components/interactions --> then the HTML (single call)
 *   think-html    emit <think>…plan…</think> then the HTML, stripped   (free CoT in-band)
 *   spec-build    call1: write a detailed feature spec → call2: build it (two-pass)
 *
 * Each output is scored by a strict LLM judge (itself using a reasoning-first field — we
 * dogfood the finding) plus static code-richness metrics.
 */
import { AIModel } from "universal-llm-client";

const apiKey = process.env.CEREBRAS_API_KEY ?? "";
const modelId = process.env.MODEL_ID ?? "gemma-4-31b";
const url = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai";
if (!apiKey) throw new Error("no CEREBRAS_API_KEY in env");
const reps = Number(process.argv[2] ?? 1);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const model = (maxTokens = 16384, temp = 1.0): AIModel =>
  new AIModel({ model: modelId, thinking: false, providers: [{ type: "openai", url, apiKey }], defaultParameters: { temperature: temp, top_p: 0.95, max_tokens: maxTokens }, timeout: 180_000 });

// --- rate limiter + 429 backoff (Cerebras enforces an RPM cap) ---
let lastCall = 0;
const MIN_GAP = 1300;
async function call(m: AIModel, messages: unknown, opts?: unknown): Promise<{ content: string; outTok?: number }> {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, MIN_GAP - (performance.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = performance.now();
    try {
      const r = await m.chat(messages as never, opts as never);
      return { content: r.message.content ?? "", outTok: r.usage?.outputTokens };
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("429") && attempt < 5) { const back = 4000 * 2 ** attempt; console.error(`  429 — backoff ${back}ms`); await sleep(back); continue; }
      throw e;
    }
  }
}

const BASE_SYS =
  "You are a real-time prototyping agent in a live meeting. The speaker described an idea. Produce ONE self-contained HTML document (inline CSS and JS, no external deps except scripts from https://cdnjs.cloudflare.com) that is a working, visual proof-of-concept of the idea. Output ONLY the HTML, starting with `<!DOCTYPE html>`. No markdown fences.";
const DEMAND =
  " Be ambitious: realistic sample data, real interactivity wired with JS, thoughtful layout and visual hierarchy, and polish. Avoid placeholders and dead controls — every described feature should actually work.";

const INTENTS = [
  "A kanban board with drag-and-drop between To Do / In Progress / Done columns, cards with story points and assignees, and a live burndown chart.",
  "A real-time analytics dashboard: a revenue line chart, a churn gauge, MRR summary cards, and a sortable, filterable customer table.",
  "A landing page for a developer tool: an animated hero, a feature grid, a monthly/annual pricing toggle that updates prices, and an FAQ accordion.",
  "A pomodoro focus timer with start/pause/reset, an animated circular progress ring, configurable work/break lengths, and a task checklist.",
];

interface Gen { html: string; ms: number; outTok?: number; planTok?: number }
type Strategy = (intent: string) => Promise<Gen>;

function extractHtml(s: string): string {
  let h = s.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = h.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) h = h.slice(start);
  const end = h.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) h = h.slice(0, end + 7);
  return h.trim();
}
const userMsg = (intent: string, tail: string) => [{ role: "system", content: BASE_SYS + tail }, { role: "user", content: `Idea (intent): ${intent}\nOutput the document now.` }];

const strategies: Record<string, Strategy> = {
  direct: async (intent) => {
    const t0 = performance.now();
    const r = await call(model(), userMsg(intent, ""));
    return { html: extractHtml(r.content), ms: Math.round(performance.now() - t0), outTok: r.outTok };
  },
  demand: async (intent) => {
    const t0 = performance.now();
    const r = await call(model(), userMsg(intent, DEMAND));
    return { html: extractHtml(r.content), ms: Math.round(performance.now() - t0), outTok: r.outTok };
  },
  "plan-comment": async (intent) => {
    const t0 = performance.now();
    const sys = BASE_SYS + " FIRST, at the very top, write an HTML comment `<!-- PLAN: ... -->` that lists the concrete components, the sample data, and every interaction you will implement. THEN write the full document realizing that plan exactly.";
    const r = await call(model(), userMsg(intent, "").map((m, i) => (i === 0 ? { ...m, content: sys } : m)));
    return { html: extractHtml(r.content), ms: Math.round(performance.now() - t0), outTok: r.outTok };
  },
  "think-html": async (intent) => {
    const t0 = performance.now();
    const sys = BASE_SYS + " FIRST think inside one <think>...</think> block: list components, sample data, interactions, and edge cases. THEN, after </think>, output ONLY the HTML document.";
    const r = await call(model(), userMsg(intent, "").map((m, i) => (i === 0 ? { ...m, content: sys } : m)));
    const stripped = r.content.replace(/<think>[\s\S]*?<\/think>/i, "");
    return { html: extractHtml(stripped), ms: Math.round(performance.now() - t0), outTok: r.outTok };
  },
  "spec-build": async (intent) => {
    const t0 = performance.now();
    const spec = await call(model(2048, 0.6), [
      { role: "system", content: "You are a senior product engineer. Given a prototype idea, write a concise but concrete BUILD SPEC: the components, the realistic sample data, the exact interactions/JS behaviors, and the visual style. Bulleted, implementation-ready. No code." },
      { role: "user", content: `Idea: ${intent}` },
    ]);
    const r = await call(model(), [
      { role: "system", content: BASE_SYS },
      { role: "user", content: `Idea (intent): ${intent}\n\nBUILD SPEC to implement faithfully:\n${spec.content}\n\nOutput the document now.` },
    ]);
    return { html: extractHtml(r.content), ms: Math.round(performance.now() - t0), outTok: r.outTok, planTok: spec.outTok };
  },
};

// --- static code-richness metrics ---
const countMatches = (s: string, re: RegExp): number => (s.match(re) || []).length;
function analyze(html: string) {
  const complete = /<\/html>\s*$/i.test(html);
  const jsHandlers = countMatches(html, /addEventListener\(|on(click|input|change|submit|keydown|keyup|mousedown|mouseup|pointerdown|dragstart|dragover|dragend|drop)\s*=/gi);
  const interactiveEls = countMatches(html, /<button|<input|<select|<textarea|<canvas|<svg|draggable\s*=/gi);
  const fns = countMatches(html, /function\s+\w|\=\>/g);
  const flags = {
    canvas: /<canvas[\s>]/i.test(html),
    svg: /<svg[\s>]/i.test(html),
    raf: /requestAnimationFrame/.test(html),
    drag: /drag(start|over|end)|ondrop|\.draggable|"drop"|'drop'/i.test(html),
    storage: /localStorage|sessionStorage/.test(html),
    keyframes: /@keyframes/i.test(html),
    media: /@media/i.test(html),
    cdn: /cdnjs\.cloudflare\.com/i.test(html),
  };
  const advanced = Object.values(flags).filter(Boolean).length;
  return { complete, bytes: html.length, jsHandlers, interactiveEls, fns, advanced, flags };
}

// --- LLM judge (reasoning-first field, strict JSON) ---
const JUDGE_RF = { responseFormat: { type: "json_schema", json_schema: { name: "judge", strict: true, schema: { type: "object", properties: { assessment: { type: "string" }, completeness: { type: "integer" }, interactivity: { type: "integer" }, sophistication: { type: "integer" }, overall: { type: "integer" } }, required: ["assessment", "completeness", "interactivity", "sophistication", "overall"], additionalProperties: false } } } };
async function judge(intent: string, html: string): Promise<{ overall: number; completeness: number; interactivity: number; sophistication: number }> {
  const sys = "You are a strict senior engineer judging a generated HTML prototype against an intent. Score 0-100 each: completeness (every described feature present & non-placeholder), interactivity (described interactions actually work in JS), sophistication (visual + code quality, ambition). FIRST fill `assessment` with terse reasoning citing specifics, THEN the scores and an `overall` (0-100). Be discriminating — reserve 80+ for genuinely strong work.";
  const r = await call(model(1024, 0.2), [
    { role: "system", content: sys },
    { role: "user", content: `INTENT: ${intent}\n\nHTML (truncated to 14k chars):\n${html.slice(0, 14000)}` },
  ], JUDGE_RF);
  const m = r.content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("judge: no json");
  return JSON.parse(m[0]);
}

async function main() {
  console.log(`model=${modelId}  intents=${INTENTS.length}  reps=${reps}\n`);
  const names = Object.keys(strategies);
  const agg: Record<string, { n: number; overall: number; comp: number; inter: number; soph: number; complete: number; bytes: number; js: number; els: number; adv: number; ms: number; tok: number }> = {};
  for (const n of names) agg[n] = { n: 0, overall: 0, comp: 0, inter: 0, soph: 0, complete: 0, bytes: 0, js: 0, els: 0, adv: 0, ms: 0, tok: 0 };

  for (let rep = 0; rep < reps; rep++) {
    for (const intent of INTENTS) {
      for (const n of names) {
        try {
          const g = await strategies[n]!(intent);
          const m = analyze(g.html);
          const j = await judge(intent, g.html);
          const a = agg[n]!;
          a.n++; a.overall += j.overall; a.comp += j.completeness; a.inter += j.interactivity; a.soph += j.sophistication;
          a.complete += m.complete ? 1 : 0; a.bytes += m.bytes; a.js += m.jsHandlers; a.els += m.interactiveEls; a.adv += m.advanced;
          a.ms += g.ms; a.tok += (g.outTok ?? 0) + (g.planTok ?? 0);
          console.log(`  ${n.padEnd(13)} ${intent.slice(0, 24)}…  overall=${j.overall} complete=${m.complete ? "Y" : "N"} js=${m.jsHandlers} els=${m.interactiveEls} adv=${m.advanced}/8 ${Math.round(g.ms)}ms`);
        } catch (e) {
          console.error(`  ${n} FAILED: ${(e as Error).message}`);
        }
      }
    }
  }

  console.log("\n=== averages ===");
  console.log("strategy       overall  compl  inter  soph   done%  bytes   js   els  adv/8  ms     tok");
  console.log("-".repeat(92));
  for (const n of names) {
    const a = agg[n]!; if (!a.n) { console.log(`${n.padEnd(13)} (no successful runs)`); continue; }
    const f = (x: number, d = 0) => (x / a.n).toFixed(d);
    console.log(
      `${n.padEnd(13)} ${f(a.overall).padStart(6)}  ${f(a.comp).padStart(5)}  ${f(a.inter).padStart(5)}  ${f(a.soph).padStart(4)}  ${((a.complete / a.n) * 100).toFixed(0).padStart(5)}  ${f(a.bytes).padStart(5)}  ${f(a.js).padStart(3)}  ${f(a.els).padStart(3)}  ${f(a.adv, 1).padStart(4)}  ${f(a.ms).padStart(5)}  ${f(a.tok).padStart(5)}`,
    );
  }
}
await main();
