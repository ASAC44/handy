/**
 * Tailwind-vs-inline experiment for the prototype agent (gemma-4-31b / Cerebras).
 *
 * Tests the claim: "Tailwind → higher quality with fewer tokens." Also checks the
 * Design-DNA risk: does Tailwind still honor an exact learned palette?
 *
 *   bun scripts/tailwind-exp.ts [reps]
 *
 * Strategies (all: plan-comment format, max_tokens 16384, hot sampling):
 *   inline           inline CSS+JS, cdnjs only (current approach)
 *   tailwind         Tailwind Play CDN, utility classes, arbitrary values for exact colors
 *   tailwind-config  Tailwind + wire the design tokens into tailwind.config
 *
 * Part A: 3 intents, no theme → tokens / quality / interactivity / responsiveness.
 * Part B: 1 intent WITH a distinctive DNA palette → theme-adherence (do the exact hexes appear?).
 */
import { AIModel } from "universal-llm-client";

const apiKey = process.env.CEREBRAS_API_KEY ?? "";
const modelId = process.env.MODEL_ID ?? "gemma-4-31b";
const url = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai";
if (!apiKey) throw new Error("no CEREBRAS_API_KEY in env");
const reps = Number(process.argv[2] ?? 1);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const model = (maxTokens: number, temp: number): AIModel =>
  new AIModel({ model: modelId, thinking: false, providers: [{ type: "openai", url, apiKey }], timeout: 180_000, defaultParameters: { temperature: temp, top_p: 0.95, max_tokens: maxTokens } });

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
      if (msg.includes("429") && attempt < 5) { const b = 4000 * 2 ** attempt; console.error(`  429 backoff ${b}ms`); await sleep(b); continue; }
      throw e;
    }
  }
}

const PLAN = "FIRST write a brief plan as one HTML comment `<!-- PLAN: components · sample data · interactions -->` (a few lines). THEN the full document realizing it. Make it COMPLETE and genuinely interactive: realistic sample data (never 'Lorem ipsum'/'Item 1'), every control wired with working JS, no dead buttons. Be ambitious within the single file. Output ONLY HTML — the comment then `<!DOCTYPE html>`. No markdown fences.";
const BASE = "You are a real-time prototyping agent. Produce ONE self-contained HTML document that is a working, visual proof-of-concept of the idea.";

const SYS = {
  inline: `${BASE} Use inline CSS and JS; the only external scripts allowed are from https://cdnjs.cloudflare.com. ${PLAN}`,
  tailwind: `${BASE} Use Tailwind CSS via <script src="https://cdn.tailwindcss.com"></script> and style everything with utility classes (responsive prefixes like md:/lg: where useful). Other external scripts only from https://cdnjs.cloudflare.com. When an exact color is required, use arbitrary values like bg-[#0d1b2a]. ${PLAN}`,
  "tailwind-config": `${BASE} Use Tailwind CSS via <script src="https://cdn.tailwindcss.com"></script>, then a <script>tailwind.config={theme:{extend:{colors:{...}}}}</script> mapping any given design tokens to named utilities; style everything with utility classes (responsive prefixes where useful). Other external scripts only from https://cdnjs.cloudflare.com. ${PLAN}`,
};

const INTENTS = [
  "A kanban board with drag-and-drop between To Do / In Progress / Done columns, cards with story points and assignees, and a live burndown chart.",
  "A real-time analytics dashboard: a revenue line chart, a churn gauge, MRR summary cards, and a sortable, filterable customer table.",
  "A landing page for a developer tool: an animated hero, a feature grid, a monthly/annual pricing toggle that updates prices, and an FAQ accordion.",
];
// Distinctive palette for the adherence test (unlikely accidental matches).
const DNA_HEXES = ["#0d1b2a", "#ff6b35", "#7b2cbf", "#e0e1dd"];
const DNA_NOTE = `\n\nDESIGN SYSTEM (hard visual constraint): background ${DNA_HEXES[0]}; primary accent ${DNA_HEXES[1]}; secondary accent ${DNA_HEXES[2]}; text ${DNA_HEXES[3]}; corner radius 14px; comfortable density; geometric sans typography. Match these EXACT colors.`;

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
    adv: [/<canvas[\s>]/i, /<svg[\s>]/i, /requestAnimationFrame/, /drag(start|over|end)/i, /localStorage/, /chart/i, /cdnjs|tailwindcss/i, /transition|animat/i].filter((re) => re.test(html)).length,
    responsive: cnt(html, /\b(sm|md|lg|xl):[a-z]/g) + cnt(html, /@media/gi),
    tw: /cdn\.tailwindcss\.com/i.test(html),
  };
}
const JUDGE_RF = { responseFormat: { type: "json_schema", json_schema: { name: "j", strict: true, schema: { type: "object", properties: { assessment: { type: "string" }, completeness: { type: "integer" }, interactivity: { type: "integer" }, sophistication: { type: "integer" }, overall: { type: "integer" } }, required: ["assessment", "completeness", "interactivity", "sophistication", "overall"], additionalProperties: false } } } };
async function judge(intent: string, html: string): Promise<number> {
  const jm = model(1024, 0.2);
  const r = await call(jm, [
    { role: "system", content: "Strictly judge this HTML prototype vs the intent. Score 0-100: completeness, interactivity, sophistication, overall. FIRST fill `assessment` with terse reasoning, THEN the scores. Reserve 80+ for genuinely strong work." },
    { role: "user", content: `INTENT: ${intent}\n\nHTML:\n${html.slice(0, 14000)}` },
  ], JUDGE_RF);
  return JSON.parse((r.content.match(/\{[\s\S]*\}/) || ["{}"])[0]).overall ?? 0;
}

