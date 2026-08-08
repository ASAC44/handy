import { fromZod } from "universal-llm-client/zod";
import { factcheckModel } from "../llm";
import {
  FACTCHECK_SYSTEM,
  FACTCHECK_SYSTEM_UNGROUNDED,
  FactcheckResultSchema,
  type FactcheckResult,
} from "@sidebar/shared";
import { gatherEvidence } from "../search";

/**
 * Live fact-check (retrieve-then-ground). When a search backend is configured
 * (Tavily), each claim is searched and the snippets are handed to Gemma to
 * ground a verdict on. Without a key it falls back to the model's own knowledge
 * (best-effort, conservative). The critical path is the search round-trip, not
 * generation — this is a feature, never a speed showcase.
 */
export async function factcheckLive(claims: string[]): Promise<FactcheckResult> {
  const model = factcheckModel();
  const evidence = await gatherEvidence(claims);
  const today = new Date().toISOString().slice(0, 10);

  const system = evidence ? FACTCHECK_SYSTEM : FACTCHECK_SYSTEM_UNGROUNDED;
  const user = evidence
    ? `Today's date: ${today}.\n\nVerify each claim using ONLY the evidence provided below.\n\n${evidence}`
    : `Today's date: ${today}.\n\nClaims to check:\n${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

  return (await model.generateStructured(fromZod(FactcheckResultSchema as never, { name: "factcheck_result" }) as never, [
    { role: "system", content: system },
    { role: "user", content: user },
  ])) as FactcheckResult;
}
