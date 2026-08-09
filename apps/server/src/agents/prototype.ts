import { AIModel, multimodalMessage } from "universal-llm-client";
import { prototypeModel, baselineModel } from "../llm";
import { prototypeSystemFor, prototypeEditSystemFor, type ThemeTokens } from "@sidebar/shared";

export interface StreamResult {
  html: string;
  ms: number;
  tokens: number;
  tokPerS: number;
}

export interface EvolveResult extends StreamResult {
  /** How the agent's output was interpreted: applied N edit blocks, returned a full
   *  redesign, or produced nothing usable (base kept unchanged). */
  mode: "edit" | "full" | "noop";
  editCount: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Mock stream: chunk a known themed HTML doc over ~totalMs to mimic token streaming. */
export async function mockStream(
  html: string,
  totalMs: number,
  onToken: (delta: string) => void,
  alive: () => boolean,
): Promise<StreamResult> {
  const steps = 46;
  const per = totalMs / steps;
  const t0 = performance.now();
  let sent = 0;
  for (let i = 1; i <= steps; i++) {
    if (!alive()) break;
    const to = Math.floor((html.length * i) / steps);
    const delta = html.slice(sent, to);
    sent = to;
    if (delta) onToken(delta);
    await sleep(per);
  }
  const ms = Math.round(performance.now() - t0);
  return { html, ms, tokens: Math.round(html.length / 4), tokPerS: 1900 };
}

/** Live stream: real Cerebras tokens. Injects the learned design system into the prompt. */
export async function liveStream(
  intent: string,
  transcript: string,
  learned: ThemeTokens | null,
  screenshotDataUri: string | null,
  onToken: (delta: string) => void,
  model: AIModel = prototypeModel(),
): Promise<StreamResult> {
  const system = prototypeSystemFor(learned);
  const userText = `Idea (intent): ${intent}\nRecent transcript: ${transcript}\nOutput the HTML now.`;
  // The lib's message types vary by provider; cast keeps the scaffold decoupled.
  const messages = (
    screenshotDataUri
      ? [{ role: "system", content: system }, multimodalMessage(userText, [screenshotDataUri])]
      : [{ role: "system", content: system }, { role: "user", content: userText }]
  ) as never;

  const t0 = performance.now();
  let html = "";
  for await (const ev of model.chatStream(messages)) {
    if (ev.type === "text") {
      html += ev.content;
      onToken(ev.content);
    }
  }
  const ms = Math.round(performance.now() - t0);
  const tokens = Math.round(html.length / 4);
  return { html: extractHtml(html), ms, tokens, tokPerS: ms > 0 ? Math.round((tokens / ms) * 1000) : 0 };
}

/**
 * Evolve an EXISTING prototype: the agent receives the current document and emits
 * compact SEARCH/REPLACE edit blocks (efficient — only the changed regions are
 * generated), which we apply to the base. If the agent instead returns a full new
 * document (a from-scratch redesign), we use that. The base is never thrown away on
 * the first turn, so the agent can actually iterate instead of starting blank.
 */
export async function evolveStream(
  base: string,
  intent: string,
  transcript: string,
  learned: ThemeTokens | null,
  screenshotDataUri: string | null,
  onToken: (delta: string) => void,
  model: AIModel = prototypeModel(),
): Promise<EvolveResult> {
  const system = prototypeEditSystemFor(learned);
  const userText =
    `CURRENT DOCUMENT:\n${base}\n\n` +
    `REQUESTED CHANGE (from the meeting): ${intent}\n` +
    `Recent transcript: ${transcript}\n\n` +
    `Return SEARCH/REPLACE edit blocks now (or a full <!DOCTYPE html> document only if a redesign is unavoidable).`;
  const messages = (
    screenshotDataUri
      ? [{ role: "system", content: system }, multimodalMessage(userText, [screenshotDataUri])]
      : [{ role: "system", content: system }, { role: "user", content: userText }]
  ) as never;

  const t0 = performance.now();
  let raw = "";
  for await (const ev of model.chatStream(messages)) {
    if (ev.type === "text") {
      raw += ev.content;
      onToken(ev.content);
    }
  }
  const ms = Math.round(performance.now() - t0);
  const tokens = Math.round(raw.length / 4);
  const tokPerS = ms > 0 ? Math.round((tokens / ms) * 1000) : 0;

  let html = base;
  let mode: EvolveResult["mode"] = "noop";
  let editCount = 0;
  if (looksLikeFullDoc(raw)) {
    const doc = extractHtml(raw);
    if (doc) {
      html = doc;
      mode = "full";
    }
  } else {
    const { result, applied, blocks } = applyEditBlocks(base, raw);
    if (applied > 0) {
      html = result;
      editCount = applied;
      mode = "edit";
    } else if (blocks === 0) {
      // No edit blocks at all — the model may have emitted a bare HTML fragment/doc.
      const doc = extractHtml(raw);
      if (doc && /<\w+[\s>]/.test(doc)) {
        html = doc;
        mode = "full";
      }
    }
    // else: edit blocks were present but none matched the base (a model miss). KEEP the
    // base unchanged — never treat unmatched marker text as a document, which would
    // replace the working prototype with raw SEARCH/REPLACE soup and poison the recap.
  }
  return { html, ms, tokens, tokPerS, mode, editCount };
}

/** True when a model response is a whole HTML document rather than edit blocks. */
function looksLikeFullDoc(raw: string): boolean {
  const h = raw.replace(/^\s*```(?:html)?\s*/i, "").trimStart();
  return /^<!doctype html|^<html[\s>]/i.test(h);
}

const SEARCH_MARK = /^<{5,}\s*SEARCH\b/;
const DIVIDER_MARK = /^={5,}\s*$/;
const REPLACE_MARK = /^>{5,}\s*REPLACE\b/;

/**
 * Apply aider-style SEARCH/REPLACE blocks to a base document. Parsed with a LINEAR
 * line scanner (never a backtracking regex — a malformed/unterminated model stream
 * must not be able to hang the single-threaded server). Each block's SEARCH is located
 * in the working doc (exact match first, then a whitespace-tolerant per-line match) and
 * swapped for REPLACE; unmatched blocks are skipped rather than corrupting the doc.
 * Returns the new doc, how many blocks applied, and how many well-formed blocks were seen.
 */
export function applyEditBlocks(base: string, raw: string): { result: string; applied: number; blocks: number } {
  const lines = raw.split(/\r?\n/);
  let result = base;
  let applied = 0;
  let blocks = 0;
  let i = 0;
  while (i < lines.length) {
    if (!SEARCH_MARK.test(lines[i]!)) {
      i++;
      continue;
    }
    i++; // past the SEARCH marker
    const search: string[] = [];
    while (i < lines.length && !DIVIDER_MARK.test(lines[i]!)) search.push(lines[i++]!);
    if (i >= lines.length) break; // no divider — malformed, stop scanning
    i++; // past the divider
    const replace: string[] = [];
    while (i < lines.length && !REPLACE_MARK.test(lines[i]!)) replace.push(lines[i++]!);
    if (i < lines.length) i++; // past the REPLACE marker (if present)
    blocks++;
    const searchText = search.join("\n");
    if (!searchText.trim()) continue;
    const replaceText = replace.join("\n");
    const idx = result.indexOf(searchText);
    if (idx !== -1) {
      result = result.slice(0, idx) + replaceText + result.slice(idx + searchText.length);
      applied++;
      continue;
    }
    const fuzzy = fuzzyReplace(result, searchText, replaceText);
    if (fuzzy !== null) {
      result = fuzzy;
      applied++;
    }
  }
  return { result, applied, blocks };
}

/** Whitespace-tolerant replace: match the SEARCH lines against the doc ignoring
 *  leading/trailing whitespace per line (models often reflow indentation). */
function fuzzyReplace(doc: string, search: string, replace: string): string | null {
  const docLines = doc.split("\n");
  const needle = search.split("\n").map((l) => l.trim());
  while (needle.length && needle[0] === "") needle.shift();
  while (needle.length && needle[needle.length - 1] === "") needle.pop();
  if (!needle.length) return null;
  for (let i = 0; i + needle.length <= docLines.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (docLines[i + j]!.trim() !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return [...docLines.slice(0, i), replace, ...docLines.slice(i + needle.length)].join("\n");
  }
  return null;
}

export function getBaseline(): AIModel | null {
  return baselineModel();
}

/**
 * Pull a clean HTML document out of a model response: strip markdown fences and
 * any prose before `<!doctype>`/`<html>` or after `</html>`. Gemma usually emits
 * a bare document, but this keeps a stray preamble ("Here's the HTML:") or a code
 * fence from breaking the rendered artifact.
 */
export function extractHtml(s: string): string {
  let h = s.replace(/^\s*```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = h.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) h = h.slice(start);
  const end = h.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) h = h.slice(0, end + "</html>".length);
  return h.trim();
}
