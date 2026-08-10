# DataHub demo setup and demo story

This is the practical handoff for the person deploying and demonstrating Handy.

The goal is simple: DataHub must contain believable company knowledge, Handy must be able
to read and write that knowledge, and the demo must visibly prove that the knowledge changed
the agents' output.

## What must be running

There are three separate pieces:

```text
DataHub Core
catalog API :8080 + catalog UI :9002
        |
        v
DataHub MCP companion :8000
turns agent requests into DataHub operations
        |
        v
Handy server :3001
serves the web app and runs the meeting agents
```

DataHub Core and the MCP companion are not included inside the current Handy deployment.
Deploying only Handy will make the app work, but its DataHub status will be unavailable.

### Important deployment decision

The current $5 Lightsail Nano is suitable for Handy, not for the full DataHub quickstart
stack. DataHub Core starts several containers: GMS, frontend, MySQL, Kafka, and OpenSearch.
Do not add that stack to the Nano instance.

Use one of these arrangements:

1. **Team demo/recording — simplest:** run DataHub Core and MCP on the demo laptop, and
   run Handy locally too. Expose only Handy if somebody needs a link.
2. **Handy on Lightsail — acceptable for a live team demo:** keep DataHub Core and MCP on
   another machine and connect the Lightsail server to MCP over a private network such as
   Tailscale. The MCP port must not be public.
3. **Independent public testing — most work:** host DataHub on a separate, adequately sized
   machine or use a managed DataHub deployment. Handy, MCP, DataHub GMS, and the browser
   must all receive URLs they can actually reach.

`localhost` means “this same machine.” If Handy runs on Lightsail while DataHub runs on a
laptop, `DATAHUB_MCP_URL=http://localhost:8000/mcp` is wrong: Lightsail will search itself.

## One-time DataHub setup

### 1. Start DataHub Core

Use the tested project version:

```bash
datahub docker quickstart --version v1.6.0
```

This starts the catalog. It does not add useful demo metadata and it does not start MCP.

Check that the DataHub UI opens and that GMS is healthy before continuing.

### 2. Add the ecommerce demo catalog

```bash
datahub datapack load showcase-ecommerce
```

This adds realistic metadata: order datasets, fields, dashboards, documents, owners, and
relationships. It does not create a real ecommerce database. That is fine: Handy needs
real catalog structure and uses clearly labelled synthetic row values in prototypes.

In DataHub, search for `orders`. Open one orders dataset and confirm that its schema is
visible. Our tested catalog returned an orders asset with 15 fields.

### 3. Create a DataHub access token

Create the token in DataHub's settings/access-token UI. The token belongs only to the MCP
process. Never put it in browser variables, commit it, paste it into a meeting, or include it
in a screenshot.

### 4. Start the official MCP companion

Use `uvx`; it creates an isolated Python environment and avoids changing system Python.

```bash
export DATAHUB_GMS_URL='http://127.0.0.1:8080'
export DATAHUB_GMS_TOKEN='<DataHub access token>'
export TOOLS_IS_MUTATION_ENABLED=true
export SAVE_DOCUMENT_PARENT_TITLE='Handy Memory'
export FASTMCP_HOST=127.0.0.1
export FASTMCP_PORT=8000

uvx mcp-server-datahub@0.6.0 --transport http
```

What these values mean:

- `DATAHUB_GMS_URL`: where MCP finds DataHub's catalog API;
- `DATAHUB_GMS_TOKEN`: lets MCP access that catalog;
- `TOOLS_IS_MUTATION_ENABLED=true`: allows Handy to save accepted files and recaps;
- `SAVE_DOCUMENT_PARENT_TITLE`: the DataHub document group for Handy memory;
- `FASTMCP_HOST` and `FASTMCP_PORT`: where Handy reaches the MCP tools.

When MCP and Handy are on different machines, bind MCP to the private network interface
instead of `127.0.0.1`, and allow port 8000 only over that private network.

## Handy deployment variables

The Handy server needs these variables:

