# Clay.com — INSIDE the app (logged-in drive, 08/02/2026)

Operator logged into app.clay.com (workspace 1309395) and asked me to drive Chrome and see
how they keep data separated and working with AI agents while our pipelines break. This is
the third pass — the two prior passes (`2026-08-02-claydotcom-scan.md`) only saw the
marketing site and status page from outside. This one is observed product mechanics, from
the actual UI, screenshots in session.

## The one-sentence answer

Clay has exactly ONE runtime primitive — the table column — and every capability
(vendor enrichment, waterfall, AI agent, formula) is a column with declared inputs,
a run condition, a per-row price, and per-cell run state. There is no separate
"pipeline" object that can break; the unit of failure is a single cell.

## Observed mechanics (starter table, wb_0tj5yyzbnZeDnFZfuKZ)

1. **Column = declarative job.** Edit-column panel for "Enrich Company": Action
   (Companies > Enrich Company, tagged "Cost Efficient"), Column mapping (SETUP INPUTS:
   Company Identifier ← Domain column), Run settings (Auto-run toggle; "Add run
   condition — only run if this formula resolves to true"; Run immediately / Run after
   delay, max 600s). Price shown BEFORE save: "0.5 / row".

2. **Explicit DAG.** Column context menu has "Go to parent column" and "Used in..." —
   lineage is a first-class navigable relation, both directions. Changing a parent
   auto-reruns dependents (auto-run). "Save as function" promotes any column config to a
   reusable step (their Functions product).

3. **Cell = typed record with provenance.** Clicking one enriched cell opens "Cell
   details": ~25 typed fields (T/#/[]/{} type icons), nested arrays (Locations [20],
   Specialties [19], Derived Datapoints {9} — derived kept separate from raw), a `Last
   Refresh` ISO timestamp, "Updated 6 minutes ago", and **"Charged: 0.5"** — per-cell
   cost accounting visible to the user.

4. **Run state at three grains, always visible.** Header stats row = per-column
   completion % (100%); bottom bar = "100% of table completed" + Stop button + History;
   top bar = Auto-run counter. A failed/missing cell degrades a percentage — it does not
   kill anything.

5. **Waterfall = hidden provider columns + coalesce.** Custom Waterfall builder:
   providers run sequentially, stop at first result, "you won't be charged for most
   providers that don't return a result." Drag to reorder, toggle to skip. Reveal
   toggles: "Output name of successful provider?" (provenance as a field) and "Hide
   provider columns?" — a waterfall is sugar over N per-provider columns plus a
   coalesce. Same primitive underneath.

6. **AI is caged, not trusted.** "Use AI" column: user describes intent, THE SYSTEM
   writes the optimized prompt; column refs templated via /{{Domain}}; Configure tab
   forces **Define outputs — named typed Fields or a JSON Schema** (downstream columns
   depend on typed fields, never prose); model is a dropdown ("Clay > Argon", their
   branded tiers + Compare models); same run-condition/auto-run/delay block as every
   other column. Cost: **3 credits/row vs 0.5** for plain enrichment — 6x, shown before
   save. Saved Claygents are reusable across tables.

7. **Metering is first-class at every grain.** Usage history modal (table-level):
   credits by day, sliceable by Time / Column / Run, "Show enrichments", Download CSV,
   totals (this week: 5 data credits, 10 actions). Plus per-cell "Charged" and
   per-column "/ row" estimates. Nobody discovers spend after the fact.

8. **Separation of surfaces (the sidebar IA).** Workbooks/tables = working data.
   Audiences (People, Companies) = persistent entity store. Orchestration = Signals,
   Ads, Campaigns, Claygents, Functions, MCP (Beta). Exports = the outbound edge.
   Trash, Settings, AI context. Starter table runs in "Sandbox Mode" — play area
   separated from paid runs. New-workspace onboarding is five verbs: Find leads /
   Import data / Build an audience / Create a campaign / Start from template.

