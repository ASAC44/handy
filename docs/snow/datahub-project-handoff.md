# Handy + DataHub: complete project handoff

Last updated: August 10, 2026

This is the current source of truth. It records what we believe the product is, why it is
interesting, how it should work, what we are deliberately not building, and what is still
only an idea. Read this before changing the direction or implementing anything.

## Where the project stands

- Handy already runs a live meeting with a router, rolling summarizer, fact-checker,
  prototype maker, prototype critic, next-step agent, and final recap maker.
- Handy already has a file/folder dropper. Host uploads are accepted immediately; guest
  uploads wait for host acceptance.
- Accepted files currently live only in Handy's temporary meeting context. Agents receive
  summaries or previews of them. They do not enter DataHub today.
- Meeting state is currently in server memory and is not durable.
- DataHub has been installed and its local UI/sample catalog have been tested. The product
  and UI gave us a much clearer understanding of its value.
- No DataHub integration code has been implemented yet. The current changes in
  `docs/snow` are research and planning only.

## DataHub in one simple explanation

DataHub is the company's map and memory for data.

It can hold or describe:

- company files and written knowledge;
- databases, tables, and columns;
- what those things mean;
- how they are related;
- where data came from and what depends on it;
- owners, policies, quality problems, and previous decisions.

DataHub usually stores the map, meaning, and relationships—not every live row inside each
database. If we later need a current number such as today's revenue, a separate read-only
database connection must fetch it.

For files, our intended behavior is simple: when a user accepts a file in Handy, its full
readable content enters DataHub knowledge. The agent later receives only the parts relevant
to the current conversation. This keeps the full knowledge without stuffing a whole long
file into every AI prompt. DataHub Documents store text/Markdown knowledge; non-text files
may need text extraction plus a link to the original file.

## The product idea

> DataHub becomes the shared company brain behind Handy's entire live agent system.

Handy listens to the ongoing conversation. As the topic changes, it brings the relevant
company knowledge from DataHub into one shared meeting context. Every Handy agent uses that
same context.

The integration is not merely a database fact-checker. It changes what the whole agentic
system understands and creates.

One-line pitch:

> DataHub makes agents company-aware. Handy brings that company intelligence into every
> live meeting, turns it into working artifacts, checks proposed changes, and remembers
> what the team learns.

The main loop is:

```text
Ongoing conversation
        +
Dropped company files
        +
Existing DataHub catalog and relationships
        +
New meeting decisions
        ↓
DataHub company memory
        ↓
One changing shared meeting context
        ↓
All Handy agents
        ↓
Company-aware summary / checks / prototype / next steps / recap
        ↓
Useful meeting knowledge goes back into DataHub
        ↓
The next meeting starts smarter
```

## The central architecture choice

Agents do not each search DataHub independently.

Handy has one shared context for the meeting. A small context coordinator watches the
conversation, understands the current topic, and retrieves relevant DataHub knowledge.
That shared context changes as the conversation changes. All agents read it.

```text
Conversation ──┐
Files ─────────┼──> Context coordinator ──> Shared meeting context ──> all agents
DataHub map ───┘             ↑                         │
                             └──── new meeting knowledge ────────────┘
```

Why this choice matters:

- all agents share one company reality;
- results do not conflict because agents made separate searches;
- fewer searches mean lower delay and cost;
- the product feels like one intelligent meeting system, not DataHub pasted onto one agent;
- evidence can be reused by the summary, safety check, prototype, critic, and recap.

The shared context should be focused, not a dump of the whole company catalog. DataHub
keeps the full knowledge; Handy loads the relevant slice for the live topic.

## How DataHub affects every Handy agent

### Router

The router understands company terms, assets, products, metrics, and prior decisions. It
can make better choices about when the meeting needs a prototype, check, summary update,
or impact analysis.

### Rolling summarizer

The summary uses correct company names and definitions. It keeps separate what a person
said, what the company already knows, and what the meeting newly decided.

