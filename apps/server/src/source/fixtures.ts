import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouterDecision, MeetingSummary, FactcheckCheck, PrototypeKey } from "@sidebar/shared";

/** Shape of test-transcripts.json (the stable fixture that emulates ASR + inference). */
export interface FixtureExpect {
  router: RouterDecision;
  summary?: MeetingSummary;
  prototype?: { build: PrototypeKey; intent: string; uses_screen: boolean };
  factcheck?: FactcheckCheck;
}
export interface FixtureSegment {
  t: number;
  speaker: string;
  ms: number;
  partials?: string[];
  text: string;
  expect?: FixtureExpect;
}
export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  participants: string[];
  build: PrototypeKey;
  segments: FixtureSegment[];
}

function locate(): string {
  const candidates = [
    resolve(process.cwd(), "test-transcripts.json"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../test-transcripts.json"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("test-transcripts.json not found (looked in cwd and repo root)");
}

let cache: Scenario[] | null = null;
export function loadScenarios(): Scenario[] {
  if (!cache) {
    const raw = JSON.parse(readFileSync(locate(), "utf8")) as { scenarios: Scenario[] };
    cache = raw.scenarios;
  }
  return cache;
}
export function getScenario(id?: string): Scenario {
  const all = loadScenarios();
  return all.find((s) => s.id === id) ?? all[0]!;
}
