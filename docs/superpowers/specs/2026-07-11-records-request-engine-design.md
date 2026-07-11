# Chapter 119 records-request outbound engine

**Date:** 2026-07-11
**Status:** SPECCED — awaiting operator review, then implementation plan.
**Check:** `records_request_engine_live_verify`.
**Parent:** `docs/vertical-plays/04-data-acquisition-engine.md` — component 3 of the
"hard-data acquisition engine." This spec builds ONLY that component (the records-request
lane). The other four (discovery radar, friction-tier triage, acquisition adapters, ODD
landing) stay as future in the parent doc.

## Problem

The genuinely hard SWFL data — full assessment rolls, licensee emails, agency micro-data —
does not sit behind a download button. It comes in through a Chapter 119 public-records
request: an email (or portal form) to an agency's records custodian. Today that runs ad hoc.
A human decides to ask, writes the request by hand, sends it, and then it lives in nobody's
head. There is no record of what was filed, what came back, what it cost, or what has gone
quiet. Filed requests with no statutory deadline (see below) are exactly the silent-deferral
graveyard RULE 2.4 exists to prevent — a request nobody re-surfaces is a request forgotten.

Concrete live example: the new-agent-radar build
(`docs/superpowers/specs/2026-07-11-new-agent-radar-design.md`) lands Lee/Collier realtor
licensees but **defers the `email` column to "a Chapter 119 records request from
hello@swfldatagulf.com."** That deferred lane has no home. This engine is its home.

## Goal

Turn a records request into a managed, self-surfacing asset with an automated send loop.
The system drafts the §119 request from a queue entry, emails it to the operator to approve,
sends it from our domain on approval, auto-files it, then tracks the response until the
received data lands via the ODD seams we already run. The operator is the gate on every send;
everything else is automated. What the system cannot automate — the agency's human reply, and
the minority of agencies that require a web-form portal instead of email — is handled by
handing the operator ready-to-paste text plus the portal URL.

## The vendor contract — FL Chapter 119, verified live 07/11/2026

Fetched via crawl4ai against the live statute
(`leg.state.fl.us/statutes/…/0119.07.html`). Two facts drive the whole lifecycle:

1. **No fixed response deadline.** §119.07(1)(a): records shall be produced "at any
   reasonable time, under reasonable conditions." §119.07(1)(c): the custodian "must
   acknowledge requests to inspect or copy records promptly and respond to such requests in
   good faith." There is **no statutory day-count** (Florida is unusual this way — unlike
   states with a fixed 5/10-day clock). → the queue has **no SLA timer**; instead a
   per-request `follow_up_days` field (operational choice, not a §119 rule) drives a
   "gone quiet — nudge" surface.
2. **Fees, plus a special-service-charge gate.** §119.07(4)(a): up to **15 cents per
   one-sided copy** (≤ 8½×14 in), "actual cost of duplication" otherwise. §119.07(4)(d): when
   a request requires "extensive use of information technology resources or extensive clerical
   or supervisory assistance," the agency may add a **special service charge**, "reasonable
   and … based on the cost incurred." → agencies quote a cost before fulfilling, so the
   lifecycle has explicit `cost_quoted → cost_approved` states: no money goes out without the
   operator approving the quote.

Provenance: statute text quoted above is from the live 07/11/2026 fetch, written into
`SESSION_LOG.md` this session.

## Design decisions

1. **Storage is a Supabase table, not YAML.** Requests are living operational state that
   churns through a lifecycle and needs "how long has this been quiet" surfacing — the exact
   shape of the `checks` table (`scripts/check.mjs`). A YAML-in-repo registry (like
   `cadence_registry.yaml`) would thrash git history on every status bump and rot silently.
   The tracker is operational metadata → `public.records_requests`, so the brain-first gate
   does **not** apply to the tracker itself.
2. **The request email is transactional, not commercial.** It reuses the Resend client and
   credential, but **not** the marketing batch builders (`buildWeeklyReadBatches` /
   outreach `drip-email`) — those carry List-Unsubscribe headers, `wid`/`rid` tags, and
   unsubscribe tokens that are wrong for a one-off agency request. A §119 request is not
   commercial email; CAN-SPAM's opt-out/address rules do not apply. Single transactional send.
3. **The operator approves every send (locked rule).** Draft → email operator → approve →
   auto-send matches the platform's locked *sends-stay-operator-approved* posture. No
   per-request auto-send without approval.
4. **Landing reuses ODD, per-target — no new landing machinery in v1.** When a request is
   fulfilled, the received file lands through the existing ODD seams. Where it lands follows
   the existing gates per target: operational data (e.g. realtor emails feeding outreach) →
   `public.*`; answer-feeding data → `data_lake.*` with a consuming brain (brain-first gate).
   The tracker points at the received file and flips to `landed`. This adds **no new mandatory
   materialization gate** (RULE 3 C2).
