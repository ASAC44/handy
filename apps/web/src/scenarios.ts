/** The built-in demo meetings the host can replay. Shared by the transcript-header
 *  scenario dropdown and the footer replay control so both stay in sync. The full
 *  transcripts + gold labels live server-side in test-transcripts.json; these are
 *  just the picker labels (ids must match the server scenarios). */
export interface DemoScenario {
  id: string;
  title: string;
  sub: string;
}

export const SCENARIOS: DemoScenario[] = [
  { id: "sprint-planning", title: "Q3 Sprint Planning", sub: "kanban" },
  { id: "growth-review", title: "Growth Review", sub: "dashboard" },
  { id: "launch-page", title: "Launch Page Jam", sub: "landing" },
];
