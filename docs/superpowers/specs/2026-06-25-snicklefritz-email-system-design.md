# SNICKLEFRITZ — AI brand-email system (Approach A) — design + build notes

**Date:** 2026-06-25 · **Status:** design approved (Approach A), pre-implementation
**Source of truth for the test:** `FUCKCLAUDE.md` (the operator-written spec) · this doc adds architecture + research evidence.
**Research evidence:** crawl4ai pass 2026-06-25 (Anthropic tool-use/structured-outputs, model IDs, Resend, HTML-email, brand extraction) — RULE 0.4 satisfied; verbatim facts in §6.

---

## 1. Goal & locked decisions

The operator says ONE word — **SNICKLEFRITZ** — and two recurring, professionally branded emails go to his two inboxes (`allstatecoop@gmail.com`, `ethanrickyjrjr@gmail.com`), each skinned in a REAL broker's scraped brand with a REAL agent name and REAL data. Email 1 = a Century 21 agent; Email 2 = a small independent broker. **The actual agents/brokers are NEVER emailed.** Deliverability is already proven — do NOT re-test the send pipe.

**Locked this session:**
- Engine path = the **new email-lab block templates** (incl. the 4 skeletons), AI chooses among ALL of them.
- **Gated preview, then send** for the first run: build everything, show the operator each rendered email + scrape + chosen template, send only on confirm. Drop the gate for the cron later.
- Data = **a mix weighted to fresh daily data** (so day-over-day change is visible), scoped to each broker's local market.
- **One send first, 3-day cron after.**
- **Pre-stage everything** ("not on the fly"): discovery + scrape + pick + fill + render + save happen in PREP; the word only SENDS the approved artifacts.
- Current app projects are disposable — free hand on the data model.

---

## 2. Architecture — Approach A (pure core + thin CLI)

```
lib/email/snicklefritz/            ← pure, DI, unit-testable core (no I/O baked in)
  targets.ts        prospect-folder schema + load/save
  data-context.ts   assemble the market-scoped, daily-weighted real-data bundle (+ sources)
  pick-template.ts  AI template selection (forced tool, enum of seed ids)  ← replaces pickSeedId
  fill.ts           AI structured-output content fill (no-invention; numbers carry a source)
  brand-inject.ts   write scraped brand + agent name into the EmailDoc (globalStyle/header/agent)
  no-invention.ts   post-fill gate: every rendered number traces to the data bundle, else blank/abort
  render.ts         EmailDoc → {html,text,subject} (reuse the email-lab renderer)
  build-ready.ts    orchestrate one target → a saved "ready email" artifact
scripts/email/
  snicklefritz-discover.mts   Phase 0: crawl4ai discovery → prospect folders
  snicklefritz-prep.mts       Phase 1: build + gated preview → save ready emails
  snicklefritz.mts            Phase 2: THE WORD — send the approved ready emails
  snicklefritz-cron.mts       Phase 4: 3-day self-limiting recurrence (same core)
```

The **"builder"** the operator described = exactly two AI calls — `pick-template` + `fill`. Claude/the orchestrator only supplies the data bundle + the brand + the agent name; it does NOT pick colors, write templates, or touch identity. Reuses: `enrichBrand` (brand scrape, already built), the email-lab `SEED_DOCS` + doc→HTML renderer, and Resend (send pipe, proven). Mirrors the proven outreach-engine shape (pure core + CLI adapter), but on the block-template model instead of the fixed chart template.

---

## 3. Phases

**Phase 0 — Upfront discovery (crawl4ai) → prospect folders.** Find a real Century 21 agent and a real small independent SWFL broker (they advertise heavily → simple crawls). For each, build a folder (§4). crawl4ai ONLY. Never contact them.

