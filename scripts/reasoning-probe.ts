/**
 * Reasoning-elicitation experiment for gemma-4-31b on Cerebras.
 *
 * Question: the model emits no chain-of-thought by default (Cerebras ignores the
 * `thinking` flag, and Gemma-4 isn't a reasoning model). Can we NUDGE it to reason —
 * and does that actually raise accuracy? Critically: under STRICT structured output the
 * JSON grammar forces the model straight to the answer, so a prompt nudge alone is inert.
 * We compare strategies that give the model room to think before committing.
 *
 *   bun scripts/reasoning-probe.ts [reps]
 *
 * Strategies
 *   free-direct      plain chat, "answer only" (no CoT)            — floor
 *   free-cot         plain chat, "think step by step, end ANSWER:" — ceiling (no schema)
 *   json-only        strict JSON {answer}                          — current agent shape
 *   json-nudge       strict JSON {answer} + "reason carefully" sys — does a nudge help under grammar?
 *   json-reasoning   strict JSON {reasoning, answer}  (reasoning FIRST) — interleaved CoT in schema
 *   xml-then-json    "<think>…</think> then JSON"  (free CoT, parsed) — the user's XML idea
 *   two-pass         call1 free CoT → call2 strict JSON {answer}   — most expensive
 */
import { AIModel } from "universal-llm-client";

const apiKey = process.env.CEREBRAS_API_KEY ?? "";
const modelId = process.env.MODEL_ID ?? "gemma-4-31b";
const url = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai";
if (!apiKey) throw new Error("no CEREBRAS_API_KEY in env");
const reps = Number(process.argv[2] ?? 1);

const model = (): AIModel =>
  new AIModel({ model: modelId, thinking: false, providers: [{ type: "openai", url, apiKey }], defaultParameters: { temperature: 0.3, max_tokens: 2048 }, timeout: 120_000 });

// Raw JSON-Schema response_format (strict). Property ORDER is preserved → a `reasoning`
// key listed first forces the model to emit its working before the `answer`.
function rf(props: Record<string, unknown>, required: string[]) {
  return { responseFormat: { type: "json_schema", json_schema: { name: "ans", strict: true, schema: { type: "object", properties: props, required, additionalProperties: false } } } };
}
const RF_ANSWER = rf({ answer: { type: "string" } }, ["answer"]);
const RF_REASON = rf({ reasoning: { type: "string" }, answer: { type: "string" } }, ["reasoning", "answer"]);

interface Probe { q: string; a: string }
const PROBES: Probe[] = [
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
const ms = (t0: number): number => Math.round(performance.now() - t0);
const SYS = "You answer carefully and correctly.";
const SYS_NUDGE = "You are a careful reasoner. Think through the problem step by step internally and double-check arithmetic before answering.";

function pickJson(raw: string): { answer: unknown } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no json found in: " + raw.slice(0, 60));
  return JSON.parse(m[0]);
}
function lastAnswerLine(raw: string): string {
  const m = raw.match(/ANSWER\s*:\s*(.+)\s*$/im);
  return (m ? m[1] : raw.split(/\n/).filter(Boolean).pop() ?? raw).trim();
}

interface Run { ms: number; tokens?: number; got: string }
type Strategy = (q: string) => Promise<Run>;
const chat = (sys: string, user: string, opts?: unknown) => model().chat([{ role: "system", content: sys }, { role: "user", content: user }] as never, opts as never);

const strategies: Record<string, Strategy> = {
  "free-direct": async (q) => {
    const t0 = performance.now();
    const r = await chat("Answer with ONLY the final answer, nothing else.", q);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: (r.message.content ?? "").trim() };
  },
  "free-cot": async (q) => {
    const t0 = performance.now();
    const r = await chat(SYS_NUDGE + " Work step by step, then put the final answer on its own last line as 'ANSWER: <value>'.", q);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: lastAnswerLine(r.message.content ?? "") };
  },
  "json-only": async (q) => {
    const t0 = performance.now();
    const r = await chat(SYS, q, RF_ANSWER);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: String(pickJson(r.message.content ?? "").answer) };
  },
  "json-nudge": async (q) => {
    const t0 = performance.now();
    const r = await chat(SYS_NUDGE, q, RF_ANSWER);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: String(pickJson(r.message.content ?? "").answer) };
  },
  "json-reasoning": async (q) => {
    const t0 = performance.now();
    const r = await chat(SYS + " First fill `reasoning` with your full step-by-step working, then give the final `answer`.", q, RF_REASON);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: String(pickJson(r.message.content ?? "").answer) };
  },
  "xml-then-json": async (q) => {
    const t0 = performance.now();
    const r = await chat("Reason about the problem inside a single <think>...</think> block. After it, output ONLY a JSON object {\"answer\": <value>} and nothing else.", q);
    return { ms: ms(t0), tokens: r.usage?.outputTokens, got: String(pickJson((r.message.content ?? "").replace(/<think>[\s\S]*?<\/think>/i, "")).answer) };
  },
  "two-pass": async (q) => {
    const t0 = performance.now();
    const c1 = await chat(SYS_NUDGE + " Work step by step.", q);
    const reasoning = c1.message.content ?? "";
    const c2 = await chat("Extract the final answer from the provided working.", `Problem: ${q}\n\nWorking:\n${reasoning}\n\nReturn the final answer.`, RF_ANSWER);
    return { ms: ms(t0), tokens: c1.usage?.outputTokens, got: String(pickJson(c2.message.content ?? "").answer) };
  },
};

async function main() {
  console.log(`model=${modelId}  probes=${PROBES.length}  reps=${reps}\n`);
  const names = Object.keys(strategies);
  const agg: Record<string, { hits: number; total: number; ms: number; tok: number; toks: number; misses: string[] }> = {};
  for (const n of names) agg[n] = { hits: 0, total: 0, ms: 0, tok: 0, toks: 0, misses: [] };

  for (let rep = 0; rep < reps; rep++) {
    for (const p of PROBES) {
      for (const n of names) {
        try {
          const run = await strategies[n]!(p.q);
          const ok = correct(run.got, p.a);
          const a = agg[n]!;
          a.total++; a.ms += run.ms; if (ok) a.hits++; else a.misses.push(`"${p.q.slice(0, 30)}…" got=${JSON.stringify(run.got)} want=${p.a}`);
          if (run.tokens != null) { a.tok += run.tokens; a.toks++; }
        } catch (e) {
          agg[n]!.total++; agg[n]!.misses.push(`"${p.q.slice(0, 30)}…" ERROR ${(e as Error).message}`);
        }
      }
    }
  }

  console.log("strategy          acc       avg_ms   avg_tok");
  console.log("-".repeat(50));
  for (const n of names) {
    const a = agg[n]!;
    const acc = ((a.hits / a.total) * 100).toFixed(0).padStart(3);
    const avgMs = Math.round(a.ms / a.total).toString().padStart(6);
    const avgTok = a.toks ? Math.round(a.tok / a.toks).toString().padStart(6) : "     -";
    console.log(`${n.padEnd(15)} ${acc}%    ${avgMs}    ${avgTok}   (${a.hits}/${a.total})`);
  }
  console.log("\nmisses:");
  for (const n of names) if (agg[n]!.misses.length) console.log(`\n[${n}]\n  ` + agg[n]!.misses.join("\n  "));
}
await main();
