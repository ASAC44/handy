import { z } from "zod";

/**
 * Strict structured-output schemas for the agents.
 * These mirror the JSON Schemas in the build spec (section 4) and double as the
 * gold-label shape used by test-transcripts.json `expect` blocks.
 */

export const RouterDecisionSchema = z.object({
  topic_shift: z.boolean(),
  summary_update: z.boolean(),
  prototype: z.object({
    trigger: z.boolean(),
    intent: z.string(),
    uses_screen: z.boolean(),
  }),
  factcheck: z.object({
    trigger: z.boolean(),
    claims: z.array(z.string()),
  }),
});
export type RouterDecision = z.infer<typeof RouterDecisionSchema>;

export const ActionItemSchema = z.object({
  owner: z.string(),
  task: z.string(),
});

export const MeetingSummarySchema = z.object({
  tldr: z.string(),
  decisions: z.array(z.string()),
  action_items: z.array(ActionItemSchema),
  open_questions: z.array(z.string()),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

export const VerdictSchema = z.enum(["supported", "contradicted", "unverified"]);

export const FactcheckCheckSchema = z.object({
  claim: z.string(),
  verdict: VerdictSchema,
  confidence: z.number(),
  source: z.string(),
  /** Optional one-clause context for nuanced or time-sensitive verdicts (e.g. "as of <date>, …"). */
  note: z.string().optional(),
});
export type FactcheckCheck = z.infer<typeof FactcheckCheckSchema>;

export const FactcheckResultSchema = z.object({
  checks: z.array(FactcheckCheckSchema),
});
export type FactcheckResult = z.infer<typeof FactcheckResultSchema>;

/**
 * Prototype review — the "partner" / critic agent's verdict on a just-built artifact.
 * Drives the build → review → refine loop: `refine` + concrete `issues` feed an edit
 * pass (reusing the SEARCH/REPLACE evolve path); `ship` ends the loop.
 */
export const ReviewIssueSchema = z.object({
  severity: z.enum(["minor", "major"]),
  area: z.enum(["completeness", "interactivity", "visual", "content", "bug"]),
  /** What is wrong, in one short clause. */
  what: z.string(),
  /** A concrete, actionable instruction the editing agent can apply to fix it. */
  fix: z.string(),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

export const PrototypeReviewSchema = z.object({
  verdict: z.enum(["ship", "refine"]),
  /** Overall quality in [0,1]. */
  score: z.number(),
  /** One-line assessment shown next to the artifact. */
  summary: z.string(),
  /** Fixable issues, most impactful first (empty when shipping clean). */
  issues: z.array(ReviewIssueSchema),
});
export type PrototypeReview = z.infer<typeof PrototypeReviewSchema>;

/**
 * Prototype next-step suggestions — a lightweight companion agent proposes a few
 * concrete design moves once a prototype is ready.
 */
export const PrototypeSuggestionSchema = z.object({
  /** Short button label. */
  label: z.string(),
  /** Direct instruction that can be fed back into the prototype agent. */
  intent: z.string(),
});
export type PrototypeSuggestion = z.infer<typeof PrototypeSuggestionSchema>;

// No array/string size constraints here on purpose: Cerebras structured output REJECTS the
// JSON-Schema `maxItems`/`maxLength`/`minLength` they generate (HTTP 400 wrong_api_format).
// The count (≤3) and lengths are enforced in nextsteps.ts `sanitize()` instead.
export const PrototypeSuggestionsSchema = z.object({
  suggestions: z.array(PrototypeSuggestionSchema),
});
export type PrototypeSuggestions = z.infer<typeof PrototypeSuggestionsSchema>;