```env
AGENTS=live
DATAHUB_ENABLED=true
DATAHUB_MCP_URL=http://127.0.0.1:8000/mcp
DATAHUB_FRONTEND_URL=http://localhost:9002
```

It also needs the existing Cerebras key. Add a Tavily key if the demo includes public-web
fact checking.

For a split deployment, replace the two DataHub URLs:

- `DATAHUB_MCP_URL` must be reachable by the Handy **server**;
- `DATAHUB_FRONTEND_URL` must be reachable by the **browser** because source names open
  DataHub in a new tab.

Do not expose the MCP companion to the public internet. It has mutation tools and a DataHub
token. Keep it behind the Handy server/private network.

After editing the deployed environment, restart Handy. A running process does not learn new
environment variables until restart.

### Current Lightsail deployment gap

[`deploy/aws/lightsail-bootstrap.sh`](../../deploy/aws/lightsail-bootstrap.sh) installs
Handy and Caddy only. It does not install DataHub Core or MCP.

If the friend deploys Handy with that script, they must also:

1. choose where DataHub Core and MCP will stay online;
2. make MCP reachable from Lightsail over a private address;
3. put that private MCP URL and the browser-reachable DataHub UI URL in
   `/opt/handy/.env`;
4. restart `handy.service`;
5. verify the deployed Handy header says DataHub connected.

Do not solve this by opening unauthenticated port 8000 to the whole internet.

## Prove the connection before the demo

From the Handy repository, with MCP reachable:

```bash
bun run datahub:smoke
```

This is read-only. It proves that Handy can:

- list the required MCP tools;
- search the catalog;
- find an orders dataset;
- read its schema;
- ask for downstream lineage.

Only once, if writeback has not been tested:

```bash
DATAHUB_SMOKE_WRITE=1 bun run datahub:smoke
```

That command creates a durable test document in DataHub and waits for search indexing.
Do not run it repeatedly. A saved document may take a few seconds to become searchable.
Handy itself uses a newly accepted file immediately, so the current meeting does not wait
for search indexing.

Then verify in the browser:

1. Handy server startup says `agents=live`.
2. The top context strip says `DataHub connected`.
3. Clicking that badge shows source names, not only a number.
4. Searching `orders` in DataHub shows a dataset with schema fields.

## Ways to add knowledge

### Add company metadata in advance

Use an ingestion source or the ecommerce datapack. This is how datasets, schemas,
dashboards, ownership, and lineage enter DataHub.

For this demo, the ecommerce datapack is enough. Do not spend demo day wiring a real
database unless it is already available and stable.

### Add a brief through Handy

Drop [`fulfillment-pulse.md`](../../demo/datahub/fulfillment-pulse.md) into Handy.

- A host upload is accepted immediately.
- A guest upload waits for the host to accept it.
- Once accepted, Handy sends the whole readable file to DataHub as a Context document.
- The same content is immediately available to all meeting agents.
- Open the context panel to preview it and see `DataHub saved`.

“Remove” removes the file from the current meeting. It does not erase the durable DataHub
document. Delete durable test documents from DataHub separately if cleanup is required.

### Add decisions from the meeting

End the meeting normally. Handy writes a structured Summary document to DataHub containing
the summary, decisions, action items, open questions, prototype names, and used DataHub
sources.

After a few seconds, search DataHub for `Fulfillment Pulse` or `FP-731`. You should see the
uploaded brief and the meeting summary.

## Recommended natural demo

### Why this story works

It visibly combines three inputs:

1. **DataHub catalog:** real `orders` schema and field names;
2. **company memory file:** the unique `FP-731` rule and privacy requirements;
3. **live conversation:** pink visual direction, animated progress, prioritization, and
   interactions.

The model could guess a generic dashboard. It cannot coincidentally know the unique marker,
the uploaded rule, and the exact catalog fields together. That is the proof.

### Before people join

1. Start DataHub, MCP, and Handy.
2. Run the read-only smoke test.
3. Open DataHub on an orders dataset's schema page in another tab.
4. Open Handy as host and invite one teammate.
5. Keep the demo brief ready, but do not upload it before the audience sees the meeting.

