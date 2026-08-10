import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.DATAHUB_MCP_URL ?? "http://127.0.0.1:8000/mcp";
const client = new Client({ name: "handy-datahub-smoke", version: "0.1.0" });

function json(input: unknown): Record<string, any> {
  const result = input as { content?: unknown; structuredContent?: unknown };
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent as Record<string, any>;
  const text = Array.isArray(result.content)
    ? result.content.filter((item: any) => item?.type === "text").map((item: any) => item.text).join("\n")
    : "";
  return JSON.parse(text);
}

await client.connect(new StreamableHTTPClientTransport(new URL(url)));
try {
  const { tools } = await client.listTools();
  const wanted = new Set(["search", "search_documents", "get_entities", "list_schema_fields", "get_lineage", "save_document"]);
  console.log(`tools: ${tools.map((tool) => tool.name).join(", ")}`);
  for (const name of wanted) {
    if (!tools.some((tool) => tool.name === name)) throw new Error(`missing DataHub tool: ${name}`);
  }
  const search = await client.callTool({
    name: "search",
    arguments: { query: "/q orders", filter: "entity_type = dataset", num_results: 5 },
  });
  const searchData = json(search);
  const urn = searchData.searchResults?.[0]?.entity?.urn;
  if (!urn) throw new Error("orders search returned no dataset");
  console.log(`catalog: ${searchData.total} matches; selected ${urn}`);

  const schema = json(await client.callTool({ name: "list_schema_fields", arguments: { urn, limit: 20 } }));
  const fields = schema.fields ?? schema.schemaFields ?? [];
  if (!fields.length) throw new Error("selected dataset returned no schema fields");
  console.log(`schema: ${fields.length} fields`);

  const lineage = json(await client.callTool({
    name: "get_lineage",
    arguments: { urn, upstream: false, max_hops: 2, max_results: 20 },
  }));
  console.log(`lineage: ${lineage.total ?? lineage.count ?? lineage.relationships?.length ?? 0} downstream results`);

  if (process.env.DATAHUB_SMOKE_DOCUMENT_URN) {
    const entity = json(await client.callTool({
      name: "get_entities",
      arguments: { urns: process.env.DATAHUB_SMOKE_DOCUMENT_URN },
    }));
    console.log(`document by URN: ${JSON.stringify(entity)}`);
  }
  if (process.env.DATAHUB_SMOKE_DOCUMENT_QUERY) {
    const documents = json(await client.callTool({
      name: "search_documents",
      arguments: { query: process.env.DATAHUB_SMOKE_DOCUMENT_QUERY, num_results: 10 },
    }));
    console.log(`document search: ${JSON.stringify(documents)}`);
  }

  if (process.env.DATAHUB_SMOKE_WRITE === "1") {
    const marker = `HANDY-MCP-${Date.now()}`;
    const saved = json(await client.callTool({
      name: "save_document",
      arguments: {
        document_type: "Context",
        title: `Handy MCP contract probe ${marker}`,
        content: `# Handy MCP contract probe\n\nMarker: ${marker}`,
        topics: ["handy", "contract-probe"],
        related_assets: [urn],
      },
    }));
    if (!saved.success || !saved.urn) throw new Error(`save_document failed: ${JSON.stringify(saved)}`);
    console.log(`write: ${saved.urn}`);

    const recallStarted = performance.now();
    let recalled: Record<string, any> | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      recalled = json(await client.callTool({
        name: "search_documents",
        arguments: { query: `/q ${marker}`, num_results: 5 },
      }));
      if (recalled.searchResults?.some((result: any) => result.entity?.urn === saved.urn)) break;
      await Bun.sleep(500);
    }
    if (!recalled?.searchResults?.some((result: any) => result.entity?.urn === saved.urn)) {
      throw new Error("saved document was not searchable within 10 seconds");
    }
    console.log(`recall: saved document found after ${Math.round(performance.now() - recallStarted)}ms`);
  }
} finally {
  await client.close();
}
