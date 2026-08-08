import { fromZod } from "universal-llm-client/zod";
import { routerModel } from "../llm";
import { ROUTER_SYSTEM, RouterDecisionSchema, type RouterDecision } from "@sidebar/shared";

/** Cheap gatekeeper: strict structured output deciding which agents act. */
export async function routeLive(segment: string, summaryJson: string, context = ""): Promise<RouterDecision> {
  const model = routerModel();
  return (await model.generateStructured(fromZod(RouterDecisionSchema as never, { name: "router_decision" }) as never, [
    { role: "system", content: ROUTER_SYSTEM },
    {
      role: "user",
      content: `${context ? `Accepted context available to agents:\n${context}\n\n` : ""}Latest transcript segment:\n"${segment}"\n\nRolling summary (JSON):\n${summaryJson}`,
    },
  ])) as RouterDecision;
}