### The conversation

Speak normally. Do not read commands at Handy.

**Maya, operations:**

> Fulfillment is still jumping between five tabs once an order leaves checkout. We miss
> stuck orders until somebody complains.

**Arun, product:**

> Maybe one dashboard could feel like a live control room for the team — something you can
> understand from across the room.

At this point, let Handy begin the first prototype. While it builds, upload
`fulfillment-pulse.md` as the guest and let the host accept it. Open the knowledge panel
briefly so the audience sees the file preview, save state, and named DataHub sources.

After the first prototype appears:

**Maya:**

> I like that. What if the whole thing had a soft pink backdrop, little package icons, and
> a progress rail that keeps moving as orders get closer to completion?

Handy should evolve the same prototype, not create four unrelated designs.

**Arun:**

> And let the risky orders rise to the top. Clicking one should open delivery and payment
> details, but we should never need personal customer information here.

Expected visible result:

- title or rule includes `Fulfillment Pulse` / `FP-731`;
- uses real fields such as `order_id`, `order_status`, `order_total`, `delivery_type`, and
  `payment_method_code`;
- does not show customer email or address;
- uses the pink/animated visual direction from the conversation;
- labels example values as synthetic and shaped by DataHub metadata;
- the artifact and context panel name DataHub sources.

### Show fact checking without making it the whole product

Say naturally:

> By the way, I think our orders dataset has exactly 15 fields.

The Fact & Safety panel should show the claim as supported and cite the orders DataHub URN.
Previous checks remain visible when a later claim is checked.

Avoid relying on a dramatic lineage warning unless the exact selected dataset has known
downstream lineage. Our tested orders asset returned no downstream relationships, so Handy
honestly reports low known impact rather than claiming a change is safe.

### Close the knowledge loop

End the meeting and show:

1. the readable recap;
2. the working prototype inside it;
3. `DataHub memory saved`;
4. no zero-byte prototype exports;
5. a clear Back home/New meeting path.

Wait a few seconds, then search DataHub for `FP-731`. Open the saved brief or meeting
summary. This proves that the meeting enriched company knowledge instead of merely reading
from it.

Optional final beat: start a fresh meeting and say:

> Let's continue the Fulfillment Pulse FP-731 control room from our last discussion.

Open the knowledge panel when the previous DataHub document appears. This is the memory
payoff.

## Demo-day checklist

- [ ] DataHub Core healthy and UI reachable
- [ ] `showcase-ecommerce` loaded
- [ ] MCP running with `save_document` enabled
- [ ] Handy has correct MCP and frontend URLs
- [ ] Handy startup says `agents=live`
- [ ] `bun run datahub:smoke` passes
- [ ] Cerebras request works
- [ ] Tavily works if public fact checking is shown
- [ ] `orders` search and schema verified in DataHub UI
- [ ] `fulfillment-pulse.md` opens locally
- [ ] Guest upload and host acceptance tested once
- [ ] Knowledge panel shows named sources and links
- [ ] Natural brainstorm produces one non-empty prototype
- [ ] End Meeting produces a recap and DataHub saved state
- [ ] `FP-731` becomes searchable in DataHub after indexing
- [ ] Browser and server logs are clean enough for recording

## What not to claim

- DataHub metadata is not live business row data.
- Prototype rows and totals are synthetic.
- No recorded downstream lineage means “no known impact,” not “guaranteed safe.”
- Removing a file from a meeting does not delete its durable DataHub copy.
- Handy is not searching every database directly; DataHub gives it the map, meaning,
  relationships, and saved company context first.

## Official references

- [DataHub documentation](https://docs.datahub.com/)
- [Agent Context](https://docs.datahub.com/docs/dev-guides/agent-context/agent-context)
- [DataHub API tutorials](https://docs.datahub.com/docs/api/tutorials)
- [DataHub ingestion sources](https://docs.datahub.com/docs/generated/ingestion/sources/)
