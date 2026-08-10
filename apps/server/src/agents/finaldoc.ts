import { finalDocModel } from "../llm";
import { extractHtml, type StreamResult } from "./prototype";
import { finalDocSystemFor, toDesignMd, type MeetingSummary, type ThemeKey, type ThemeTokens, THEMES, RECOMMENDED } from "@sidebar/shared";

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
  const appendix = artifactGalleryHtml(input.artifacts, theme) + designMdSectionHtml(input.theme, theme);
  const doc = injectGallery(extractHtml(html), appendix, theme);
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
        `<figure class="sidebar-recap-prototype-card">` +
        `<figcaption>${esc(a.intent)}</figcaption>` +
        `<iframe class="sidebar-recap-prototype-frame" sandbox="allow-scripts" loading="lazy" title="${escAttr(a.intent)}" srcdoc="${escAttr(a.html)}"></iframe>` +
        `</figure>`,
    )
    .join("");
  return (
    `<section class="sidebar-recap-prototypes">` +
    `<h2>Prototypes built · ${artifacts.length}</h2>` +
    `<div class="sidebar-recap-gallery">${cards}</div>` +
    `</section>`
  );
}

/** The learned Design DNA, rendered as its Google DESIGN.md appendix — so the shareable
 *  recap carries the meeting's design system in Google's portable token format. Styled
 *  with the same theme so it reads of-a-piece. Empty when no design was ever picked. */
export function designMdSectionHtml(theme: ThemeTokens | null, t: ThemeTokens): string {
  if (!theme) return "";
  return (
    `<section class="sidebar-recap-design">` +
    `<h2>This meeting&#39;s DESIGN.md</h2>` +
    `<p>The learned Design DNA, exported in Google&#39;s DESIGN.md format (YAML tokens + prose).</p>` +
    `<details>` +
    `<summary>View DESIGN.md</summary>` +
    `<pre>${esc(toDesignMd(theme))}</pre>` +
    `</details>` +
    `</section>`
  );
}

function recapAppendixCss(t: ThemeTokens): string {
  return `<style id="sidebar-recap-css">
html,body{min-height:100%}
body{margin:0!important;padding:0!important;max-width:none!important;display:block!important;overflow-x:hidden;background:${t.bg};color:${t.ink};font-family:${t.font};line-height:1.6}
.sidebar-recap-shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}
.sidebar-recap-main{max-width:860px;margin:0 auto}
.sidebar-recap-main>*:first-child{margin-top:0}
.sidebar-recap-main>*:last-child{margin-bottom:0}
.sidebar-recap-appendix{margin-top:42px;display:grid;gap:32px}
.sidebar-recap-prototypes,.sidebar-recap-design{margin:0}
.sidebar-recap-prototypes>h2,.sidebar-recap-design>h2{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${t.mut};margin:0 0 14px;font-weight:700}
.sidebar-recap-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:18px;align-items:start}
.sidebar-recap-prototype-card{margin:0;border:1px solid ${t.border};border-radius:${t.radius};overflow:hidden;background:${t.surface};box-shadow:${t.shadow}}
.sidebar-recap-prototype-card figcaption{padding:11px 14px;font-size:13px;font-weight:700;color:${t.ink};border-bottom:1px solid ${t.border};background:${t.surface2}}
.sidebar-recap-prototype-frame{width:100%;height:min(620px,72vh);min-height:440px;border:0;display:block;background:#fff}
.sidebar-recap-design p{font-size:12px;color:${t.mut};margin:0 0 12px}
.sidebar-recap-design details{border:1px solid ${t.border};border-radius:${t.radius};background:${t.surface};box-shadow:${t.shadow};overflow:hidden}
.sidebar-recap-design summary{cursor:pointer;padding:13px 16px;color:${t.ink};font-weight:700;list-style:none}
.sidebar-recap-design summary::-webkit-details-marker{display:none}
.sidebar-recap-design summary:after{content:"+";float:right;color:${t.mut};font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sidebar-recap-design details[open] summary{border-bottom:1px solid ${t.border};background:${t.surface2}}
.sidebar-recap-design details[open] summary:after{content:"-"}
.sidebar-recap-design pre{margin:0;max-height:520px;padding:16px;color:${t.ink};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:auto}
@media (max-width:720px){.sidebar-recap-shell{width:min(100% - 20px,1180px);padding:26px 0 48px}.sidebar-recap-prototype-frame{height:520px;min-height:360px}}
</style>`;
}

/** Insert the appendix inside a controlled shell before </body>, else before </html>, else
 *  appended — so model CSS cannot force the recap, prototypes, and DESIGN.md into cramped columns. */
export function injectGallery(html: string, gallery: string, theme: ThemeTokens = THEMES[RECOMMENDED]): string {
  if (!gallery) return html;
  const withCss = injectRecapCss(html, theme);
  if (/sidebar-recap-shell/.test(withCss)) return withCss;
  const body = /<body\b[^>]*>/i.exec(withCss);
  if (body) {
    const bodyStart = body.index + body[0].length;
    const lower = withCss.toLowerCase();
    const bodyEnd = lower.lastIndexOf("</body>");
    if (bodyEnd !== -1) {
      const inner = withCss.slice(bodyStart, bodyEnd);
      const wrapped =
        `<div class="sidebar-recap-shell"><main class="sidebar-recap-main">${inner}</main>` +
        `<div class="sidebar-recap-appendix">${gallery}</div></div>`;
      return withCss.slice(0, bodyStart) + wrapped + withCss.slice(bodyEnd);
    }
  }
  const lower = withCss.toLowerCase();
  const idx = lower.lastIndexOf("</html>");
  const wrapped = `<div class="sidebar-recap-shell"><main class="sidebar-recap-main">${withCss}</main><div class="sidebar-recap-appendix">${gallery}</div></div>`;
  return idx !== -1 ? withCss.slice(0, idx) + wrapped + withCss.slice(idx) : wrapped;
}

function injectRecapCss(html: string, theme: ThemeTokens): string {
  if (/id=["']sidebar-recap-css["']/.test(html)) return html;
  const css = recapAppendixCss(theme);
  const headEnd = html.toLowerCase().lastIndexOf("</head>");
  if (headEnd !== -1) return html.slice(0, headEnd) + css + html.slice(headEnd);
  return css + html;
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
  const appendix = artifactGalleryHtml(input.artifacts, t) + designMdSectionHtml(input.theme, t);
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
</style>${recapAppendixCss(t)}</head><body>
<div class="sidebar-recap-shell">
<main class="sidebar-recap-main">
<p class="k">Meeting Recap</p>
<h1>${esc(input.title || "Meeting")}</h1>
<p class="meta">Drafted live by the Sidebar agents · ${s.action_items.length} action item${s.action_items.length === 1 ? "" : "s"} · ${input.artifacts.length} prototype${input.artifacts.length === 1 ? "" : "s"}</p>
${section("Executive summary", `<p class="lead">${esc(s.tldr || "No summary was captured for this meeting.")}</p>`)}
${section("Key decisions", li(s.decisions))}
${section("Action items", actions)}
${section("Open questions", li(s.open_questions))}
</main>
<div class="sidebar-recap-appendix">${appendix}</div>
</div>
</body></html>`;
}