**Phase 1 — Prep (pre-stage; gated preview).** Per target: `enrichBrand(domain)` → assemble the data context (§4, market-scoped, daily-weighted) → `pick-template` (forced tool over all seeds) → `fill` (structured output, no-invention) → `brand-inject` → `render` → run `no-invention` gate → **save the ready-email artifact**. Then show the operator: the scrape result, the chosen template + reason, and the rendered email (HTML file) for BOTH emails. On approval → `approved:true`.

**Phase 2 — Send (SNICKLEFRITZ).** The word → load the approved ready emails → `resend.batch.send` to the two inboxes, each with a per-occurrence `Idempotency-Key`, `List-Unsubscribe` one-click headers, and `text` alongside `html`. Nothing builds at send time.

**Phase 3 — True landing (acting as the user).** Each email's CTA → a branded arrival URL (`buildArrivalUrl`-style) → a real landing page that PERSISTS the arrival (recipient, brand, scope, timestamp) and shows the personalized data — "info saved, ready to go." Verify by walking it as the recipient (Chrome) for both inboxes. Reuse the funnel arrival-bridge; no dead buttons.

**Phase 4 — Recurrence (later).** A self-limiting cron (today + same time next two days) re-runs the core with fresh data, gate off, capped at 3 sends, per-occurrence idempotency key (`snicklefritz/<target>/<isoDate>`) so a retry never double-sends. Resend has no native cron — we own the loop.

---

## 4. Data structures

**Prospect folder** — `data/prospects/<slug>/folder.json` (pre-built, committed; the "folder on everyone"):
```
{ slug, name, company, domain, role: "century21"|"independent",
  market: { zip, city, county },
  brand: { primary, secondary, logo_url, company_name, confidence, source },
  contacts: { ... public listing only },
  provenance: [ { field, value, source_url } ],   // four-lane: every fact cites a source
  discovered_at }
```

**Ready-email artifact** — `data/prospects/<slug>/ready-email.json` (saved by Phase 1):
```
{ target_slug, recipient_inbox, template_id, doc (filled+branded EmailDoc),
  html, text, subject, cta_url, data_context (figures + sources),
  built_at, approved: bool }
```

**Landing record** — persisted on CTA visit (Phase 3): `{ recipient, target_slug, brand, scope, arrived_at }`. Reuses the arrival bridge / a fresh table if cleaner (free hand on the model).

---

## 5. No-invention gate (the platform-critical part)

1. **Start from EMPTY skeleton templates** — the 4 new skeletons ship blank slots, so there are no demo numbers ($485K/34 DOM…) to leak in the first place.
2. **Structured-output fill** — `output_config.format` json_schema; every numeric field is `required` and paired with a `source` string. An unfillable datapoint comes back empty/refused, never guessed.
3. **Post-render scan** — every number in the rendered copy must trace to a value in the data context; any that doesn't is blanked or the build aborts (extends the existing `gateNarrative` lint to the email path).
4. **Grounding prompt** — "use ONLY the provided data; if it's not there, leave it out" (Anthropic reduce-hallucinations guidance, §6.3).

This makes no-invention **structural**, not a prompt promise — consistent with the four-lane moat.

---

## 6. Research evidence (verbatim — crawl4ai 2026-06-25)

**6.1 Structured choice + fill.** `tool_choice: {"type":"tool","name":"select_template"}` forces the pick; add `strict:true` for schema-guaranteed inputs. Forced tool **cannot** combine with extended thinking — run the pick on a non-thinking turn/model. Fill = **Structured Outputs** (now GA): `output_config.format = {type:"json_schema", schema}` → JSON in `response.content[0].text`; SDK `messages.parse(...)`. Mark all properties **required** (property order = required first). Still handle `stop_reason: "refusal"` and `"max_tokens"`.

**6.2 Model IDs (confirmed verbatim).** `claude-opus-4-8` ($5/$25, 1M), `claude-sonnet-4-6` ($3/$15, 1M, ext-thinking), `claude-haiku-4-5` (alias; pinned `claude-haiku-4-5-20251001`, $1/$5, 200k). Dateless IDs are already pinned snapshots.

