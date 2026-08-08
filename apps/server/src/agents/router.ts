import { fromZod } from "universal-llm-client/zod";
import { routerModel } from "../llm";
import { ROUTER_SYSTEM, RouterDecisionSchema, type RouterDecision } from "@sidebar/shared";

/** Cheap gatekeeper: strict structured output deciding which agents act. */
export async function routeLive(segment: string, summaryJson: string): Promise<RouterDecision> {
  const model = routerModel();
  return model.generateStructured(fromZod(RouterDecisionSchema, { name: "router_decision" }), [
    { role: "system", content: ROUTER_SYSTEM },
    {
      role: "user",
      content: `Latest transcript segment:\n"${segment}"\n\nRolling summary (JSON):\n${summaryJson}`,
    },
  ]);
}
