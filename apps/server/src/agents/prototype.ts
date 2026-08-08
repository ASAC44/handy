import { AIModel, multimodalMessage } from "universal-llm-client";
import { prototypeModel, baselineModel } from "../llm";
import { prototypeSystemFor, type ThemeTokens } from "@sidebar/shared";

export interface StreamResult {
  html: string;
  ms: number;
  tokens: number;
  tokPerS: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Mock stream: chunk a known themed HTML doc over ~totalMs to mimic token streaming. */
export async function mockStream(
  html: string,
  totalMs: number,
  onToken: (delta: string) => void,
  alive: () => boolean,
): Promise<StreamResult> {
  const steps = 46;
  const per = totalMs / steps;
  const t0 = performance.now();
  let sent = 0;
  for (let i = 1; i <= steps; i++) {
    if (!alive()) break;
    const to = Math.floor((html.length * i) / steps);
    const delta = html.slice(sent, to);
    sent = to;
    if (delta) onToken(delta);
    await sleep(per);
  }
  const ms = Math.round(performance.now() - t0);
  return { html, ms, tokens: Math.round(html.length / 4), tokPerS: 1900 };
}

/** Live stream: real Cerebras tokens. Injects the learned design system into the prompt. */
export async function liveStream(
  intent: string,
  transcript: string,
  learned: ThemeTokens | null,
  screenshotDataUri: string | null,
  onToken: (delta: string) => void,
  model: AIModel = prototypeModel(),
): Promise<StreamResult> {
  const system = prototypeSystemFor(learned);
  const userText = `Idea (intent): ${intent}\nRecent transcript: ${transcript}\nOutput the HTML now.`;
  // The lib's message types vary by provider; cast keeps the scaffold decoupled.
  const messages = (
    screenshotDataUri
      ? [{ role: "system", content: system }, multimodalMessage(userText, [screenshotDataUri])]
      : [{ role: "system", content: system }, { role: "user", content: userText }]
  ) as never;

  const t0 = performance.now();
  let html = "";
  for await (const ev of model.chatStream(messages)) {
    if (ev.type === "text") {
      html += ev.content;
      onToken(ev.content);
    }
  }
  const ms = Math.round(performance.now() - t0);
  const tokens = Math.round(html.length / 4);
  return { html: stripFences(html), ms, tokens, tokPerS: ms > 0 ? Math.round((tokens / ms) * 1000) : 0 };
}

export function getBaseline(): AIModel | null {
  return baselineModel();
}

function stripFences(s: string): string {
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}