5. **Every seed is triaged before it enters the queue.** A target belongs here only if it has
   **no** download / API / portal path we already reach. Enforced because a Tier-2 miss
   masquerading as a records request discredits the tracker (see Seeding).

## What we're building

Four parts, one Supabase table.

### 1. Table — `public.records_requests`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `request_key` | text UNIQUE | stable handle (e.g. `dbpr_re_emails_2026q3`) |
| `target_agency` | text | e.g. "FL DBPR", "Collier County Clerk" |
| `dataset` | text | what we're asking for, plain language |
| `statute_basis` | text | default "Fla. Stat. ch. 119" |
| `contact_email` | text NULL | agency records-custodian inbox (null ⇒ portal-only) |
| `portal_url` | text NULL | set when the agency requires a web form, not email |
| `state` | text | lifecycle enum (below) |
| `follow_up_days` | int | default 14; operational, NOT a statutory deadline |
| `cost_quoted_usd` | numeric NULL | agency's §119.07(4) quote |
| `cost_approved_usd` | numeric NULL | operator-approved amount |
| `request_body` | text NULL | the drafted email text (audit trail) |
| `received_ref` | text NULL | pointer to the received file (path / lake id / url) |
| `landed_target` | text NULL | where it landed (`public.x` / `data_lake.x`) |
| `notes` | text NULL | |
| `source_tag` | text | `records_request` |
| `filed_at` | timestamptz NULL | stamped on send |
| `last_contact_at` | timestamptz NULL | bumped on any inbound/outbound touch |
| `created_at` / `updated_at` | timestamptz | |

After creation: `GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst,'reload schema';`

### 2. Lifecycle state machine

```
drafted ──approve+send──▶ filed ──agency acks──▶ acknowledged
                                                     │
                          ┌──────────────────────────┤
                          ▼                           ▼
                    cost_quoted ──approve──▶ cost_approved ──▶ fulfilled ──land──▶ landed
                          │                                        ▲
                          └── (no charge) ─────────────────────────┘
   any state ──▶ denied   (agency refuses / exemption asserted)
   any state ──▶ withdrawn (we drop it)
```

- `filed → acknowledged` and cost states are set from the agency's reply (operator records it
  via the CLI; no inbound email parsing in v1).
- `cost_quoted → cost_approved` is the §119.07(4) money gate — operator approves the spend.
- No SLA timer. A request past `filed`/`acknowledged` with `now() − last_contact_at >
  follow_up_days` surfaces as "gone quiet" (see part 4).

### 3. CLI — `scripts/records-request.mjs`

Modeled directly on `scripts/check.mjs` (same Supabase REST helper, same staleness sort,
same loud-fail discipline). Verbs:

- `add <request_key> <target_agency> "<dataset>" [--contact <email>] [--portal <url>]
  [--basis "…"] [--follow-up <days>]` — create in `drafted`. Idempotent-guard on
  `request_key` (fails loud if it exists, like `check.mjs open`).
- `draft <request_key>` — fill `request_body` from the §119 template (part 4) + the row's
  fields, print it for review. Pure template-fill; **no LLM** (a short fixed-form legal
  request needs none — zero spend, RULE-0.6 proportion).
- `send <request_key>` — the approval-send loop, two beats. Bare `send` emails the drafted
  request to the operator's inbox for review and prints it; it does **not** send to the agency.
  `send <request_key> --confirm` is the approval — it sends the transactional email from
  `hello@swfldatagulf.com` to `contact_email`, stamps `filed_at`, advances to `filed`.
  (Approval is this explicit CLI confirm, never a parsed inbound reply — inbound parsing is
  out of scope.) Portal-only rows (no `contact_email`) instead print the ready-to-paste body +
  `portal_url` and advance to `filed` on `--confirm`.
- `ack <request_key>` / `quote <request_key> <usd>` / `approve-cost <request_key>` /
  `fulfill <request_key> [--received <ref>]` / `land <request_key> <target>` /
  `deny <request_key> [note]` / `withdraw <request_key> [note]` — record agency responses and
  advance state, each bumping `last_contact_at`.
- `list [--quiet N]` — open requests, oldest-quiet-first; `--quiet N` filters to those with no
  contact in ≥ N days (reuses the `check.mjs` staleness sort).

### 4. The §119 draft template + approval-send

- **Template** (`lib/records-request/template.ts`): a fixed, courteous §119 request —
  identifies the requester (SWFL Data Gulf), cites ch. 119, names the dataset, asks for
  electronic delivery to hold cost down, asks for a cost estimate **before** fulfillment if a
  special service charge applies (invoking §119.07(4)), and asks the custodian to cite the
  specific exemption for anything withheld (§119.07(1)(e)). Pure string interpolation of the
  row's `target_agency` / `dataset` / `statute_basis`.