**6.3 No-hallucination (Anthropic).** Allow "I don't know"; quote/cite sources for facts; **external-knowledge restriction** ("only use provided documents, not general knowledge"). Structurally: number+source pairs, post-validate.

**6.4 Resend.** `to` ≤50; `resend.batch.send` ≤100; `Idempotency-Key` header (≤256 chars, UUID/`<event>/<id>`, 24h window) — only on `/emails` + `/emails/batch`. `scheduledAt` ≤30 days (NL or ISO). **No native cron** — own the recurrence. Transactional sends need `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers + footer link. Server-side Templates API exists (`template:{id,variables}`) as an alternative to rendering HTML ourselves — evaluate later.

**6.5 HTML email.** React Email + `pixelBasedPreset` (rem→px), `<Preview>` preheader, table layout, dark-mode `<meta name="color-scheme">` + `@media (prefers-color-scheme)` / `[data-ogsc]`, transparent-PNG logo (survives inversion), always send `text` with `html`. `caniemail.com` is the compat oracle.

**6.6 Brand.** Reuse our `enrichBrand` (theme-color → og:image/favicon → CSS vars → computed CTA/nav colors). Brandfetch Brand API (`/v2/brands/domain/{domain}` → logos/colors/company) is a clean future upgrade, not a now-dependency.

**Flags to resolve at build time:** (a) confirm **Haiku-4.5 supports strict tool-use + structured outputs** before using the cheap model for fill — else use Sonnet-4.6; (b) if the fill ever web-falls-back for a missing number, the current web-search tool type is **`web_search_20260209`** (our code references `web_search_20250305`) — verify before shipping.

---

## 7. What must be found / decided UPFRONT (operator's ask)

- **Targets:** 1 real Century 21 agent + 1 real small independent SWFL broker (name, company, domain, market).
- **Brand scope:** each target's local market (ZIP/city/county) — drives both the brand scrape and the data context.
- **Data context:** which figures each email leads with — weighted to daily-moving (daily median price `daily_truth`, mortgage, active-listings count + DOM, new permits, a city-pulse event) + 1–2 slower anchors.
- **Recipients:** the two operator inboxes (either order).
- **Sender identity:** `hello@swfldatagulf.com` (verified) + CAN-SPAM physical postal address.
- **CTA / landing URL** per email.

## 8. What we must BUILD for automatic running

- Discovery crawler → prospect folders (Phase 0).
- The core: `pick-template`, `fill`, `brand-inject`, `render`, `no-invention`, `data-context`, `build-ready`.
- The data-context assembler (market-scoped, daily-weighted; reads live brains/lake).
- The send adapter (Resend batch + idempotency + List-Unsubscribe + text).
- The true landing (arrival save) + verification as the recipient.
- The SNICKLEFRITZ trigger (the CLI the operator's word fires) + the 3-day cron wrapper.

---

## 9. Test plan

- Unit: `pick-template` (valid id ∈ seeds), `fill` schema (required+source), `no-invention` gate (drops an unsourced number), `brand-inject` (identity fields set, content untouched), `data-context` (market scope, daily-weighted).
- Render snapshot for each template.
- **Dry-run send** (compose, no send) — default; live send opt-in only.
- Landing: a visit persists an arrival row; walk it as the recipient (Chrome) for both inboxes.
- Idempotency: a double-fire with the same key = ONE send.
- Do NOT re-test deliverability (proven).

## 10. Open decisions / risks

- Haiku-4.5 structured-output support (verify; fallback Sonnet) — §6 flag.
- web_search tool-type drift if web-fallback is used — §6 flag.
- Landing model: reuse arrival-bridge vs. a fresh table (lean reuse; free hand).
- Prospect folders on disk (committed) vs. a DB table (lean disk first; mirror to DB if the cron needs it).
