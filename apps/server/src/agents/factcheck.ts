import { fromZod } from "universal-llm-client/zod";
import { factcheckModel } from "../llm";
import { FACTCHECK_SYSTEM, FactcheckResultSchema, type FactcheckResult } from "@sidebar/shared";

/**
 * Stretch agent. NOTE: real web-search tool wiring is a TODO — without it the
 * model self-reports, so verdicts are best-effort. Critical path here is the
 * search round-trip, not generation, so this is never a speed showcase.
 */
export async function factcheckLive(claims: string[]): Promise<FactcheckResult> {
  const model = factcheckModel();
  return model.generateStructured(fromZod(FactcheckResultSchema, { name: "factcheck_result" }), [
    { role: "system", content: FACTCHECK_SYSTEM },
    { role: "user", content: `Claims to check:\n${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}` },
  ]);
}
