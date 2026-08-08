import { config } from "./config";

/**
 * Web search for the fact-check agent (retrieve-then-ground). We call the search
 * provider ourselves and hand the snippets to Gemma rather than using model
 * tool-calling — it's deterministic, adds no extra round-trips, and fits the
 * `generateStructured` path. Currently backed by Tavily (free tier: 1,000
 * credits/mo, no card). All calls degrade gracefully: a failure returns no
 * evidence and the verdict becomes "unverified" rather than throwing.
 */

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score: number;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 6000;
const MAX_RESULTS = 4;

// Social/forum hosts make poor fact-check citations — demote them so the model
// grounds on (and cites) authoritative sources first. Demoted, not dropped: if
// they're the only evidence, they still appear.
const LOW_AUTHORITY = /(?:^|\.)(facebook|instagram|tiktok|twitter|x|reddit|quora|pinterest|threads|medium)\.com$/i;

function authorityRank(url: string): number {
  try {
    return LOW_AUTHORITY.test(new URL(url).hostname) ? 0 : 1;
  } catch {
    return 1;
  }
}

/** True when a real search backend is configured (provider selected + key present). */
export function searchEnabled(): boolean {
  return config.factcheckSearch === "tavily" && !!config.tavilyApiKey;
}

/** One Tavily search. Returns [] on any failure — never throws. */
export async function tavilySearch(query: string): Promise<SearchHit[]> {
  if (!config.tavilyApiKey) return [];
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.tavilyApiKey}`,
      },
      body: JSON.stringify({
        query,
        // Ground on result snippets (results[].content), NOT Tavily's synthesized
        // `answer` (LLM-generated, can be confidently wrong).
        search_depth: "basic",
        max_results: MAX_RESULTS,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[search] Tavily ${res.status} ${res.statusText}`);
      return [];
    }
    const data = (await res.json()) as { results?: SearchHit[] };
    return (data.results ?? [])
      .map((r) => ({ title: r.title, url: r.url, content: r.content, score: r.score }))
      // Keep Tavily's relevance order, but push social/forum results to the bottom.
      .sort((a, b) => authorityRank(b.url) - authorityRank(a.url) || b.score - a.score);
  } catch (err) {
    console.warn(`[search] Tavily query failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Search every claim in parallel and format LLM-ready evidence blocks for the
 * fact-check prompt. Returns null when search is disabled (no provider/key), so
 * the caller can switch to the ungrounded fallback prompt.
 */
export async function gatherEvidence(claims: string[]): Promise<string | null> {
  if (!searchEnabled()) return null;
  const blocks = await Promise.all(
    claims.map(async (claim, i) => {
      const hits = await tavilySearch(claim);
      const body = hits.length
        ? hits.map((h) => `  - [${h.url}] ${h.content}`).join("\n")
        : "  (no results found)";
      return `Claim ${i + 1}: ${claim}\nEvidence:\n${body}`;
    }),
  );
  return blocks.join("\n\n");
}