async function gen(strategy: keyof typeof SYS, intent: string, themeNote = "") {
  const t0 = performance.now();
  const r = await call(model(16384, 1.0), [{ role: "system", content: SYS[strategy] + themeNote }, { role: "user", content: `Idea (intent): ${intent}\nOutput the document now.` }]);
  return { html: extractHtml(r.content), outTok: r.outTok ?? 0, ms: Math.round(performance.now() - t0) };
}

async function main() {
  const names = Object.keys(SYS) as (keyof typeof SYS)[];
  console.log(`model=${modelId}  reps=${reps}\n\n=== PART A: quality & token efficiency (no theme) ===`);
  const agg: Record<string, { n: number; overall: number; els: number; adv: number; resp: number; done: number; bytes: number; tok: number; ms: number }> = {};
  for (const n of names) agg[n] = { n: 0, overall: 0, els: 0, adv: 0, resp: 0, done: 0, bytes: 0, tok: 0, ms: 0 };
  for (let rep = 0; rep < reps; rep++) {
    for (const intent of INTENTS) {
      for (const n of names) {
        try {
          const g = await gen(n, intent); const a = analyze(g.html); const o = await judge(intent, g.html);
          const x = agg[n]!; x.n++; x.overall += o; x.els += a.els; x.adv += a.adv; x.resp += a.responsive; x.done += a.complete ? 1 : 0; x.bytes += a.bytes; x.tok += g.outTok; x.ms += g.ms;
          console.log(`  ${n.padEnd(15)} ${intent.slice(0, 22)}… overall=${o} els=${a.els} adv=${a.adv}/8 resp=${a.responsive} tok=${g.outTok} ${g.ms}ms tw=${a.tw ? "Y" : "N"} done=${a.complete ? "Y" : "N"}`);
        } catch (e) { console.error(`  ${n} FAIL ${(e as Error).message.slice(0, 50)}`); }
      }
    }
  }
  console.log("\nstrategy         overall  els   adv/8  resp   done%   out_tok  bytes   ms");
  console.log("-".repeat(78));
  for (const n of names) { const a = agg[n]!; if (!a.n) continue; const f = (x: number, d = 0) => (x / a.n).toFixed(d);
    console.log(`${n.padEnd(15)} ${f(a.overall).padStart(6)}  ${f(a.els, 1).padStart(4)}  ${f(a.adv, 1).padStart(4)}  ${f(a.resp, 1).padStart(4)}  ${((a.done / a.n) * 100).toFixed(0).padStart(5)}  ${f(a.tok).padStart(6)}  ${f(a.bytes).padStart(5)}  ${f(a.ms).padStart(5)}`); }

  console.log("\n\n=== PART B: Design-DNA adherence (exact palette given) ===");
  console.log("strategy         theme_hits/4  (which hexes appeared)   out_tok");
  console.log("-".repeat(72));
  const intent = INTENTS[0]!;
  for (const n of names) {
    try {
      const g = await gen(n, intent, DNA_NOTE);
      const hits = DNA_HEXES.filter((h) => g.html.toLowerCase().includes(h.toLowerCase()));
      console.log(`${n.padEnd(15)} ${String(hits.length).padStart(2)}/4          ${hits.join(" ") || "(none)"}   ${g.outTok}`);
    } catch (e) { console.error(`  ${n} FAIL ${(e as Error).message.slice(0, 50)}`); }
  }
}
await main();