### Fact and Safety Checker

The existing fact-checker becomes a Fact and Safety Checker.

It still checks ordinary public claims using web evidence when needed. For company claims,
it uses DataHub definitions, files, schemas, relationships, policies, owners, and quality
signals.

It also watches for proposed changes. Examples:

- rename or remove a field;
- change a metric definition;
- switch the source used by a dashboard;
- expose a sensitive field;
- change a workflow described in a company file.

For a proposed change:

```text
Proposed change
      ↓
DataHub follows connected and dependent things
      ↓
Fact and Safety Checker
      ↓
warning + affected items, or "low known impact"
```

This is impact analysis: checking what else could be affected before a change is made.

The checker must never promise absolute safety. DataHub's map can be incomplete or old.
If it finds no known problem, the honest result is **low known impact**, not **guaranteed
safe**. When there is a problem, it should name the affected dashboard, table, report,
team, policy, or decision and explain the connection simply.

This is a strong demo feature if it is quick to add. It is not the entire product.

### Prototype maker

The prototype should be visibly shaped by real company knowledge:

- actual company concepts and terminology;
- real table and field names where relevant;
- official metric definitions and formulas;
- known relationships between data;
- requirements found in dropped files;
- previous team decisions;
- privacy and policy limits;
- realistic structure, categories, ranges, and empty states.

Prototype rows should normally be synthetic: fake values shaped like the real company
data. This makes the prototype believable without copying customer or employee data into
generated HTML. It should be labelled clearly when the values are synthetic.

The important story is not “DataHub corrected a wrong database sentence.” It is “the
prototype already understands the company and therefore starts much closer to something
the company can actually build.”

### Prototype critic

The critic reviews the prototype against the same shared company context. It checks both
normal design/technical quality and company consistency: missing requirements, nonexistent
fields, wrong meanings, unsafe information, invalid relationships, and conflicts with
earlier decisions.

### Next-step agent

Suggested next steps should fit the company's actual system and known constraints, rather
than being generic product-design suggestions.

### Final recap maker

The recap records the useful knowledge created in the meeting: decisions, changed or new
definitions, tasks, owners, unresolved questions, affected company assets, prototypes, and
evidence used. That structured recap feeds DataHub so later meetings and other agents can
find it.

## How knowledge enters DataHub

There are two main paths.

### 1. Existing file dropper

We reuse the current UI. We do not add a second “remember this” toggle.

- Host drops a file: Handy's existing acceptance action is permission to ingest it.
- Guest drops a file: the existing host acceptance is the permission boundary.
- The full readable file content is stored as company knowledge, with title, source,
  meeting ID, time, and related DataHub items when known.
- The meeting immediately gains relevant context from it.
- Future meetings can retrieve it from DataHub.

Secrets, credentials, and clearly private raw data must still be rejected or removed.

### 2. Knowledge created during the meeting

Handy should not save every spoken sentence. Speech contains guesses, contradictions, and
noise. It should save the useful structured result:

- decisions the team made;
- newly agreed definitions;
- changes to earlier decisions;
- important facts or findings;
- tasks and owners;
- unresolved risks and questions;
- links between the meeting, prototype, and discussed DataHub assets.

To keep the product fast, ending the meeting can be the commit point: the host ends the
meeting, Handy finalizes the recap, and the useful structured knowledge is saved. We do not
need a new multi-step approval screen for the hackathon. We should show what was saved and
link to it in DataHub.

This writeback is essential. Without it, Handy only consumes the company memory. With it,
every meeting can enrich that memory for people and agents that come later.

## What makes the product impressive

The hero is the whole closed loop, not one isolated check:

1. Handy understands the live conversation.
2. Relevant DataHub company knowledge enters the shared context.
3. Every agent becomes company-aware.
4. The prototype reflects real company structure, rules, and prior knowledge.
5. The checker warns when a proposed change could break connected work.
6. The meeting's useful decisions return to DataHub.
7. A later meeting remembers them.