## Why their pipelines "keep going" and ours die — the mechanical difference

- **Failure grain.** Our ingest unit of failure is a whole GHA job — one bad row, one
  timeout, one schema surprise and the run is red (or worse, a sweep upsert wipes a
  column — the 07/26 baths wipe). Clay's unit of failure is one cell; the table shows
  97% instead of dying, and you filter + re-run the misses. Their July incident history
  (9 incidents/9 weeks, prior scan) proves their INFRA breaks like anyone's — but a
  broken enrichment shows up as stuck cells in one column, not a dead pipeline.
- **One primitive, one gate surface.** Every guard (run condition, cost cap, type
  contract, dedup, change log) is built once on the column primitive and inherited by
  every integration. We bolt guards per-pipeline (Gate 4 non-null guard, COALESCE guard,
  per-pack tests) because each pipeline is bespoke imperative code.
- **Recompute is reactive, not scheduled.** Parent cell changes → dependents re-run.
  We re-run on cron whether or not inputs changed, and freshness is tracked in a
  separate registry instead of ON the value (their cells carry Last Refresh).
- **LLM output contract.** Their every-AI-call-declares-a-schema = our
  BrainOutput/spec-validator. This one we genuinely already run.

## What's stealable at OUR volume (Rule 11 filter)

1. **Cell-grain failure semantics in ingest**: never let one row kill a run; land what
   matched, count what didn't, surface the % — the existing COALESCE-guard instinct
   generalized. (Biggest one.)
2. **Freshness on the value, not beside it**: a last_refresh per field/row where it
   matters (comps, listings), so staleness is queryable where the number lives.
3. **Cost-on-the-object**: our usage-log already counts calls; Clay shows the charge at
   the point of use. /ops surfaces could show per-brain rebuild cost the way Clay shows
   "Charged 0.5" on a cell.
4. **NOT stealable/needed**: 150-vendor marketplace, credit economy, Sculptor, ads
   sync — different business, hyperscaler-shaped.

## ROUND 3b — the email campaign flow (operator: "did you try the create email campaign????")

Operator created "2026-08-02 New campaign" in the same workbook and handed me the URL.
Observed mechanics, live drive:

1. **A campaign is another TAB in the workbook, bound to the data table.** Bottom tabs:
   Overview / Clay Starter Table / 2026-08-02 New campaign. Top tabs inside the campaign:
   Sequence, Sender accounts, Settings, Leads, Analytics, Replies. "Create events table"
   button = campaign events (opens/clicks/replies) materialize as ANOTHER TABLE — the
   one-primitive rule extends to outbound.
