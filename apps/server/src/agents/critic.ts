import { fromZod } from "universal-llm-client/zod";
import { criticModel } from "../llm";
import {
  criticSystemFor,
  PrototypeReviewSchema,
  type PrototypeReview,
  type ThemeTokens,
} from "@sidebar/shared";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Partner / critic agent: review a just-built HTML prototype against the spoken
 * intent and return a structured verdict (ship | refine + concrete fixable issues).
 * The orchestrator feeds `refine` issues into an edit pass and re-reviews.
 */
export async function reviewLive(
  intent: string,
  transcript: string,
  html: string,
  theme: ThemeTokens | null,
): Promise<PrototypeReview> {
  const model = criticModel();
  return (await model.generateStructured(fromZod(PrototypeReviewSchema as never, { name: "prototype_review" }) as never, [
    { role: "system", content: criticSystemFor(theme) },
    {
      role: "user",
      content:
        `INTENT: ${intent}\n\n` +
        `RECENT TRANSCRIPT:\n${transcript}\n\n` +
        `BUILT HTML (review this document):\n${html}\n\n` +
        `Review it now. Respond ONLY with JSON matching the schema.`,
    },
  ])) as PrototypeReview;
}

/** Mock review for fixture/demo mode (no key): a quick, clean "ship" so the reviewer
 *  is still visible in the UI without a real model call. */
export async function reviewMock(intent: string): Promise<PrototypeReview> {
  await sleep(420);
  return {
    verdict: "ship",
    score: 0.94,
    summary: `Complete, on-brief proof-of-concept for "${intent}".`,
    issues: [],
  };
}
