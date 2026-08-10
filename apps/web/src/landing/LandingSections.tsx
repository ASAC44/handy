import { Activity, CheckCircle2, Code2, Eye, FileText, Search, Users, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import { ProductExplainer } from "./ProductExplainer";

const serifStyle = { fontFamily: "'P22 Mackinac W01 Book', serif" } as const;

const capabilities = [
  { image: "/landing/accepted-context-card.jpg", icon: FileText, title: "Accepted context", body: "Bring the specs, research, examples, and source files the room needs. Host-reviewed context informs every live agent." },
  { image: "/landing/conversation-context-card.jpg", icon: Activity, title: "Conversation context", body: "The live transcript gives each agent the current discussion, recent turns, routing signals, and the decisions already forming." },
  { image: "/landing/live-evidence-card.jpg", icon: Search, title: "Live evidence", body: "Checkable claims trigger web retrieval, adding current evidence before the room turns an assumption into a decision." },
  { image: "/landing/screen-context-card.jpg", icon: Eye, title: "Screen context", body: "Shared-screen frames let agents understand what people are pointing at when they say, “build it like this.”" },
  { image: "/landing/realtime-assets-demos-card.jpg", icon: Code2, title: "Real-time assets & demos", body: "Generate runnable demos, dashboards, prototype screens, and decision artifacts from the live discussion and its full context." },
  { image: "/landing/durable-context-card.jpg", icon: Waypoints, title: "Durable context", body: "Decisions, owners, open questions, prototypes, and Design DNA carry into the recap and the next meeting." },
] as const;

const dataSignals = [
  { image: "/landing/schema-card.jpg", label: "Schemas" },
  { image: "/landing/lineage-card.jpg", label: "Lineage" },
  { image: "/landing/ownership-card.jpg", label: "Ownership" },
  { image: "/landing/quality-signals-card.jpg", label: "Quality signals" },
] as const;

function SectionLabel({ children }: { children: string }) {
  return <p className="text-[10px] font-medium tracking-[0.18em] text-white/45 uppercase">{children}</p>;
}

export function LandingSections() {
  return (
    <>
      <section className="bg-black px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Live meetings with context</SectionLabel>
          <h2 className="mt-7 max-w-5xl text-5xl leading-[0.98] tracking-tight text-white sm:text-7xl lg:text-8xl" style={serifStyle}>
            Bring in the right context. Leave with real assets, live demos, and better decisions.
          </h2>
          <p className="mt-8 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">
            Handy gives a live meeting the material, history, evidence, and data knowledge it needs—then keeps that context connected to what the room builds and decides.
          </p>
          <div className="mt-16 grid gap-3 md:grid-cols-3">
            <Metric image="/landing/before-context.jpg" value="Before" label="Bring in trusted files, research, and workspace context." />
            <Metric image="/landing/during-context.jpg" value="During" label="Retrieve evidence and generate real-time assets and demos as people speak." />
            <Metric image="/landing/after-context.jpg" value="After" label="Carry decisions, prototypes, and open questions forward." />
          </div>
        </div>
      </section>

      <ProductExplainer />

      <section id="live-room" className="scroll-mt-8 bg-[#080909] px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
            <div>
              <SectionLabel>The live dashboard</SectionLabel>
              <h2 className="mt-6 text-5xl leading-none tracking-tight text-white sm:text-7xl" style={serifStyle}>One live meeting. Every layer of context.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-white/50 sm:text-base lg:justify-self-end">
              The transcript, accepted files, screen, evidence, real-time assets, runnable demos, decisions, and active agents stay visible in one shared view.
            </p>
          </div>
          <LiveRoomPreview />
        </div>
      </section>

      <section id="features" className="scroll-mt-8 bg-[#0d0e0d] px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-6 max-w-4xl text-5xl leading-none tracking-tight text-white sm:text-7xl" style={serifStyle}>Context that turns into real work, in real time.</h2>
          <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ image, icon: Icon, title, body }, index) => (
              <LandingCard key={title} className="relative min-h-80 overflow-hidden">
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
                <div className="relative flex min-h-80 flex-col p-6">
                  <div className="flex items-center justify-between text-white/45">
                    <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                    <span className="text-[10px] tracking-[0.16em]">0{index + 1}</span>
                  </div>
                  <div className="mt-auto pt-16">
                    <h3 className="text-2xl text-white" style={serifStyle}>{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{body}</p>
                  </div>
                </div>
              </LandingCard>
            ))}
          </div>
        </div>
      </section>

      <section id="prototypes" className="scroll-mt-8 bg-[#e7e1d7] px-6 py-28 text-[#121310] sm:py-36">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[10px] font-medium tracking-[0.18em] text-black/45 uppercase">Real-time assets and live demos</p>
            <h2 className="mt-6 text-5xl leading-[0.98] tracking-tight sm:text-7xl" style={serifStyle}>Talk through the idea. See the working demo appear.</h2>
            <p className="mt-7 max-w-lg text-base leading-relaxed text-black/55">
              Ask for a dashboard, product flow, prototype screen, data view, or new state. Handy combines the live discussion with accepted context and streams something the room can see, click, and refine immediately.
            </p>
            <div className="mt-9 space-y-4 text-sm font-medium">
              <FeatureLine>Runnable demos generated during the meeting.</FeatureLine>
              <FeatureLine>Real-time assets grounded in files and live data.</FeatureLine>
              <FeatureLine>Every output preserved with the decision that shaped it.</FeatureLine>
            </div>
          </div>
          <PrototypePreview />
        </div>
      </section>

      <section id="datahub" className="scroll-mt-8 bg-[#090a09] px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
            <div>
              <SectionLabel>Building with DataHub</SectionLabel>
              <h2 className="mt-6 text-5xl leading-none tracking-tight text-white sm:text-7xl" style={serifStyle}>The context layer behind the conversation.</h2>
            </div>
            <p className="max-w-xl text-base leading-relaxed text-white/50 lg:justify-self-end">
              Handy is becoming a context-aware live meeting layer for data teams. DataHub can ground the room in what a dataset is, what depends on it, who owns it, and whether it is healthy before anyone acts.
            </p>
          </div>
          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dataSignals.map(({ image, label }, index) => (
              <LandingCard key={label} className="relative min-h-52 overflow-hidden">
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
                <div className="relative flex min-h-52 flex-col justify-between p-5">
                  <span className="text-[10px] text-white/45">0{index + 1}</span>
                  <h3 className="text-xl text-white" style={serifStyle}>{label}</h3>
                </div>
              </LandingCard>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-8 bg-[#0d0e0d] px-6 py-28 sm:py-36">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>The context loop</SectionLabel>
          <h2 className="mt-6 max-w-4xl text-5xl leading-none tracking-tight text-white sm:text-7xl" style={serifStyle}>Context enters live, shapes the work, and leaves more useful.</h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/10 lg:grid-cols-4">
            <FlowStep number="01" title="Bring context" body="Accept trusted files, screen references, and data knowledge." />
            <FlowStep number="02" title="Understand live" body="Combine that context with the conversation as it unfolds." />
            <FlowStep number="03" title="Create in-room" body="Generate evidence, real-time assets, live demos, and structured decisions." />
            <FlowStep number="04" title="Carry forward" body="Preserve the outcome as context for the next person or agent." />
          </div>
        </div>
      </section>

      <section className="flex min-h-[80vh] items-end bg-black px-6 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <SectionLabel>Meet with context</SectionLabel>
          <h2 className="mt-6 max-w-5xl text-6xl leading-[0.92] tracking-tight text-white sm:text-8xl lg:text-9xl" style={serifStyle}>Leave with assets and demos, not just meeting notes.</h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="/dashboard" className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Open current demo</a>
            <a href="https://datahub.devpost.com/" target="_blank" rel="noopener noreferrer" className="liquid-glass relative z-10 rounded-full px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">View the hackathon</a>
          </div>
          <footer className="mt-24 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <span>Handy · Live meetings with context</span>
            <span>Building the context loop with DataHub</span>
          </footer>
        </div>
      </section>
    </>
  );
}

function Metric({ image, value, label }: { image: string; value: string; label: string }) {
  return <LandingCard className="overflow-hidden"><img src={image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" /><div className="p-6"><div className="text-4xl text-white" style={serifStyle}>{value}</div><p className="mt-5 text-sm leading-relaxed text-white/45">{label}</p></div></LandingCard>;
}

function LandingCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/[0.08] bg-[#161716] ${className}`}>{children}</div>;
}

function FeatureLine({ children }: { children: string }) {
  return <div className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-black/20"><CheckCircle2 size={14} aria-hidden="true" /></span>{children}</div>;
}

function FlowStep({ number, title, body }: { number: string; title: string; body: string }) {
  return <article className="min-h-64 bg-[#131413] p-6"><div className="text-[10px] tracking-[0.16em] text-white/30">{number}</div><h3 className="mt-16 text-3xl text-white" style={serifStyle}>{title}</h3><p className="mt-3 text-sm leading-relaxed text-white/45">{body}</p></article>;
}

function LiveRoomPreview() {
  return (
    <LandingCard className="mt-14 p-3 sm:p-4">
      <div className="overflow-hidden rounded-xl bg-[#0c0d0c]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[10px] text-white/40"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white" />LIVE · PRODUCT REVIEW</span><span className="flex items-center gap-1.5"><Users size={12} /> 6 IN ROOM</span></div>
        <div className="grid min-h-[470px] lg:grid-cols-[0.75fr_1.5fr_0.8fr]">
          <div className="border-b border-white/10 p-4 lg:border-r lg:border-b-0">
            <PreviewLabel>Transcript</PreviewLabel>
            <TranscriptLine speaker="Maya" text="Show retention by workspace size." />
            <TranscriptLine speaker="Handy" text="Routing to prototype + evidence." active />
            <TranscriptLine speaker="Jon" text="Flag the enterprise drop-off." />
          </div>
          <div className="border-b border-white/10 p-4 lg:border-r lg:border-b-0"><PreviewLabel>Prototype stream</PreviewLabel><MiniDashboard /></div>
          <div className="p-4"><PreviewLabel>Room memory</PreviewLabel><MemoryLine label="Decision" text="Segment retention by workspace size." /><MemoryLine label="Action · Maya" text="Review enterprise onboarding." /><MemoryLine label="Open question" text="Did activation change?" /></div>
        </div>
      </div>
    </LandingCard>
  );
}

function PreviewLabel({ children }: { children: string }) {
  return <div className="text-[9px] font-medium tracking-[0.16em] text-white/35 uppercase">{children}</div>;
}

function TranscriptLine({ speaker, text, active = false }: { speaker: string; text: string; active?: boolean }) {
  return <div className="mt-6"><div className="text-[9px] tracking-wider text-white/30 uppercase">{speaker}</div><p className={`mt-1.5 text-sm leading-relaxed ${active ? "text-white" : "text-white/60"}`}>{text}</p></div>;
}

function MemoryLine({ label, text }: { label: string; text: string }) {
  return <div className="mt-6 border-l border-white/15 pl-3"><div className="text-[9px] tracking-wider text-white/35 uppercase">{label}</div><p className="mt-1.5 text-xs leading-relaxed text-white/60">{text}</p></div>;
}

function MiniDashboard() {
  return <div className="mt-5 rounded-xl bg-[#e7e1d7] p-4 text-[#121310]"><div className="flex items-center justify-between"><div><div className="text-[9px] text-black/40 uppercase">Retention explorer</div><div className="mt-1 text-lg font-semibold">Enterprise needs attention</div></div><span className="rounded-full bg-black px-2.5 py-1 text-[9px] text-white">Live data</span></div><div className="mt-6 grid grid-cols-3 gap-2">{[['Small','78%',72],['Mid','84%',84],['Enterprise','63%',56]].map(([label,value,height]) => <div key={label} className="rounded-lg bg-white p-3"><div className="text-[9px] text-black/40">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div><div className="mt-4 flex h-24 items-end bg-black/5 px-2"><div className="w-full rounded-t bg-black" style={{ height: `${height}%` }} /></div></div>)}</div></div>;
}

function PrototypePreview() {
  return <div className="rounded-2xl border border-black/15 bg-[#171817] p-3"><div className="flex items-center justify-between border-b border-white/10 px-2 pb-3 text-[9px] text-white/40"><span>LIVE PROTOTYPE · CUSTOMER HEALTH</span><span>READY · 1.5S</span></div><div className="mt-3 rounded-xl bg-white p-5"><div className="flex items-center justify-between"><div className="font-semibold">Northstar / Accounts</div><span className="rounded-full bg-black px-3 py-1.5 text-[9px] text-white">Export view</span></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Healthy','128'],['At risk','17'],['Expansion','$84k'],['Signals','341']].map(([label,value]) => <div key={label} className="rounded-lg border border-black/10 p-3"><div className="text-[9px] text-black/40">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div><div className="mt-3 rounded-lg border border-black/10 p-4"><div className="text-[9px] text-black/40">HEALTH BY SEGMENT</div><div className="mt-6 flex h-40 items-end gap-3">{[52,72,61,86,67,92,78,84].map((height,index) => <div key={index} className="flex-1 rounded-t bg-black" style={{ height: `${height}%` }} />)}</div></div></div></div>;
}
