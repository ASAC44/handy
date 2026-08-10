import { ArrowDown, FileCode2, FileJson2, FileText, Fingerprint, Radio, Route, SearchCheck, Users, Waypoints } from "lucide-react";

const displayStyle = { fontFamily: "'P22 Mackinac W01 Book', serif" } as const;

const flow = [
  { icon: Radio, number: "01", title: "Listen", body: "A finalized speech turn enters with its speaker and timestamp." },
  { icon: Waypoints, number: "02", title: "Ground", body: "Handy combines the turn with recent transcript, rolling summary, accepted files, and an optional screen frame." },
  { icon: Route, number: "03", title: "Route", body: "A lightweight router decides whether this moment needs a summary update, fact-check, or prototype." },
  { icon: FileCode2, number: "04", title: "Create", body: "The selected agent structures the discussion or streams a working HTML artifact into the room." },
  { icon: Users, number: "05", title: "Share", body: "Settled events reach every participant; completed artifacts and meeting state are written to the export package." },
] as const;

const outputs = [
  { icon: FileText, name: "Live transcript", detail: "partials, final turns, speakers" },
  { icon: FileJson2, name: "Structured summary", detail: "decisions, owners, open questions" },
  { icon: SearchCheck, name: "Evidence checks", detail: "verdict, confidence, source" },
  { icon: FileCode2, name: "Runnable prototypes", detail: "single-file HTML, reviewed and editable" },
  { icon: Fingerprint, name: "DESIGN.md", detail: "the room’s chosen visual direction" },
  { icon: Waypoints, name: "Meeting recap", detail: "summary, artifacts, transcript, manifest" },
] as const;

export function ProductExplainer() {
  return (
    <section id="product" className="scroll-mt-8 bg-[#e7e1d7] px-6 py-28 text-[#151511] sm:py-36">
      <div className="mx-auto max-w-6xl">
        <header className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">The complete product</p>
            <h2 className="mt-6 max-w-4xl text-5xl leading-[0.96] tracking-tight sm:text-7xl" style={displayStyle}>
              The meeting becomes the workspace while the idea is still alive.
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-relaxed text-black/60 sm:text-base">
            <p>Most meeting tools preserve a conversation after it ends. Handy intervenes during it: the room can inspect evidence, react to a prototype, choose a direction, and make the next change without losing the conversational moment.</p>
            <p>The product is one shared event loop—not a chatbot beside a call. Speech, screen context, reviewed files, agents, people, and generated artifacts stay connected from the first utterance to the final export.</p>
          </div>
        </header>

        <div className="mt-16 grid gap-3 md:grid-cols-3">
          <ExplainerCard label="The problem" title="Talk outruns execution." body="By the time notes become tickets, research, or a prototype, the assumptions and energy that shaped the idea are already gone." />
          <ExplainerCard label="The intervention" title="Create inside the conversation." body="Handy routes each meaningful turn to the right agent and surfaces the result where everyone can react to it immediately." />
          <ExplainerCard label="The outcome" title="Leave with working context." body="The room ends with decisions, evidence, prototypes, a learned design direction, and a portable meeting package—not only a transcript." />
        </div>

        <figure className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-[#fffdf8]">
          <div className="overflow-x-auto">
            <img
              src="/graphs/handy-live-context-loop.svg"
              alt="Flowchart showing meeting speech, screen, accepted files, and DataHub metadata entering Handy’s router; agents then structure discussion, build prototypes, share results with the live room, and save a reusable meeting package."
              className="min-w-[920px]"
            />
          </div>
        </figure>

        <div className="mt-6 grid gap-3">
          <article>
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">One utterance through the system</p>
            <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {flow.map(({ icon: Icon, number, title, body }, index) => (
                <div key={title} className="contents">
                  <div className="flex aspect-square flex-col rounded-xl border border-black/10 bg-[#efebe3] p-4">
                    <div className="flex items-center justify-between text-black/45">
                      <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
                      <span className="text-[10px]">{number}</span>
                    </div>
                    <h3 className="mt-auto pt-8 text-2xl" style={displayStyle}>{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-black/55">{body}</p>
                  </div>
                  {index < flow.length - 1 ? <ArrowDown className="mx-auto text-black/30 sm:hidden" size={16} aria-hidden="true" /> : null}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-black/10 bg-[#dcd7cd] p-5 sm:p-7">
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">What the room can take away</p>
            <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {outputs.map(({ icon: Icon, name, detail }) => (
                <div key={name} className="grid min-h-28 grid-cols-[auto_1fr] gap-x-3 rounded-xl border border-black/10 bg-[#efebe3] p-4">
                  <Icon className="mt-0.5 text-black/45" size={17} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-medium">{name}</h3>
                    <p className="mt-1 text-xs text-black/50">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="mt-6 grid overflow-hidden rounded-2xl border border-black/10 bg-[#151511] text-white lg:grid-cols-2">
          <div className="p-6 sm:p-8">
            <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">Meeting context</p>
            <h3 className="mt-5 text-3xl sm:text-4xl" style={displayStyle}>Context the host can review and accept.</h3>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55">People can bring files and folders into the room. Guest uploads remain pending until the host accepts them; only accepted previews are added to agent prompts.</p>
          </div>
          <div className="border-t border-white/10 bg-[#20211f] p-6 sm:p-8 lg:border-t-0 lg:border-l">
            <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">DataHub context</p>
            <h3 className="mt-5 text-3xl sm:text-4xl" style={displayStyle}>Context that knows what the data means.</h3>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/55">Schemas, lineage, ownership, and quality signals give the router richer context. The room can ask not only “what table?” but “what depends on it, who owns it, and is it healthy enough to use?”</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExplainerCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <article className="min-h-72 rounded-2xl border border-black/10 bg-[#dcd7cd] p-6">
      <p className="text-[10px] font-medium tracking-[0.16em] text-black/40 uppercase">{label}</p>
      <h3 className="mt-16 text-3xl leading-tight" style={displayStyle}>{title}</h3>
      <p className="mt-4 text-sm leading-relaxed text-black/55">{body}</p>
    </article>
  );
}
