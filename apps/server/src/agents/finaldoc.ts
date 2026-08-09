import { finalDocModel } from "../llm";
import { extractHtml, type StreamResult } from "./prototype";
import { finalDocSystemFor, type MeetingSummary, type ThemeKey, type ThemeTokens, THEMES, RECOMMENDED } from "@sidebar/shared";

/** A prototype produced during the meeting, embedded in the recap's gallery. */
export interface RecapArtifact {
  intent: string;
  html: string;
  themeKey: ThemeKey;
}

/** Everything the closing agent needs to draft the final meeting recap. */
export interface RecapInput {
  title: string;
  summary: MeetingSummary;
  transcript: string;
  context: string;
  /** Prototypes built during the meeting (newest last), embedded as live previews. */
  artifacts: RecapArtifact[];
  /** The meeting's learned Design DNA (null until a design was picked). */
  theme: ThemeTokens | null;
}

/** Live recap: real Cerebras tokens streamed as one themed HTML document, with the
 *  actual prototype previews appended server-side (the model writes prose only). */
export async function finalDocLive(input: RecapInput, onToken: (delta: string) => void): Promise<StreamResult> {
  const model = finalDocModel();
  const system = finalDocSystemFor(input.theme);
  const userText = [
    `Meeting title: ${input.title}`,
    input.context ? `\nAccepted file context available to agents:\n${input.context}` : "",
    `\nRolling structured summary (JSON):\n${JSON.stringify(input.summary)}`,
    `\nPrototypes built during the meeting (by intent, for your reference — do NOT list them, they are appended automatically):\n${input.artifacts.length ? input.artifacts.map((a) => `- ${a.intent}`).join("\n") : "- (none)"}`,
    `\nFull transcript:\n${input.transcript || "(no transcript captured)"}`,
    `\nWrite the final meeting recap HTML now.`,
  ].join("\n");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ] as never;

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
  const theme = input.theme ?? THEMES[RECOMMENDED];
  const doc = injectGallery(extractHtml(html), artifactGalleryHtml(input.artifacts, theme));
  return { html: doc, ms, tokens, tokPerS: ms > 0 ? Math.round((tokens / ms) * 1000) : 0 };
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escape a value for use inside a double-quoted attribute (e.g. iframe srcdoc). */
const escAttr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const li = (items: string[]): string =>
  items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";

/** A gallery of live prototype previews (sandboxed iframes), styled inline so it can be
 *  injected into either the deterministic mock recap or a model-generated one. */
export function artifactGalleryHtml(artifacts: RecapArtifact[], t: ThemeTokens): string {
  if (!artifacts.length) return "";
  const cards = artifacts
    .map(
      (a) =>
        `<figure style="margin:0;border:1px solid ${t.border};border-radius:${t.radius};overflow:hidden;background:${t.surface};box-shadow:${t.shadow}">` +
        `<figcaption style="padding:10px 14px;font-size:13px;font-weight:600;color:${t.ink};border-bottom:1px solid ${t.border};background:${t.surface2}">${esc(a.intent)}</figcaption>` +
        `<iframe sandbox="allow-scripts" loading="lazy" title="${escAttr(a.intent)}" style="width:100%;height:460px;border:0;display:block;background:#fff" srcdoc="${escAttr(a.html)}"></iframe>` +
        `</figure>`,
    )
    .join("");
  return (
    `<section style="margin:34px 0 0">` +
    `<h2 style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${t.mut};margin:0 0 14px;font-weight:700">Prototypes built · ${artifacts.length}</h2>` +
    `<div style="display:flex;flex-direction:column;gap:18px">${cards}</div>` +
    `</section>`
  );
}

/** Insert the gallery inside the document — before </body>, else before </html>, else
 *  appended — so a model that omits </body> still keeps the gallery in the body. */
export function injectGallery(html: string, gallery: string): string {
  if (!gallery) return html;
  const lower = html.toLowerCase();
  const at = (tag: string): number => lower.lastIndexOf(tag);
  const idx = at("</body>") !== -1 ? at("</body>") : at("</html>");
  return idx !== -1 ? html.slice(0, idx) + gallery + html.slice(idx) : html + gallery;
}

/**
 * Deterministic mock recap: a clean, self-contained themed HTML document assembled from
 * the rolling summary + the real prototype previews, so the no-key demo (AGENTS=mock)
 * still produces a complete final document. Mirrors the prototype agent's mock/live duality.
 */
export function buildRecapHtml(input: RecapInput): string {
  const t = input.theme ?? THEMES[RECOMMENDED];
  const s = input.summary;
  const section = (title: string, body: string): string =>
    body ? `<section><h2>${title}</h2>${body}</section>` : "";
  const actions = s.action_items.length
    ? `<table><thead><tr><th>Owner</th><th>Task</th></tr></thead><tbody>${s.action_items
        .map((a) => `<tr><td class="owner">${esc(a.owner || "unassigned")}</td><td>${esc(a.task)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const gallery = artifactGalleryHtml(input.artifacts, t);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meeting Recap</title><style>
*{box-sizing:border-box}body{margin:0;background:${t.bg};color:${t.ink};font-family:${t.font};line-height:1.6;padding:44px 28px 64px;max-width:760px;margin:0 auto}
.k{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${t.accent};font-weight:700;margin:0 0 6px}
h1{font-size:30px;letter-spacing:-.5px;margin:0 0 6px;font-weight:700}
.meta{color:${t.mut};font-size:13px;margin:0 0 36px}
section{margin:0 0 30px}
h2{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${t.mut};margin:0 0 12px;font-weight:700}
.lead{font-size:17px;line-height:1.55;color:${t.ink};margin:0}
ul{margin:0;padding-left:20px}li{margin:0 0 8px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${t.mut};border-bottom:1px solid ${t.border};padding:0 10px 8px}
td{padding:9px 10px;border-bottom:1px solid ${t.border};vertical-align:top}tr:last-child td{border-bottom:0}
.owner{color:${t.accent2};font-weight:600;white-space:nowrap}
</style></head><body>
<p class="k">Meeting Recap</p>
<h1>${esc(input.title || "Meeting")}</h1>
<p class="meta">Drafted live by the Sidebar agents · ${s.action_items.length} action item${s.action_items.length === 1 ? "" : "s"} · ${input.artifacts.length} prototype${input.artifacts.length === 1 ? "" : "s"}</p>
${section("Executive summary", `<p class="lead">${esc(s.tldr || "No summary was captured for this meeting.")}</p>`)}
${section("Key decisions", li(s.decisions))}
${section("Action items", actions)}
${section("Open questions", li(s.open_questions))}
${gallery}
</body></html>`;
}