Product hierarchy:

- **Main product:** shared company intelligence across the entire live meeting.
- **Visible hero:** a prototype transformed by real company context.
- **Wow moment:** impact warning for a proposed change.
- **Long-term advantage:** meetings continuously enrich company memory.
- **Supporting guardrail:** fact checking.

## What we are deliberately not building

- Not “DataHub only affects the fact-checker.”
- Not “fix a person when they make an incorrect database claim.” That sounds too small.
- Not one DataHub lookup per agent call.
- Not the entire DataHub catalog copied into every prompt.
- Not a second DataHub catalog browser inside Handy; DataHub already has a good UI.
- Not a second remember/ingest option beside the existing file acceptance flow.
- Not one DataHub document per transcript sentence.
- Not raw transcript dumping into trusted company knowledge.
- Not real private customer rows inside generated prototypes.
- Not the claim that DataHub itself contains live database values.
- Not an absolute “safe” approval when impact analysis finds nothing.
- Not silent automatic edits to official owners, policies, glossary terms, or schemas.
- Not a large permissions/governance product for the hackathon.
- Not DataHub Analytics Agent, Agent Registry, live warehouse querying, or event-driven
  cache invalidation in the first build. These are later extras only if the main loop works.
- Not lots of small UI settings. Time should go into the core loop and demo.

## Honest boundaries

- DataHub knowledge is only as good and current as what has been ingested.
- Relationships and lineage may be incomplete, so impact checks find known impact, not all
  possible impact.
- Metadata, documents, schema, and sample profiles can still be sensitive.
- DataHub can tell us what data means and where it lives; a separate read-only database
  path is needed to prove a current numeric value.
- Full binary-file storage is not the same as a DataHub Document. For the hackathon, ingest
  full extracted readable content and retain the original file reference when needed.
- The live meeting must continue if DataHub is unavailable. In that case Handy clearly
  marks company context as unavailable and uses its existing behavior.

## Minimum implementation architecture

Keep the implementation small.

### Read path

1. Run the official DataHub MCP server beside Handy. MCP is simply the standard connection
   that lets an AI system use DataHub functions.
2. Add one server-side DataHub client in Handy. Tokens never enter the browser.
3. Add a shared meeting-context manager.
4. When the topic changes, search DataHub narrowly for related files, datasets, fields,
   definitions, decisions, relationships, quality, and policies.
5. Convert the results into one small evidence/context bundle.
6. Reuse that bundle across every relevant agent until the topic changes.

### File path

1. Keep the current drop/accept UI.
2. Extract the file's full readable content.
3. Save it to DataHub as a linked Document with its source information.
4. Add relevant parts to the current shared context.

### Meeting write path

1. Keep collecting structured decisions, tasks, definitions, risks, and asset links.
2. At meeting end, make one clean meeting knowledge document.
3. Save it to DataHub and link it to discussed assets.
4. Display the saved state and DataHub link.
5. Prove that a fresh meeting can retrieve it.

### Safety path

1. Detect a proposed company/data change.
2. Ask DataHub for connected downstream items, owners, quality state, sensitive fields,
   and related decisions.
3. Give the same evidence to the Fact and Safety Checker.
4. Return a warning with affected items, or “low known impact” with the limits stated.

## Scope and implementation order

### Must work for the submission

1. DataHub connection and health state.
2. One shared context that follows the live conversation.
3. Accepted file content saved to DataHub and usable in the same meeting.
4. DataHub catalog/document knowledge affecting the prototype.
5. The same context affecting the critic and company fact checking.
6. Structured meeting knowledge saved back to DataHub.
7. A new meeting recalling that saved knowledge.
8. Clear UI proof of what company knowledge affected the output.
9. A reliable scripted demo, setup guide, and public video under three minutes.

