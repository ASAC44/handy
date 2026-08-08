import { fromZod } from "universal-llm-client/zod";
import { summarizerModel } from "../llm";
import { SUMMARIZER_SYSTEM, MeetingSummarySchema, type MeetingSummary } from "@sidebar/shared";

/** Rolling structured summary: decisions / action items / open questions / TL;DR. */
export async function summarizeLive(
  transcript: string,
  prev: MeetingSummary | null,
  context = "",
): Promise<MeetingSummary> {
  const model = summarizerModel();
  return (await model.generateStructured(fromZod(MeetingSummarySchema as never, { name: "meeting_summary" }) as never, [
    { role: "system", content: SUMMARIZER_SYSTEM },
    {
      role: "user",
      content: `${context ? `Accepted context available to agents:\n${context}\n\n` : ""}Rolling transcript:\n${transcript}\n\nPrevious summary (JSON or "none"):\n${prev ? JSON.stringify(prev) : "none"}`,
    },
  ])) as MeetingSummary;
}
