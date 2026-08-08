import { useEffect, useRef, type ReactNode } from "react";
import type { SidebarState } from "../ws";

export function Rail({ state }: { state: SidebarState }) {
  return (
    <aside className="rail">
      <Transcript state={state} />
      <Summary state={state} />
      <FactCheck state={state} />
    </aside>
  );
}

function Transcript({ state }: { state: SidebarState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.transcript.length]);
  return (
    <div className="panel">
      <div className="panel-h">
        Live transcript <span className="rec" />
      </div>
      <div className="panel-b trans" ref={ref}>
        {state.transcript.length === 0 && <div className="empty">Waiting for the meeting…</div>}
        {state.transcript.map((l) =>
          l.kind === "router" && l.router ? (
            <div key={l.id} className="line router">
              <b>&rarr; router</b>&nbsp; prototype{" "}
              <span className={l.router.proto ? "y" : "n"}>{l.router.proto ? "fire" : "skip"}</span> &middot; summary{" "}
              <span className={l.router.summary ? "y" : "n"}>{l.router.summary ? "update" : "skip"}</span> &middot; factcheck{" "}
              <span className={l.router.fact ? "y" : "n"}>{l.router.fact ? "fire" : "skip"}</span>
              {l.router.screen ? (
                <>
                  {" "}
                  &middot; <span className="y">+screenshot</span>
                </>
              ) : null}
            </div>
          ) : (
            <div key={l.id} className={"line" + (l.kind === "partial" ? " partial" : "")}>
              <span className="sp">{l.speaker ?? "…"}</span>
              {l.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Summary({ state }: { state: SidebarState }) {
  const s = state.summary;
  return (
    <div className="panel">
      <div className="panel-h">
        Rolling summary <span className="tag sum">summarizer</span>
      </div>
      <div className="panel-b">
        <div className="sum-tldr">
          <span className="k">TL;DR</span>
          {s?.tldr ?? "Listening…"}
        </div>
        <Sec cls="" title="Decisions" items={s?.decisions ?? []} render={(d) => d} />
        <Sec
          cls="act"
          title="Action items"
          items={s?.action_items ?? []}
          render={(a) => (
            <>
              <span className="owner">{a.owner}</span>
              {a.task}
            </>
          )}
        />
        <Sec cls="open" title="Open questions" items={s?.open_questions ?? []} render={(q) => q} />
      </div>
    </div>
  );
}

function Sec<T>({
  cls,
  title,
  items,
  render,
}: {
  cls: string;
  title: string;
  items: T[];
  render: (x: T) => ReactNode;
}) {
  return (
    <div className={"sum-sec " + cls}>
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((it, i) => (
            <li key={i}>{render(it)}</li>
          ))}
        </ul>
      ) : (
        <div className="empty">—</div>
      )}
    </div>
  );
}

function FactCheck({ state }: { state: SidebarState }) {
  return (
    <div className="panel">
      <div className="panel-h">
        Fact-check <span className="tag fc">stretch</span>
      </div>
      <div className="panel-b">
        {state.factchecks.length === 0 && <div className="empty">No checkable claims yet.</div>}
        {state.factchecks.map((f, i) => (
          <div className="fc" key={i}>
            <div className="claim">&ldquo;{f.claim}&rdquo;</div>
            <div className="row">
              <span className={"verdict v-" + f.verdict}>{f.verdict}</span>
              <span className="conf">confidence {f.confidence}</span>
              <span className="src">&#128279; {f.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
