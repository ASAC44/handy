import { fromZod } from "universal-llm-client/zod";
import { nextStepModel } from "../llm";
import {
  nextStepsSystemFor,
  PrototypeSuggestionsSchema,
  type PrototypeSuggestion,
  type PrototypeSuggestions,
  type ThemeTokens,
} from "@sidebar/shared";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Suggest small, actionable follow-up design moves for a ready prototype. */
export async function nextStepsLive(
  intent: string,
  transcript: string,
  html: string,
  theme: ThemeTokens | null,
): Promise<PrototypeSuggestion[]> {
  const model = nextStepModel();
  const result = (await model.generateStructured(
    fromZod(PrototypeSuggestionsSchema as never, { name: "prototype_next_steps" }) as never,
    [
      { role: "system", content: nextStepsSystemFor(theme) },
      {
        role: "user",
        content:
          `INTENT: ${intent}\n\n` +
          `RECENT TRANSCRIPT:\n${transcript}\n\n` +
          `BUILT HTML (suggest next moves for this document):\n${html}\n\n` +
          `Suggest the next steps now. Respond ONLY with JSON matching the schema.`,
      },
    ],
  )) as PrototypeSuggestions;
  return sanitize(result.suggestions);
}

/** Mock suggestions keep the no-key demo flowing without a model call. */
export async function nextStepsMock(intent: string): Promise<PrototypeSuggestion[]> {
  await sleep(320);
  const suffix = intent.replace(/\s+/g, " ").trim();
  return [
    {
      label: "Add Empty State",
      intent: `Revise the prototype to include a polished empty state that fits "${suffix}" and shows the primary call to action.`,
    },
    {
      label: "Deepen Interaction",
      intent: `Revise the prototype so the main controls are wired to meaningful sample data and visible state changes.`,
    },
    {
      label: "Mobile Pass",
      intent: `Revise the prototype to make the mobile layout feel intentional, with compact spacing and touch-friendly controls.`,
    },
  ];
}

function sanitize(suggestions: PrototypeSuggestion[] | undefined): PrototypeSuggestion[] {
  const seen = new Set<string>();
  const clean: PrototypeSuggestion[] = [];
  for (const item of suggestions ?? []) {
    const label = item.label?.replace(/\s+/g, " ").trim();
    const intent = item.intent?.replace(/\s+/g, " ").trim();
    if (!label || !intent) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ label: label.slice(0, 42), intent: intent.slice(0, 240) });
    if (clean.length === 3) break;
  }
  return clean;
}
