import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CompanySource, DataHubImpact, DataHubState } from "@handy/shared";
import { config } from "./config";
import type { CompanyContext, MeetingMemory } from "./runtime";

type ToolData = Record<string, any>;

export class DataHubMemory {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private current: CompanyContext = { prompt: "", sources: [] };
  private state: DataHubState = {
    status: config.datahubEnabled ? "connecting" : "disabled",
    query: "",
    sources: [],
  };

  constructor(private onState: (state: DataHubState) => void) {}

  snapshot(): DataHubState {
    return { ...this.state, sources: [...this.state.sources] };
  }

  context(): CompanyContext {
    return { prompt: this.current.prompt, sources: [...this.current.sources] };
  }

  clearLocal(): void {
    this.current = { prompt: "", sources: [] };
    this.publish({ ...this.state, query: "", sources: [], updatedAt: Date.now() });
  }

  async refresh(rawQuery: string): Promise<CompanyContext> {
    if (!config.datahubEnabled) return this.context();
    const query = searchQuery(rawQuery);
    if (!query) return this.context();
    try {
      const [catalog, documents] = await Promise.all([
        this.call("search", { query, filter: "entity_type IN (dataset, dashboard, chart)", num_results: 5 }),
        this.call("search_documents", { query, num_results: 3 }),
      ]);
      const assetHits = catalog.searchResults ?? [];
      const documentHits = documents.searchResults ?? [];
      const assetSources = assetHits.slice(0, 3).map(sourceFromHit).filter(Boolean) as CompanySource[];
      const documentSources = documentHits.slice(0, 3).map(sourceFromHit).filter(Boolean) as CompanySource[];
      const assetUrns = assetSources.map((source) => source.urn);
      const documentUrns = documentSources.map((source) => source.urn);
      const datasetUrn = assetUrns.find((urn) => urn.startsWith("urn:li:dataset:"));

      const [entities, schema, excerpts] = await Promise.all([
        assetUrns.length ? this.call("get_entities", { urns: assetUrns }) : {},
        datasetUrn ? this.call("list_schema_fields", { urn: datasetUrn, limit: 30 }) : {},
        documentUrns.length
          ? this.call("grep_documents", { urns: documentUrns, pattern: ".*", context_chars: 3500, max_matches_per_doc: 1 })
          : {},
      ]);

      const sources = uniqueSources([...assetSources, ...documentSources]);
      const prompt = [
        "DATAHUB COMPANY CONTEXT (trusted company metadata and memory):",
        `Search: ${query}`,
        `Catalog matches: ${compact(entities || assetHits)}`,
        `Relevant schema: ${compact(schema)}`,
        `Relevant documents: ${compact(excerpts)}`,
        "Use exact company terms and fields. Treat generated example values as synthetic; metadata does not prove live business values.",
      ].join("\n\n").slice(0, 14_000);
      this.current = { prompt, sources };
      this.publish({ status: "connected", query, sources, updatedAt: Date.now() });
    } catch (error) {
      this.publish({ ...this.state, status: "unavailable", message: message(error), updatedAt: Date.now() });
    }
    return this.context();
  }

  async saveFile(input: { id: string; title: string; content: string; meetingId: string }): Promise<CompanySource> {
    const saved = await this.call("save_document", {
      document_type: "Context",
      title: input.title,
      content: `${input.content}\n\n---\nSaved from Handy meeting ${input.meetingId}.`,
      topics: ["handy", "meeting-context"],
    });
    const source = savedSource(saved, input.title);
    this.remember(source, input.content);
    return source;
  }

  async saveMeeting(memory: MeetingMemory): Promise<CompanySource> {
    const content = meetingMarkdown(memory);
    const saved = await this.call("save_document", {
      document_type: "Summary",
      title: `Meeting summary: ${memory.title}`,
      content,
      topics: ["handy", "meeting-summary"],
      related_assets: memory.sources.filter((source) => source.kind === "asset").map((source) => source.urn),
      related_documents: memory.sources.filter((source) => source.kind === "document").map((source) => source.urn),
    });
    const source = savedSource(saved, `Meeting summary: ${memory.title}`);
    this.remember(source, content);
    return source;
  }

