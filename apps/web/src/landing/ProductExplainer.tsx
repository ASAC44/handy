import { ArrowDown, BookOpenText, Database, FileCode2, FileJson2, FileText, Fingerprint, Network, Radio, Route, SearchCheck, ShieldAlert, TableProperties, Users, Waypoints } from "lucide-react";

const displayStyle = { fontFamily: "'P22 Mackinac W01 Book', serif" } as const;

const flow = [
  { icon: Radio, number: "01", title: "Listen", body: "Conversation, dropped files, and new decisions reveal what the meeting needs." },
  { icon: Database, number: "02", title: "Retrieve", body: "Handy pulls the relevant company knowledge and data relationships from DataHub." },
  { icon: Route, number: "03", title: "Focus", body: "One shared context keeps only the definitions, sources, rules, and history relevant now." },
  { icon: Users, number: "04", title: "Create", body: "Every agent reads that same context to produce checks, summaries, prototypes, and the recap." },
  { icon: Waypoints, number: "05", title: "Remember", body: "Structured decisions and useful meeting knowledge flow back into company memory." },
] as const;

const companyContext = [
  { icon: BookOpenText, name: "Written knowledge", detail: "company documents and files" },
  { icon: TableProperties, name: "Data structure", detail: "databases, tables, and columns" },
  { icon: FileJson2, name: "Metric definitions", detail: "official business meaning and terminology" },
  { icon: Waypoints, name: "Past decisions", detail: "prior agreements and unresolved questions" },
  { icon: Network, name: "Relationships", detail: "tables, dashboards, files, teams, and systems" },
  { icon: ShieldAlert, name: "Sensitive context", detail: "private fields and known constraints" },
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
              One company brain behind every live meeting agent.
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-relaxed text-black/60 sm:text-base">
            <p>DataHub holds the company’s documents, data structure, metric definitions, decisions, and relationships. Handy turns the small part relevant to the current conversation into shared meeting context.</p>
            <p>That context changes as the topic changes. Every agent reads the same source instead of searching independently, so checks, summaries, prototypes, and recaps use consistent company meaning.</p>
          </div>
        </header>

        <div className="mt-16 grid gap-3 md:grid-cols-3">
          <ExplainerCard label="Company memory" title="DataHub knows what the business means." body="Definitions, tables, lineage, decisions, ownership, privacy, and existing systems stay connected instead of scattered across tools." />
          <ExplainerCard label="Shared meeting context" title="Only the relevant knowledge enters the room." body="A customer-retention discussion receives customer tables, retention definitions, related dashboards, privacy rules, and prior decisions." />
          <ExplainerCard label="Grounded creation" title="Context directly changes the artifact." body="Handy uses real terminology and relationships, avoids sensitive fields, checks downstream impact, and generates realistic prototypes." />
        </div>

        <figure className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-[#fffdf8]">
          <div className="overflow-x-auto">
            <img
              src="/graphs/handy-live-context-loop.svg"
              alt="Flowchart showing company memory in DataHub and live meeting signals forming one changing shared context that guides every Handy agent, produces grounded work, and returns structured meeting knowledge to DataHub."
              className="min-w-[920px]"
            />
          </div>
        </figure>

        <div className="mt-6 grid gap-3">
          <article>
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">The shared context loop</p>
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

          <div className="grid gap-3 lg:grid-cols-2">
            <InfoGrid label="What DataHub contributes" items={companyContext} />
            <InfoGrid label="What Handy creates" items={outputs} />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-[#151511] text-white">
          <div className="border-b border-white/10 p-6 sm:p-8">
            <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">Grounded prototype example</p>
            <blockquote className="mt-5 text-3xl sm:text-5xl" style={displayStyle}>“Build a customer-retention dashboard.”</blockquote>
          </div>
          <div className="grid lg:grid-cols-2">
            <ExampleList
              label="DataHub knows"
              items={[
                "Active customer means an order within 90 days.",
                "Customer activity comes from the orders table.",
                "order_details is the recommended dashboard source.",
                "Customer email is private.",
                "Three dashboards depend on this definition.",
              ]}
            />
            <ExampleList
              label="The prototype responds"
              items={[
                "Uses the official active-customer definition.",
                "Uses actual table and column names.",
                "Follows the correct data relationships.",
                "Excludes private fields.",
                "Matches company terminology.",
                "Shapes realistic fake values like the real data.",
              ]}
              secondary
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 rounded-2xl border border-black/10 bg-[#dcd7cd] p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">Fact and Safety Checker</p>
            <h3 className="mt-5 text-3xl sm:text-4xl" style={displayStyle}>Trace the impact before changing the definition.</h3>
          </div>
          <div className="rounded-xl border border-black/10 bg-[#efebe3] p-5">
            <p className="text-sm font-medium">“Change Active Customer from 90 days to 60 days.”</p>
            <p className="mt-4 text-sm leading-relaxed text-black/60"><strong className="text-black/80">Warning:</strong> this definition connects to three dashboards, two reports, one segmentation model, and a previous retention decision.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoGrid({ label, items }: { label: string; items: ReadonlyArray<{ icon: typeof FileText; name: string; detail: string }> }) {
  return (
    <article className="rounded-2xl border border-black/10 bg-[#dcd7cd] p-5 sm:p-7">
      <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">{label}</p>
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {items.map(({ icon: Icon, name, detail }) => (
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
  );
}

function ExampleList({ label, items, secondary = false }: { label: string; items: readonly string[]; secondary?: boolean }) {
  return (
    <div className={`p-6 sm:p-8 ${secondary ? "border-t border-white/10 bg-[#20211f] lg:border-t-0 lg:border-l" : ""}`}>
      <p className="text-[10px] font-medium tracking-[0.18em] text-white/40 uppercase">{label}</p>
      <ul className="mt-6 space-y-3 text-sm leading-relaxed text-white/65">
        {items.map((item) => <li key={item} className="flex gap-3"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/60" />{item}</li>)}
      </ul>
    </div>
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
