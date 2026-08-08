/**
 * End-to-end live driver: connects to the running server, starts a meeting,
 * picks a fan-out variant, and asserts the hero loop (3 distinct designs →
 * pick → Design DNA → learned single build). Run AFTER starting the server in
 * live mode.  Usage:  bun apps/server/src/_wscheck.ts [scenarioId]
 */
const WS_URL = process.env.WS_URL ?? "ws://localhost:3001/ws";
const scenario = process.argv[2] ?? "sprint-planning";
const t0 = performance.now();
const log = (...a: unknown[]): void => console.log(`[${String(Math.round(performance.now() - t0)).padStart(5)}ms]`, ...a);

interface V { themeKey: string; html: string; ms?: number; buildId: string }
const builds: Record<string, V> = {};
let fanoutBuildId: string | null = null;
let fanoutVariants: { themeKey: string; recommended: boolean }[] = [];
let fanoutDone = 0;
let picked = false;
let learnedBuilds = 0;

const ws = new WebSocket(WS_URL);
ws.onopen = (): void => { log("open → start", scenario); ws.send(JSON.stringify({ type: "start", scenarioId: scenario })); };
ws.onerror = (e: unknown): void => { console.error("❌ WS error (is the server up in live mode?)", e); process.exit(1); };

ws.onmessage = (e: MessageEvent): void => {
  const ev = JSON.parse(String(e.data));
  switch (ev.type) {
    case "meeting.start": log("meeting.start:", ev.title, "—", ev.participants.join(", ")); break;
    case "router.decision": {
      const p = ev.decision.prototype;
      log("router → proto=" + p.trigger, "screen=" + p.uses_screen, "sum=" + ev.decision.summary_update, "fact=" + ev.decision.factcheck.trigger, p.trigger ? `intent="${p.intent}"` : "");
      break;
    }
    case "summary.update": log("summary →", ev.summary.tldr); break;
    case "factcheck.result": log("factcheck →", ev.result.checks.map((c: { verdict: string }) => c.verdict).join(",")); break;
    case "fanout.start":
      fanoutBuildId = ev.buildId; fanoutVariants = ev.variants;
      log("FANOUT", ev.buildId, "intent=\"" + ev.intent + "\"", "→", ev.variants.map((v: { themeKey: string }) => v.themeKey).join(" / "));
      break;
    case "prototype.start": builds[ev.id] = { themeKey: ev.themeKey, html: "", buildId: ev.buildId }; break;
    case "prototype.token": if (builds[ev.id]) builds[ev.id].html += ev.delta; break;
    case "prototype.complete": {
      if (builds[ev.id]) builds[ev.id].ms = ev.ideaToArtifactMs;
      log("  ✓ build", ev.themeKey, ev.ideaToArtifactMs + "ms", (ev.html.length) + "chars");
      if (ev.buildId === fanoutBuildId) {
        if (++fanoutDone === fanoutVariants.length && !picked) {
          picked = true;
          const rec = fanoutVariants.find((v) => v.recommended) ?? fanoutVariants[0];
          log("→ PICK", rec.themeKey);
          ws.send(JSON.stringify({ type: "pick", buildId: fanoutBuildId, themeKey: rec.themeKey }));
        }
      } else if (picked) {
        learnedBuilds++;
      }
      break;
    }
    case "dna.update": log("DNA →", ev.theme?.name ?? "(reset)"); break;
    case "fanout.resolved": log("fanout.resolved chosen=" + ev.chosenThemeKey); break;
    case "meeting.end": {
      log("meeting.end artifacts=" + ev.artifacts);
      const fan = Object.values(builds).filter((b) => b.buildId === fanoutBuildId);
      const distinct = new Set(fan.map((b) => b.html)).size;
      console.log(`\n── HERO LOOP ASSERTIONS ──`);
      console.log(`${fan.length === 3 ? "✅" : "❌"} fan-out produced ${fan.length} variants (expect 3)`);
      console.log(`${distinct === fan.length ? "✅" : "❌"} all ${fan.length} variants have DISTINCT html (distinct=${distinct})`);
      console.log(`${picked ? "✅" : "❌"} pick was accepted`);
      console.log(`${learnedBuilds >= 1 ? "✅" : "❌"} learned single-build(s) after pick: ${learnedBuilds}`);
      fan.forEach((b) => console.log(`     ${b.themeKey.padEnd(9)} ${String(b.ms).padStart(5)}ms  ${b.html.length} chars`));
      ws.close();
      process.exit(distinct === fan.length && fan.length === 3 && picked ? 0 : 1);
    }
  }
};

setTimeout(() => { console.error("❌ timeout after 90s"); process.exit(1); }, 90000);
