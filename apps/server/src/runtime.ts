import type { AgentToggles, CompanySource, DataHubImpact, ServerEvent, ThemeKey, ThemeTokens } from "@handy/shared";

export interface CompanyContext {
  prompt: string;
  sources: CompanySource[];
}

export interface MeetingMemory {
  title: string;
  tldr: string;
  decisions: string[];
  actionItems: Array<{ owner: string; task: string }>;
  openQuestions: string[];
  prototypes: string[];
  sources: CompanySource[];
}

export interface MeetingRuntime {
  learned: ThemeTokens | null;
  abMode: boolean;
  /** Per-agent enable flags — orchestrator skips disabled agents (audio-path / single-agent testing). */
  agents: AgentToggles;
  latestScreenDataUri: string | null;
  workspaceRoot: string;
  contextSummary(): string;
  refreshCompanyContext(query: string): Promise<CompanyContext>;
  saveMeetingMemory(memory: MeetingMemory): Promise<void>;
  checkCompanyImpact(change: string): Promise<DataHubImpact>;
  updateExport(ev: ServerEvent): void;
  send(ev: ServerEvent): void;
  awaitPick(buildId: string): Promise<ThemeKey>;
  resolvePick(buildId: string, themeKey: ThemeKey): void;
  learn(themeKey: ThemeKey): void;
}