- **Send** (`lib/records-request/send.ts`): reuses the Resend client (same credential path as
  `lib/email/weekly-read/send.ts`) via a thin single-send — `from`, `to`, `subject`, `html`,
  no unsubscribe/tags. Approval gate first: the draft goes to the operator inbox; the agency
  send only fires after operator confirmation.

### 5. Session-start surfacing (core, not creep)

`scripts/session-kickoff.mjs` gains one line: open records requests gone quiet (past
`follow_up_days` with no contact), oldest first — the same way it already prints open checks.
This is what stops a filed request from being forgotten; without it we rebuild the ad-hoc
problem the engine exists to kill.

## Seeding — triaged targets only

Each seed is entered **only after confirming no download/API/portal path we already reach**:

- **DBPR realtor licensee emails** — `request_key: dbpr_re_emails`. *Candidate, flagged.* The
  new-agent-radar spec says the email path is "records request / online lookup" with the
  online-scrape route **unconfirmed**. Enter as a records request; if the license-detail page
  is later confirmed to render the email, downgrade to a scrape (Tier-2). Unblocks the deferred
  new-agent-radar email lane.
- **FL DOR assessment roll (Collier)** — `request_key: fldor_collier_nal`. *Candidate, pending
  confirmation* it is not already reachable via the FDOR ArcGIS FeatureServer we ingest for
  `collier_parcels`. Confirm before filing.
- **Explicitly NOT seeded:** `collier_parcels` sale price (SALE_PRC1/PRC2). The
  `cadence_registry.yaml` `collier_parcels` entry documents these as **"free in the same
  call"** from the ArcGIS server — an unpulled-column Tier-2 miss, not a records request.
  Seeding it here would be a category error that discredits the tracker. It belongs in the
  ingest backlog, not this queue.

## Error handling

- CLI `add` on an existing `request_key` → fail loud (no-op never masquerades as success).
- `send` without operator confirmation → does not send; leaves state `drafted`.
- Resend send error → surface the error, leave state `drafted`, do not stamp `filed_at`
  (a failed send must never look filed).
- State transitions validated: e.g. `land` only from `fulfilled`; `approve-cost` only from
  `cost_quoted`. An illegal transition fails loud.
- `landed_target` is a free-text pointer in v1, not an FK — the landing itself is done by the
  target's own ODD pipeline, which enforces its own gates.

## Testing

- **Unit** (`template.test.ts`): the drafted body contains the agency name, the dataset, the
  ch. 119 citation, the cost-estimate-before-fulfillment ask, and the exemption-citation ask;
  no unsubscribe/marketing text leaks in.
- **Unit** (`send.test.ts`): injected `BatchSender`-style stub — approval-gated send fires the
  single transactional message with the right `from`/`to` and **no** List-Unsubscribe header
  or `wid`/`rid` tag (transactional, not commercial).
- **CLI state-machine test** (`records-request.test.mjs`, importable like `check.test.mjs`):
  legal transitions advance; illegal ones (`land` from `filed`, `approve-cost` from
  `acknowledged`) fail loud; `list --quiet N` sorts oldest-quiet-first.
- **`--dry-run`/`draft` smoke:** `draft` prints a real body against a seeded row, zero writes,
  zero sends.

## Cadence / freshness

This is an operator-driven engine, not a cron ingest — the primary "freshness" mechanism is
the session-start quiet-request surface (part 5), which needs no cron. Optional later: a light
GHA that posts the quiet-request list to the ops surface. No LLM anywhere in the send path →
no `RunBudget`, no `web_search`, no spend guards needed.

## Out of scope (v1)

- **Inbound email parsing.** Agency replies are recorded by the operator via the CLI
  (`ack`/`quote`/`fulfill`), not auto-ingested from the inbox. Auto-parsing replies is a later
  build.
- **The generic landing bridge.** Each fulfilled request lands via its target's own ODD
  pipeline under the existing gates; no generic "received file → Tier-1 cold" helper in v1
  (would build machinery before we know a received file's real shape).
- **The other four engine components** (discovery radar, friction triage, adapters, ODD
  landing) — parent doc, future.

## Follow-ups

- Confirm the DBPR license-detail page email question (browser) → decides whether
  `dbpr_re_emails` stays a records request or downgrades to a Tier-2 scrape.
- Confirm the FL DOR Collier NAL roll is not already reachable via the ArcGIS server we ingest
  → before filing `fldor_collier_nal`.
- Pin the agency records-custodian contact addresses (DBPR, Collier Clerk, FL DOR) before the
  first live send.
