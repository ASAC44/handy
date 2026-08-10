import { useMemo } from "react";
import type { ClientEvent } from "@sidebar/shared";
import type { SidebarState } from "../ws";

/**
 * The terminal post-meeting view shown to EVERYONE (host + guests) on the same link
 * once the host ends the meeting. The Cerebras/Gemma closing agent streams the final
 * recap document (themed HTML) into a sandboxed iframe live; the host can start a new
 * meeting or download the recap, guests can exit.
 */
export function RecapView({
  state,
  send,
  hostMode,
  onLeave,
}: {
  state: SidebarState;
  send: (e: ClientEvent) => void;
  hostMode: boolean;
  onLeave: () => void;
}) {
  const doc = state.finalDoc;
  const drafting = !doc || doc.status === "building";
  const failed = doc?.status === "done" && !doc.html.trim(); // server should prevent this; guard anyway
  const renderedHtml = useMemo(() => (doc?.html ? normalizeRecapHtml(doc.html) : ""), [doc?.html]);

  const download = (): void => {
    if (!renderedHtml) return;
    const blob = new Blob([renderedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meeting-recap.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="recapScreen">
      <header className="recapBar">
        <div className="recapTitle">
          <span className="logo">&#9624;</span>
          <div>
            <div className="recapH">Meeting ended</div>
            <div className="recapSub">
              {failed ? (
                <>Couldn&rsquo;t generate the recap.</>
              ) : drafting ? (
                <span className="recapDrafting">
                  <i /> the agents are drafting your recap…
                </span>
              ) : (
                <>Final recap ready{doc?.ms ? ` · ${(doc.ms / 1000).toFixed(1)}s` : ""}</>
              )}
            </div>
          </div>
        </div>
        <div className="recapActions">
          {!drafting ? (
            <button className="capBtn" onClick={download} data-tip="Download the recap as HTML">
              Download
            </button>
          ) : null}
          {hostMode ? (
            <button
              className="capBtn primary"
              onClick={() => {
                if (confirm("Start a new meeting? This clears the recap and transcript for everyone.")) {
                  send({ type: "meeting.clear" });
                }
              }}
              data-tip="Clear the recap and start a fresh meeting"
            >
              New meeting
            </button>
          ) : (
            <button className="capBtn stop" onClick={onLeave} data-tip="Leave the meeting">
              Exit
            </button>
          )}
        </div>
      </header>
      <div className="recapBody">
        {renderedHtml ? (
          <iframe className="recapFrame" sandbox="allow-scripts" srcDoc={renderedHtml} title="Meeting recap" />
        ) : failed ? (
          <div className="recapPlaceholder">
            <p>The recap couldn&rsquo;t be generated. {hostMode ? "Start a new meeting to try again." : "Ask the host to retry."}</p>
          </div>
        ) : (
          <div className="recapPlaceholder">
            <div className="recapSpinner" />
            <p>Composing the final meeting document…</p>
          </div>
        )}
      </div>
    </div>
  );
}

const RECAP_NORMALIZE_CSS = `<style id="sidebar-recap-viewer-css">
html,body{min-height:100%}
body{margin:0!important;padding:0!important;max-width:none!important;display:block!important;overflow-x:hidden}
.sidebar-recap-shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}
.sidebar-recap-main{max-width:860px;margin:0 auto}
.sidebar-recap-main>*:first-child{margin-top:0}
.sidebar-recap-main>*:last-child{margin-bottom:0}
.sidebar-recap-appendix{margin-top:42px;display:grid;gap:32px}
.sidebar-recap-prototypes,.sidebar-recap-design{margin:0}
.sidebar-recap-prototypes>h2,.sidebar-recap-design>h2{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;margin:0 0 14px;font-weight:700}
.sidebar-recap-gallery{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))!important;gap:18px!important;align-items:start!important}
.sidebar-recap-prototype-card{margin:0!important;overflow:hidden}
.sidebar-recap-prototype-frame,.sidebar-recap-prototypes iframe{width:100%!important;height:min(620px,72vh)!important;min-height:440px!important;border:0!important;display:block!important;background:#fff}
.sidebar-recap-design details{overflow:hidden}
.sidebar-recap-design summary{cursor:pointer;padding:13px 16px;font-weight:700;list-style:none}
.sidebar-recap-design summary::-webkit-details-marker{display:none}
.sidebar-recap-design summary:after{content:"+";float:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sidebar-recap-design details[open] summary:after{content:"-"}
.sidebar-recap-design pre{margin:0!important;max-height:520px!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace!important;font-size:12px!important;line-height:1.5!important;white-space:pre-wrap!important;word-break:break-word!important;overflow:auto!important}
@media (max-width:720px){.sidebar-recap-shell{width:min(100% - 20px,1180px);padding:26px 0 48px}.sidebar-recap-prototype-frame,.sidebar-recap-prototypes iframe{height:520px!important;min-height:360px!important}}
</style>`;

function normalizeRecapHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return html;
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    ensureViewerCss(parsed);
    if (parsed.body.querySelector(".sidebar-recap-shell")) return "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;

    const shell = parsed.createElement("div");
    shell.className = "sidebar-recap-shell";
    const main = parsed.createElement("main");
    main.className = "sidebar-recap-main";
    while (parsed.body.firstChild) main.appendChild(parsed.body.firstChild);
    shell.appendChild(main);

    const appendix = parsed.createElement("div");
    appendix.className = "sidebar-recap-appendix";
    for (const section of Array.from(main.querySelectorAll("section"))) {
      const heading = section.querySelector("h2")?.textContent?.toLowerCase() ?? "";
      if (heading.includes("prototypes built")) {
        section.classList.add("sidebar-recap-prototypes");
        section.querySelectorAll("figure").forEach((figure) => figure.classList.add("sidebar-recap-prototype-card"));
        section.querySelectorAll("iframe").forEach((frame) => frame.classList.add("sidebar-recap-prototype-frame"));
        const firstDiv = section.querySelector(":scope > div");
        firstDiv?.classList.add("sidebar-recap-gallery");
        appendix.appendChild(section);
      } else if (heading.includes("design.md")) {
        section.classList.add("sidebar-recap-design");
        collapseDesignMd(parsed, section);
        appendix.appendChild(section);
      }
    }
    parsed.body.appendChild(shell);
    if (appendix.childNodes.length) shell.appendChild(appendix);
    return "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;
  } catch {
    return html;
  }
}

function ensureViewerCss(parsed: Document): void {
  if (parsed.getElementById("sidebar-recap-viewer-css")) return;
  const template = parsed.createElement("template");
  template.innerHTML = RECAP_NORMALIZE_CSS;
  parsed.head.appendChild(template.content);
}

function collapseDesignMd(parsed: Document, section: Element): void {
  if (section.querySelector("details")) return;
  const pre = section.querySelector("pre");
  if (!pre) return;
  const details = parsed.createElement("details");
  const summary = parsed.createElement("summary");
  summary.textContent = "View DESIGN.md";
  details.appendChild(summary);
  pre.replaceWith(details);
  details.appendChild(pre);
}
