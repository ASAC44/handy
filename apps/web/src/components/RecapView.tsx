import { useMemo } from "react";
import type { ClientEvent, ExportFileInfo } from "@handy/shared";
import type { HandyState } from "../ws";
import { getKey } from "../auth";
import { Logo } from "./Logo";

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
  state: HandyState;
  send: (e: ClientEvent) => void;
  hostMode: boolean;
  onLeave: () => void;
}) {
  const doc = state.finalDoc;
  const drafting = !doc || doc.status === "building";
  const failed = doc?.status === "done" && !doc.html.trim(); // server should prevent this; guard anyway
  const renderedHtml = useMemo(() => (doc?.html ? normalizeRecapHtml(doc.html) : ""), [doc?.html]);
  const exportFiles = useMemo(() => orderedExportFiles(state.exports.files), [state.exports.files]);
  const recapFile = exportFiles.find((file) => file.kind === "recap");
  const manifestFile = state.exports.files.find((file) => file.kind === "manifest");
  const meetingMemory = state.datahubMemory.find((memory) => memory.kind === "meeting");

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
          <span className="logo"><Logo /></span>
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
            {meetingMemory ? <div className={"recapMemory " + meetingMemory.status}>DataHub memory {meetingMemory.status}</div> : null}
          </div>
        </div>
        <div className="recapActions">
          {!drafting ? (
            recapFile ? (
              <a className="capBtn" href={exportHref(recapFile.url)} download data-tip="Download the saved host copy">
                Download recap
              </a>
            ) : (
              <button className="capBtn" onClick={download} data-tip="Download the recap as HTML">
                Download recap
              </button>
            )
          ) : null}
          {manifestFile ? (
            <a className="capBtn" href={exportHref((manifestFile ?? exportFiles[0])!.url)} download data-tip="Download the export manifest">
              Manifest
            </a>
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
        {exportFiles.length ? <ExportPanel root={state.exports.root} files={exportFiles} /> : null}
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

function ExportPanel({ root, files }: { root: string; files: ExportFileInfo[] }) {
  return (
    <aside className="recapExports" aria-label="Meeting exports">
      <div className="exportKicker">Saved exports</div>
      <div className="exportRoot" title={root}>
        {root}
      </div>
      <div className="exportList">
        {files.map((file) => (
          <a key={file.id} className="exportFile" href={exportHref(file.url)} download>
            <span>{labelFor(file.kind)}</span>
            <b>{file.name}</b>
            <i>{formatBytes(file.size)}</i>
          </a>
        ))}
      </div>
    </aside>
  );
}

function orderedExportFiles(files: ExportFileInfo[]): ExportFileInfo[] {
  const order: Record<string, number> = { recap: 0, prototype: 1, design: 2, summary: 3, transcript: 4, manifest: 5, readme: 6 };
  return [...files].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.name.localeCompare(b.name));
}

function exportHref(url: string): string {
  const key = getKey();
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}key=${encodeURIComponent(key)}`;
}

function labelFor(kind: ExportFileInfo["kind"]): string {
  switch (kind) {
    case "recap":
      return "Recap";
    case "prototype":
      return "Prototype";
    case "design":
      return "Design DNA";
    case "summary":
      return "Summary";
    case "transcript":
      return "Transcript";
    case "manifest":
      return "Manifest";
    case "readme":
      return "Readme";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RECAP_NORMALIZE_CSS = `<style id="handy-recap-viewer-css">
html,body{min-height:100%}
body{margin:0!important;padding:0!important;max-width:none!important;display:block!important;overflow-x:hidden}
.handy-recap-shell{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:48px 0 72px}
.handy-recap-main{max-width:860px;margin:0 auto}
.handy-recap-main>*:first-child{margin-top:0}
.handy-recap-main>*:last-child{margin-bottom:0}
.handy-recap-appendix{margin-top:42px;display:grid;gap:32px}
.handy-recap-prototypes,.handy-recap-design{margin:0}
.handy-recap-prototypes>h2,.handy-recap-design>h2{font-size:11px;letter-spacing:1.4px;margin:0 0 14px;font-weight:700}
.handy-recap-gallery{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))!important;gap:18px!important;align-items:start!important}
.handy-recap-prototype-card{margin:0!important;overflow:hidden}
.handy-recap-prototype-frame,.handy-recap-prototypes iframe{width:100%!important;height:min(620px,72vh)!important;min-height:440px!important;border:0!important;display:block!important;background:#fff}
.handy-recap-design details{overflow:hidden}
.handy-recap-design summary{cursor:pointer;padding:13px 16px;font-weight:700;list-style:none}
.handy-recap-design summary::-webkit-details-marker{display:none}
.handy-recap-design summary:after{content:"+";float:right;font-family:"DM Sans",system-ui,sans-serif}
.handy-recap-design details[open] summary:after{content:"-"}
.handy-recap-design pre{margin:0!important;max-height:520px!important;font-family:"DM Sans",system-ui,sans-serif!important;font-size:12px!important;line-height:1.5!important;white-space:pre-wrap!important;word-break:break-word!important;overflow:auto!important}
@media (max-width:720px){.handy-recap-shell{width:min(100% - 20px,1180px);padding:26px 0 48px}.handy-recap-prototype-frame,.handy-recap-prototypes iframe{height:520px!important;min-height:360px!important}}
</style>`;

function normalizeRecapHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === "undefined") return html;
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    ensureViewerCss(parsed);
    if (parsed.body.querySelector(".handy-recap-shell")) return "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;

    const shell = parsed.createElement("div");
    shell.className = "handy-recap-shell";
    const main = parsed.createElement("main");
    main.className = "handy-recap-main";
    while (parsed.body.firstChild) main.appendChild(parsed.body.firstChild);
    shell.appendChild(main);

    const appendix = parsed.createElement("div");
    appendix.className = "handy-recap-appendix";
    for (const section of Array.from(main.querySelectorAll("section"))) {
      const heading = section.querySelector("h2")?.textContent?.toLowerCase() ?? "";
      if (heading.includes("prototypes built")) {
        section.classList.add("handy-recap-prototypes");
        section.querySelectorAll("figure").forEach((figure) => figure.classList.add("handy-recap-prototype-card"));
        section.querySelectorAll("iframe").forEach((frame) => frame.classList.add("handy-recap-prototype-frame"));
        const firstDiv = section.querySelector(":scope > div");
        firstDiv?.classList.add("handy-recap-gallery");
        appendix.appendChild(section);
      } else if (heading.includes("design.md")) {
        section.classList.add("handy-recap-design");
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
  if (parsed.getElementById("handy-recap-viewer-css")) return;
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
