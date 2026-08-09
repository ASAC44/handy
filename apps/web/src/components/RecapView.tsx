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

  const download = (): void => {
    if (!doc?.html) return;
    const blob = new Blob([doc.html], { type: "text/html" });
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
        {doc && doc.html ? (
          <iframe className="recapFrame" sandbox="allow-scripts" srcDoc={doc.html} title="Meeting recap" />
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
