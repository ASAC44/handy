import type { AgentToggles, ServerEvent, ThemeKey, ThemeTokens } from "@sidebar/shared";

export interface MeetingRuntime {
  learned: ThemeTokens | null;
  abMode: boolean;
  /** Per-agent enable flags — orchestrator skips disabled agents (audio-path / single-agent testing). */
  agents: AgentToggles;
  latestScreenDataUri: string | null;
  workspaceRoot: string;
  contextSummary(): string;
  send(ev: ServerEvent): void;
  awaitPick(buildId: string): Promise<ThemeKey>;
  resolvePick(buildId: string, themeKey: ThemeKey): void;
  learn(themeKey: ThemeKey): void;
}