  async impact(change: string): Promise<DataHubImpact> {
    const source = this.current.sources.find((item) => item.kind === "asset");
    if (!source) {
      return { change, verdict: "unavailable", affected: [], note: "No DataHub asset is selected for this topic yet." };
    }
    try {
      const result = await this.call("get_lineage", {
        urn: source.urn,
        upstream: false,
        max_hops: 2,
        max_results: 20,
      });
      const hits = result.searchResults ?? result.relationships ?? result.entities ?? [];
      const affected = hits.map(sourceFromHit).filter(Boolean) as CompanySource[];
      return affected.length
        ? { change, verdict: "known-impact", source, affected, note: `${affected.length} known downstream item${affected.length === 1 ? "" : "s"} may be affected.` }
        : { change, verdict: "low-known-impact", source, affected: [], note: "DataHub records no downstream dependency for this asset. Its graph may be incomplete." };
    } catch (error) {
      return { change, verdict: "unavailable", source, affected: [], note: message(error) };
    }
  }

  private remember(source: CompanySource, content: string): void {
    this.current = {
      prompt: `${this.current.prompt}\n\nNEW DATAHUB MEMORY — ${source.title}:\n${content}`.trim().slice(-14_000),
      sources: uniqueSources([source, ...this.current.sources]),
    };
    this.publish({ status: "connected", query: this.state.query, sources: this.current.sources, updatedAt: Date.now() });
  }

  private async call(name: string, args: Record<string, unknown>): Promise<ToolData> {
    const client = await this.connect();
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(toolText(result) || `${name} failed`);
    if (result.structuredContent && typeof result.structuredContent === "object") {
      return result.structuredContent as ToolData;
    }
    const text = toolText(result);
    return text ? JSON.parse(text) : {};
  }

  private async connect(): Promise<Client> {
    if (!config.datahubEnabled) throw new Error("DataHub is disabled");
    if (this.client) return this.client;
    if (!this.connecting) {
      this.publish({ ...this.state, status: "connecting" });
      this.connecting = (async () => {
        const client = new Client({ name: "handy", version: "0.1.0" });
        await client.connect(new StreamableHTTPClientTransport(new URL(config.datahubMcpUrl)));
        const { tools } = await client.listTools();
        for (const required of ["search", "search_documents", "grep_documents", "get_entities", "list_schema_fields", "get_lineage", "save_document"]) {
          if (!tools.some((tool) => tool.name === required)) throw new Error(`DataHub MCP is missing ${required}`);
        }
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private publish(state: DataHubState): void {
    this.state = { ...state, sources: [...state.sources] };
    this.onState(this.snapshot());
  }
}

function toolText(input: unknown): string {
  const result = input as { content?: unknown };
  return Array.isArray(result.content)
    ? result.content.filter((item: any) => item?.type === "text").map((item: any) => item.text).join("\n")
    : "";
}

function searchQuery(input: string): string {
  const stop = new Set(["a", "an", "and", "are", "as", "at", "be", "build", "for", "from", "i", "in", "is", "it", "of", "on", "our", "the", "this", "to", "using", "we", "with"]);
  const words = input.toLowerCase().match(/[a-z0-9_]{3,}/g)?.filter((word) => !stop.has(word)) ?? [];
  return words.length ? `/q ${[...new Set(words)].slice(-6).join(" OR ")}` : "";
}

function sourceFromHit(hit: any): CompanySource | null {
  const entity = hit?.entity ?? hit;
  const urn = entity?.urn;
  if (!urn) return null;
  const title = entity?.info?.title ?? entity?.properties?.name ?? entity?.name ?? shortUrn(urn);
  return { urn, title, kind: urn.startsWith("urn:li:document:") ? "document" : "asset" };
}

function savedSource(saved: ToolData, title: string): CompanySource {
  if (!saved.success || typeof saved.urn !== "string") throw new Error(saved.message ?? "DataHub did not save the document");
  return { urn: saved.urn, title, kind: "document" };
}

function uniqueSources(sources: CompanySource[]): CompanySource[] {
  return [...new Map(sources.map((source) => [source.urn, source])).values()].slice(0, 8);
}

function compact(value: unknown): string {
  return JSON.stringify(value).slice(0, 4_500);
}

function shortUrn(urn: string): string {
  return urn.split(",").at(-2)?.replace(/[()]/g, "") ?? urn.split(":").at(-1) ?? urn;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function meetingMarkdown(memory: MeetingMemory): string {
  const bullets = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded";
  return [
    `# ${memory.title}`,
    `## Summary\n${memory.tldr}`,
    `## Decisions\n${bullets(memory.decisions)}`,
    `## Action items\n${bullets(memory.actionItems.map((item) => `${item.owner}: ${item.task}`))}`,
    `## Open questions\n${bullets(memory.openQuestions)}`,
    `## Prototypes\n${bullets(memory.prototypes)}`,
    `## DataHub sources\n${bullets(memory.sources.map((source) => `${source.title} — ${source.urn}`))}`,
  ].join("\n\n");
}
