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
});
export type FactcheckCheck = z.infer<typeof FactcheckCheckSchema>;

export const FactcheckResultSchema = z.object({
  checks: z.array(FactcheckCheckSchema),
});
export type FactcheckResult = z.infer<typeof FactcheckResultSchema>;
