import type { ServerEvent, ThemeKey, ThemeTokens } from "@sidebar/shared";

export interface MeetingRuntime {
  learned: ThemeTokens | null;
  abMode: boolean;
  latestScreenDataUri: string | null;
  send(ev: ServerEvent): void;
  awaitPick(buildId: string): Promise<ThemeKey>;
  resolvePick(buildId: string, themeKey: ThemeKey): void;
  learn(themeKey: ThemeKey): void;
}