### Add only if the core loop is stable

1. Impact analysis and low-known-impact/warning result.
2. Richer relationship display.
3. Read-only live database values.
4. Handy agents registered in DataHub Agent Registry.
5. DataHub Actions reacting to metadata changes.
6. A reusable contributed DataHub Skill.

Impact analysis is the first stretch after the read -> prototype -> write -> recall loop is
stable. One real lineage warning is enough; it must not prevent the closed memory loop from
shipping.

## Suggested demo story

Avoid making the entire demo about one wrong revenue claim.

1. Start with a company catalog already containing real-looking products, datasets,
   relationships, policies, and an earlier decision.
2. Drop a product brief or meeting file into Handy. It enters DataHub knowledge through the
   existing file flow.
3. Discuss a new company feature or dashboard. As the topic changes, Handy visibly finds
   relevant company knowledge once and shares it across the agents.
4. Handy builds a prototype using actual company language, fields, relationships, rules,
   and requirements from the file. Values are realistic but synthetic.
5. Suggest a change that would affect an existing dashboard, field, policy, or dependent
   team. The Fact and Safety Checker shows the known impact and names what may break.
6. End the meeting. Handy saves the decisions, prototype link, risks, and asset relations
   into DataHub.
7. Start a fresh meeting. Handy recalls the dropped file and prior decision without being
   told again.
8. Briefly show the new knowledge and relationships in DataHub's own UI.

This demonstrates DataHub read, relationships, generation, safety, writeback, and memory
as one product story.

## Minimal UI changes

- Small DataHub connected/degraded state.
- A compact “company context” activity showing that relevant knowledge entered the shared
  context; no giant technical tool log.
- On the prototype, a short indication that company context shaped it, with sources or
  rules available for proof.
- Fact and Safety results with affected items and simple explanations.
- At meeting end, a saved-to-DataHub state and link.

Do not clutter the current interface with a new browser, many toggles, or a complicated
review workflow.

## Submission and legal constraints

- Category: Open / Wildcard.
- The hackathon expects meaningful DataHub use and values knowledge contributed back to
  the graph. The read-and-write memory loop therefore matters.
- Existing Handy code is prior work and must be disclosed. Clearly identify the DataHub
  integration as new hackathon work.
- The current repository license is proprietary and names two copyright holders. The
  hackathon requires a public Apache-2.0 submission. Do not change the license unless both
  rights holders authorize it. Otherwise create a separate submission containing only code
  that can legally be released under Apache-2.0.
- Deadline recorded during research: August 10, 2026 at 5:00 PM EDT, equal to August 11 at
  2:30 AM IST. Recheck Devpost before relying on it.
- Use synthetic company data in the public demo.

## Mindset for the next chat

- Explain jargon before using it.
- Talk in product behavior first, implementation tools second.
- Keep the architecture as simple as the diagrams in this document.
- Do not reduce the idea to database fact correction.
- Judge every feature by whether it strengthens the shared company brain, the visible
  prototype, the safety moment, or the memory loop.
- Prefer one complete, understandable loop over many half-built DataHub abilities.
- Reuse existing Handy UI and host actions instead of adding tiny options.
- Stay honest about synthetic data, incomplete relationships, and DataHub's limits.
- Do not start implementation merely because a possible behavior is discussed. Confirm the
  chosen implementation scope first.

## Immediate next action

The reviewed, one-hour architecture and exact implementation order live in
[the DataHub implementation plan](./datahub-implementation-plan.md). Scope is now fixed.
Implementation begins by proving the real MCP search/write/schema/lineage contract; do not
start with agent or UI changes.

Useful supporting documents:

- [DataHub implementation plan](./datahub-implementation-plan.md)
- [DataHub explained simply](./datahub-expert-dossier.md)
- [Earlier Handy fit exploration](./datahub-handy-fit.md)
- [Earlier narrow implementation plan](./datahub-winning-plan.md)
