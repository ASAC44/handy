import { ArrowRight, Code2, Globe, Trophy } from "lucide-react";
import { Logo } from "../components/Logo";
import { LandingSections } from "./LandingSections";
import { LoopingBackgroundVideo } from "./LoopingBackgroundVideo";

const navigation = [
  { label: "Features", href: "#features" },
  { label: "DataHub", href: "#datahub" },
] as const;

const socialLinks = [
  { label: "Handy source on GitHub", href: "https://github.com/ASAC44/handy", icon: Code2 },
  { label: "DataHub Agent Hackathon", href: "https://datahub.devpost.com/", icon: Trophy },
  { label: "DataHub Agent Context", href: "https://docs.datahub.com/docs/dev-guides/agent-context/agent-context", icon: Globe },
] as const;

function Navbar() {
  return (
    <header className="relative z-20 p-3 sm:p-4">
      <nav aria-label="Primary navigation" className="mx-auto flex max-w-5xl items-center justify-between rounded-[10px] border border-white/15 bg-black/35 py-1 pr-1 pl-4 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2 rounded-sm text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <span className="[--logo-fill:transparent] [&_.agent-logo]:h-7 [&_.agent-logo]:w-7">
              <Logo />
            </span>
            <span className="text-base font-semibold">Handy</span>
          </a>
          <div className="hidden items-center gap-6 md:flex">
            {navigation.map((item) => (
              <a key={item.label} href={item.href} className="rounded-sm text-sm font-medium text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a href="https://datahub.devpost.com/" target="_blank" rel="noopener noreferrer" className="hidden rounded-sm text-sm font-medium text-white transition-colors hover:text-white/75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:inline">
            View challenge
          </a>
          <a
            href="https://github.com/ASAC44/handy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Handy on GitHub"
            className="grid h-9 w-9 place-items-center rounded-[6px] border border-white/15 bg-white/[0.04] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <img src="https://github.githubassets.com/favicons/favicon.svg" alt="" className="h-4 w-4 invert" />
          </a>
          <a href="/dashboard" className="rounded-[6px] border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Open demo
          </a>
        </div>
      </nav>
    </header>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <section className="relative flex min-h-screen flex-col overflow-hidden supports-[height:100svh]:min-h-[100svh]">
        <LoopingBackgroundVideo />
        <div className="pointer-events-none absolute inset-0 bg-black/40" aria-hidden="true" />
        <Navbar />

        <main className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
        <a
          href="https://datahub.devpost.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="liquid-glass relative z-10 mb-6 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full px-4 py-2 text-[10px] font-medium tracking-[0.12em] text-white/85 uppercase transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-xs"
        >
          <Trophy size={14} aria-hidden="true" />
          <span>Built for the DataHub Agent Hackathon</span>
          <span className="text-white/35" aria-hidden="true">·</span>
          <span>Powered by DataHub</span>
        </a>

        <h1
          className="mb-8 whitespace-nowrap text-4xl tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ fontFamily: "'P22 Mackinac W01 Book', serif" }}
        >
          Live meetings, with context.
        </h1>

        <div className="w-full max-w-xl space-y-4">
          <p className="px-4 text-sm leading-relaxed text-white">
            Handy brings context into the meeting while people speak—then generates real-time assets, live dashboards, runnable demos, evidence, and decisions in the room.
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-3">
            <a href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Open live room <ArrowRight size={16} aria-hidden="true" />
            </a>
            <a href="#features" className="liquid-glass relative z-10 rounded-full px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Explore features
            </a>
          </div>
        </div>
        </main>

        <footer className="relative z-10 flex justify-center gap-4 pb-12">
        {socialLinks.map(({ label, href, icon: Icon }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="liquid-glass relative z-10 rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Icon size={20} aria-hidden="true" />
          </a>
        ))}
        </footer>
      </section>
      <LandingSections />
    </div>
  );
}