2. **Setup gates the irreversible act.** Lead email address must be a COLUMN
   ("we automatically deduplicate records based on this field to ensure each lead is
   sequenced only once"); red "Select a lead email address column to proceed"; Launch
   button disabled until satisfied. Draft badge until launch.
3. **Composer = same / -menu as everywhere else.** Variables: Clean variable, Sender
   variable, AI snippet, Spintax variable, Rows from <table>. The rows picker previews
   the ACTUAL row JSON including an `origin` block ({type: "row", tableId: …}) — a
   template variable is a live binding with provenance, not pasted text. Multi-step
   sequence via "Add a message." Cost strip: "1 per lead sequenced."
4. **AI-draft-first entry.** Default campaign screen is "Draft messages with AI (Beta)"
   — describe the goal, it generates the sequence; template chips (warm leads / book
   demos / launch / event); "Or start from an empty message."
5. **Deliverability is opinionated and default-on.** Schedule type "Optimized for
   deliverability": Mon–Fri 9 AM–5 PM, minimum 20 minutes between emails, campaign
   timezone explicit. HTML is OFF by default with a warning ("HTML can negatively
   affect deliverability for cold outbound"); open tracking (pixel), click tracking
   (URL redirects), and the unsubscribe link all REQUIRE HTML on. "Pause leads at the
   same company on reply" (domain-level suppression). 30 messages/day/account hard
   platform cap. Per-lead sender assignment via a column; unassigned leads distributed
   evenly across accounts.
6. **THE SEND ENGINE IS BOUGHT, NOT BUILT — Smartlead.ai.** Two verbatim proofs in the
   UI: Settings → Webhooks: "Configure Smartlead.ai webhooks here directly… otherwise we
   will create and manage your webhook events within Clay"; Add-email-accounts modal:
   "Your credentials will be securely shared with our email integration partner
   Smartlead." Same pattern as their Rootly status page (prior scan): a $5B company
   white-labels sending infra. Mastermind/minion, confirmed twice in their own product.
7. **Sender connect flow:** Gmail (OAuth) / Outlook (OAuth) / Manual SMTP / Bulk CSV,
   a Google-Workspace-preconfigured? gate ("setup only needs to happen once per
   Workspace"), and a visibility toggle "Only show to me and workspace admins."
   Operator authorized connecting ("connect whatever you want"); drove to the Google
   OAuth popup — popup opens outside the controllable tab group, so the account
   pick/consent (and any password) is the operator's click, by design.
8. **Their Gmail OAuth client is UNVERIFIED — deliberately.** Operator's consent
   attempt returned Google's wall, verbatim: "clay.com has not completed the Google
   verification process. The app is currently being tested, and can only be accessed
   by developer-approved testers." Client ID 507657710252-nf50sl3l9fem9oes4dc2oki2qnt6rpmr
   .apps.googleusercontent.com ("Clay Sequencer" = the Smartlead white-label). Meaning:
   even at $5B they did NOT take the Gmail restricted-scope verification/CASA audit for
   this client — the ONLY supported route is the Google Workspace admin marking the
   client ID "Trusted" (app access control), which bypasses verification. Personal
   @gmail.com therefore CANNOT connect to their sequencer via OAuth at all; consumer
   accounts are left to Manual SMTP (app password) or a different mailbox. Lesson for
   us: cold-email vendors structurally avoid Google's send-scope audit and lean on the
   Workspace-trust escape hatch; any "connect your Gmail" feature we ever ship faces
   the same verification wall (and our transactional path via a sending API sidesteps
   it entirely).

## ROUND 3c — MCP governance page + events table confirmed

- **MCP page (workspace-level), verbatim mechanics:** default credit limit "applied to new
  MCP users when they connect an external platform such as ChatGPT or Claude" (default
  1,000 credits) — per-USER budget at the MCP boundary. "Hide default functions from MCP":
  hidden from the MCP UI AND "refused if invoked," while the functions stay usable inside
  the workspace — surface-level capability gating, deny-at-boundary. Allowed-clients
  allowlist (ChatGPT / Claude / Grok / "Unknown" catch-all): "Turning one off blocks new
  connections and token refreshes." Per-user MCP roster ("MCP users") with invites.
  DIRECTLY relevant to our /api/mcp: we have none of (per-caller budget, per-tool MCP
  gating, client allowlist, connected-user roster).
- **Events table confirmed real:** after operator clicked "Create events table," the
  workbook bottom bar shows four tabs — Overview / Clay Starter Table / 2026-08-02 New
  campaign / **2026-08-02 New campaign events**. Send outcomes land as a sibling table of
  the lead data, same workbook, same primitive. Per-table context menu also carries
  "Enable auto-delete…" (row TTL) and "View usage history" (per-table spend).

- **Signals page (operator toured it live):** trigger categories are Job change / New hire /
  Job posting / Promotion / Web intent / News & fundraising / Custom — "New signal" creates
  a standing watcher that presumably lands rows into tables (none created in this
  workspace). Their "something happened → row appears → columns react → campaign fires"
  loop starts here. Our analog would be lake-event watchers (new listing, price cut, permit
  filed) feeding the email scheduler — we HAVE the events, not the standing-watcher surface.

## ROUND 3d — operator's own tour (15 screenshots, 08/02/2026 ~20:01–20:07, read in full)

1. **The events table is a WEBHOOK SOURCE, auto-wired.** Settings→Webhooks shows the
   "Create events table" click auto-created "2026-08-02 New campaign events" at
   `https://api.clay.com/v3/sources/webhook/campaign-events-<uuid>` with NINE event
   chips: Email opened / Email sent / Email reply received / Email bounced / Email link
   clicked / Lead unsubscribed / Manual step reached / Lead category updated / Campaign
   status changed. So "events as a table" = Smartlead webhooks → a Clay webhook-source
   table, self-managed. Generic mechanism, not a special feature.
2. **Three send-schedule modes:** Optimized for deliverability (default) / Send
   immediately ("24/7… Recommended for inbound or transactional use cases only") /
   Custom. They explicitly separate cold-outbound pacing from transactional sending.
3. **Warm-up is a first-class account status:** sender-account filter statuses are
   Ready / Warming up / Not warming / Auth error.
4. **Sequence editor:** between-message "Wait N days" dropdown (1–10), per-message
   "Reply" toggle (send as thread reply), rich-text toolbar.
5. **"Create new table" catalog = the whole ingest surface, priced per row at point of
   use.** Sections: Suggestions (Find people/companies, Salesforce list, HubSpot, CSV),
   Signals (Job change/Job posting/Promotion/Web intent/New hire/News & fundraising/
   Custom/**Webhook**), Find (with credit tags: lookalike companies ~1, HG Insights ~8,
   TrustRadius ~10, Openmart 0.5, Google Maps ~1, Adbeat 1, Lusha 1, TheOrg **25**,
   prospects-from-your-website Beta 2), Import (**Phantombuster, Apify actor, RSS feed,
   generic "Import data from an HTTP API"**, Attio, Exportly.ai, AgentMail message
   events, CSV), Social (Reddit mentions — needs connected Reddit account; YouTube
   natural-language search with typed setup inputs incl. "Videos (with scheduling)";
   Modash/Upfluence/Trigify 1; professional posts 0.5; Google News RSS), Integrations
   A–Z (~45 vendors; Databricks/BigQuery/Snowflake gated behind Upgrade).
   NOTE the generic HTTP API import — their catch-all intake — relevant to our API-first
   user-data intake thread (SCRATCHPAD 08/02 "WHY ARE YOU CREATING INDUSTRIES?" item 3).
6. **Template library = preconfigured workbooks with live sample data** (Search with
   Google Maps shown populated with 20 result rows + status column + tutorial). Ten
   more: Key decision makers, Discover open roles, AI-generated ideal customers,
   Recently hired decision makers, Personal→work email conversion, Inbound lead
   enrichment, Keywords in company websites, Emails from website insights, Prospect
   technology insights, Pre-call research automation.
7. **Share as template:** any workbook's CONFIGURATION is shareable by link (optionally
   restricted to named emails) — workflow distribution without data. Their University/
   community flywheel runs on this primitive.
8. **Ad syncs are plan-gated** (upgrade modal: build TAM, target buying committees on
   deal stage change, exclude competitors).

**What this means for OUR email surface:** their whole campaign layer is (a) the same
table primitive with an events table closing the loop, (b) bought sending infra, and
(c) hard-coded deliverability opinions (rate caps, spacing, plain-text default,
domain-pause). We already own composition/branding/provenance (our moat); the missing
piece Clay would never build for us — data-grain provenance INSIDE the message — is the
part we already do. Their events-as-a-table idea is the stealable one: our sends already
log, but not as a first-class queryable surface next to the doc.

Provenance: all observations from live logged-in UI drive 08/02/2026, workspace
1309395, Clay Starter Table (10 rows, Domain→Enrich Company→Url) + campaign tab
2026-08-02 New campaign. Source homepage: https://app.clay.com. Prior outside-in scan:
`2026-08-02-claydotcom-scan.md`.
