# Source Links + Methodology Surface — design

**Date:** 2026-06-08
**Status:** design approved, pre-implementation
**Topic:** make every metric's provenance *and method* legible on the public `/r/` surface — without leaking internals and without making a public accuracy claim from retrodicted numbers.

---

## 1. Problem

Two gaps on the public report surface, found by reading the live code (not the prior-session note):

1. **One real citation leak.** A metric's full citation (e.g. tourism-tdt) reads
   `"Florida DOR Tourist Development Tax — SWFL (Lee + Collier) via Brains Supabase fl_dor_tdt_collections (666 rows: …)"`. The short table-cell label is already clean (`shortSourceLabel` cuts at the em-dash → `"Florida DOR Tourist Development Tax"`). But the **full** citation — `DisplayMetric.sourceFull` (`speaker.mts:690`), shown in the paywalled detail block and in tier-3 / MCP — still carries the phrase **"Brains Supabase"**. It survives every scrubber because it is plain words with no underscore, no slash-path, no hex run. "Supabase" is a vendor implementation detail; it has no business on a customer surface (no-jargon rule).
   - For contrast, the table name `fl_dor_tdt_collections` *is* already redacted to `[config]` by the existing internal-identifier rule (`scrubCaveatTechnical:346`). That residue is acceptable. "Supabase" is the only genuine leak.

2. **No "how was this computed?" affordance.** Every metric shows a **Source** link (where the number came *from*) but nothing about **method** (how the number was *derived* — formula, denominator, grain). For a provenance-first brand whose whole pitch is "no source → no claim," "here's the source *and the math*" is the natural completion. Today a reader can audit the rows but not the recipe.

## 2. Decision

Ship a **public methodology surface** — a curated, allowlisted `/r/method/[metric]` page showing *what a metric measures and how it's computed* — reached from a small per-metric affordance on the report; plus a one-line hygiene scrub for the "Brains Supabase" leak.

**Explicitly dropped** (evaluated, rejected — see §9):
- Publisher-homepage remap of source links (regresses our own `/r/source` provenance).
- A "Proprietary" badge on our own data (premature; "trust us, we won't show you" corrodes a provenance brand; points at the wrong asset).
- Any auth / `SourcesGate` change, any `BrainOutput` type-lift.

## 3. The parked question, resolved: **no retrodicted skill on the public page**

The open question was whether `/r/method/[metric]` should also surface live per-slug **skill/lift** from `public.backtest_skill_by_slug` (a richer free→paid hook). **Resolved: no.** The view definition (`docs/sql/20260608_data_targets.sql:45-82`) states the rule twice in its own comments:

> "NEVER granted to anon (Glass guardrail 3 — a retrodicted-derived number is not a public accuracy claim)." … the view is `REVOKE ALL … FROM anon, authenticated` precisely so retrodicted skill never reaches a public surface.

`/r/method/[metric]` **is** a public surface. A retrodicted lift number is hindsight-fit (in-sample); putting it on a public page makes exactly the accuracy claim Glass guardrail 3 forbids. The honest public skill claim comes from **forward `outcomes`** (currently 0 — the flywheel hasn't graded a real call yet). When that history exists it becomes its own, separate public surface. **This page is formula + provenance only.** This is a simplification, not a compromise — it keeps us off a known landmine.

## 4. Architecture — five units

```
                ┌─────────────────────────────────────────┐
   Unit 1  ───▶ │ refinery/lib/methodology-registry.mts    │  (the contract — pure)
  (registry)    │   MethodologyEntry, literals + patterns,  │
                │   resolveMethod(slug) / methodHrefForSlug │
                └───────┬───────────────────────┬──────────┘
                        │                        │
        ┌───────────────▼─────────┐   ┌──────────▼──────────────────┐
Unit 2  │ speaker.mts             │   │ app/r/method/[metric]/page  │  Unit 3
(wiring)│  DisplayMetric.methodHref│   │  server-render formula +    │  (route)
        │  set in toDisplayBrain   │   │  provenance; not-published   │
        │  via methodHrefForSlug   │   │  panel otherwise             │
        └───────────────┬─────────┘   └─────────────────────────────┘
                        │                          ▲
                ┌───────▼──────────────────────────┘
     Unit 4     │ MetricsTable + app/r/[slug] mapping
   (badge UI)   │   per-row "method" affordance → methodHref
                └───────────────────────────────────────────

   Unit 5  ──▶  scrubCaveatTechnical: one rule, "Brains Supabase" → public name
  (hygiene)     (independent of 1–4)
```

### Unit 1 — Methodology registry + resolver (the contract)

**New file:** `refinery/lib/methodology-registry.mts` — importable by both the refinery (`speaker.mts`) and the Next app (the route), exactly as `citation-url.mts` and `speaker.mts` already cross that boundary. Mirrors the `SOURCE_PROVENANCE_TABLES` allowlist pattern.

```ts
export interface MethodologyEntry {
  label: string;          // human metric name, e.g. "Sales velocity (z-score)"
  measures: string;       // 1–2 sentences: what the number means
  formula: string;        // plain-language recipe, e.g. "z-score of trailing-12mo deeds vs the parcel's own 5-yr baseline"
  denominator?: string;   // grain / denominator, e.g. "per ZIP", "over resolved loans"
  sourceTable?: string;   // links to /r/source/<table> when set (must be on SOURCE_PROVENANCE_TABLES to render)
  brain?: string;         // links to /r/<brain>
  doc?: string;           // optional external methodology doc/PDF
}

// Literal slugs (headline metrics) + regex patterns (per-ZIP families).
export const METHODOLOGY_LITERALS: Record<string, MethodologyEntry> = { /* … */ };
export const METHODOLOGY_PATTERNS: Array<{ test: RegExp; build: (slug: string) => MethodologyEntry }> = [ /* … */ ];

export function resolveMethod(slug: string): MethodologyEntry | null;     // literal first, then patterns
export function methodHrefForSlug(slug: string): string | undefined;      // `/r/method/<slug>` iff resolveMethod !== null, else undefined
```

- **Starts small**, like `SOURCE_PROVENANCE_TABLES` (2 entries today): seed the handful of headline metrics we want to explain; unregistered slugs simply get no badge (graceful, no error).
- `methodHrefForSlug` is the single point that decides whether a metric is "explained." It is the **allowlist gate** — only a registered slug yields a public URL.
- Pure functions, no DB, no React. Fully unit-tested in isolation.

**Acceptance:** unit tests prove literal-before-pattern precedence, a per-ZIP pattern resolves (`flood_aal_33931` → entry with denominator "ZIP 33931"), an unregistered slug returns `null` / `undefined`, and `methodHrefForSlug` only ever returns `/r/method/<known-slug>`.

### Unit 2 — Speaker wiring (the leak-gated bridge)

`DisplayMetric` (`speaker.mts:588-599`) gains **`methodHref?: string`** — a finished public URL, **never the raw slug**. Populated in `toDisplayBrain` (`speaker.mts:684-692`):

```ts
metrics: (out.key_metrics ?? []).map((m) => ({
  …,
  methodHref: methodHrefForSlug(m.metric),   // gated: undefined unless registered
})),
```

**Why a URL, not the slug:** `DisplayMetric` deliberately omits the metric slug as a leak-prevention invariant (its doc-comment and `display-leak.test.mts` enforce "no slug on the customer projection"). A curated, allowlisted `/r/method/<slug>` URL is the same shape as the `sourceUrl` we already emit — a public page reference, not an internal identifier. The invariant holds: a raw slug never enters the display type; only a registry-vetted URL does.

**Acceptance:** `display-leak.test.mts` extended to assert (a) `methodHref`, when present, is always `/r/method/<slug>` for a slug in the registry, and (b) no raw slug appears anywhere on `DisplayMetric`. A metric whose slug isn't registered has `methodHref === undefined`.

### Unit 3 — `/r/method/[metric]` route

**New file:** `app/r/method/[metric]/page.tsx` — a near-mechanical mirror of `app/r/source/[table]/page.tsx`:

- Validate `metric` against `^[a-z0-9_]+$` (slug shape).
- `resolveMethod(metric)` (Unit 1). On `null` → render a "Not a documented metric" panel (mirror of `NotPublishedPanel`), never a guess.
- On hit, render via the shared `ReportShell` / `ReportHeader` / `Meta`:
  - title = `entry.label`, sub = the slug in mono (mirrors the source page showing the table name).
  - **What it measures** (`entry.measures`).
  - **How it's computed** (`entry.formula`) + **Grain / denominator** (`entry.denominator`).
  - **Source** — link to `/r/source/<sourceTable>` (only if that table is on `SOURCE_PROVENANCE_TABLES`) and `/r/<brain>`; optional external `doc ↗`.
  - Freshness note in the footer.
- **No** skill / lift / accuracy numbers. No DB read required (registry is static) — so no service-role client, no rows. Pure render.

**Acceptance:** registered slug renders formula + provenance; unregistered slug renders the not-documented panel; a `sourceTable` not on the source allowlist degrades to no source-link (never a dead `/r/source` link).

### Unit 4 — Method affordance in the report UI

`MetricRow` (`metrics-table.tsx:40-48`) gains **`methodHref?: string | null`**. When set, `MetricsTable` renders a small teal **method** affordance (a superscript `ƒ` / `method ↗` next to the metric label — *not* a second link in the Source cell, to keep "where from" and "how computed" visually distinct). The report page mapping (`app/r/[slug]/page.tsx:152-158`) passes `methodHref: m.methodHref`.

- Reuses the existing teal = "ours" color rule (the method page is our own surface).
- Absent `methodHref` → no affordance (today's exact rendering).

**Acceptance:** a metric with a registered slug shows the affordance linking to its `/r/method/<slug>`; a metric without one renders byte-identically to today.

### Unit 5 — Hygiene scrub (independent)

One conservative rule added to `scrubCaveatTechnical` (`speaker.mts:315`):

```ts
.replace(/\bBrains\s+Supabase\b/gi, "SWFL Data Gulf")
```

Maps the internal host phrase to the public lake name. Runs everywhere the scrubber already runs (caveats + `sourceFull` + tier-3), so it cleans the citation detail block and the MCP/audit path in one place. The table-name residue (`[config]`) is left as-is — consistent with existing redaction.

**Acceptance:** a pass-through battery proves the rule eats nothing it shouldn't — `SOFR`, `NFIP`, `FEMA`, `FDOT`, `NAICS`, `AAL`, `WGS84`, plain dates/numbers all survive untouched; and a positive test proves a tourism-tdt-style full citation no longer contains "Supabase".

## 5. Data flow

```
BrainOutputMetric.metric (slug)  ──toDisplayBrain──▶  methodHrefForSlug()  ──▶  DisplayMetric.methodHref (URL | undefined)
                                                                                      │
                                                       app/r/[slug] mapping ──────────┘──▶ MetricsTable badge ──▶ /r/method/<slug>
                                                                                                                        │
                                                                                              resolveMethod(slug) ──────┘──▶ formula + provenance render
```

The slug crosses exactly one gate (`methodHrefForSlug`) and is converted to a public URL before it ever touches the display type. The route re-resolves the slug independently from the same registry — single source of truth.

## 6. Testing

- **Unit 1:** registry resolver unit tests (precedence, pattern, miss).
- **Unit 2:** `display-leak.test.mts` extension (href-gating + no-raw-slug).
- **Unit 3:** route render tests (hit / miss / source-allowlist degrade).
- **Unit 4:** report-render snapshot — affordance present iff `methodHref`.
- **Unit 5:** scrubber pass-through battery + positive "Supabase" removal.

No new gate on the materialization path (RULE 3 C2 respected — this is read-surface only). No vocab-slug / lockfile / secret triggers (pre-push gate clean): no `refinery/packs/**`, `refinery/vocab/**`, `package.json`, or workflow `env:` changes.

## 7. Build decomposition & dispatch

Honest sizing: this is a **small-to-medium** feature — ~6 files, no DB, no pipeline. Parallelism buys roughly one wave of wall-clock, not a big fan-out. Split by **judgment/risk** (Opus) vs **mechanical mirror** (Sonnet).

| Unit | What | Model | Why | Depends on |
|------|------|-------|-----|-----------|
| **U1** | Registry + resolver (`methodology-registry.mts`) | **Opus** | Sets the contract every other unit consumes; decides entry shape, literal-vs-pattern precedence, and the allowlist-gate semantics | — |
| **U2** | Speaker wiring (`DisplayMetric.methodHref`, `toDisplayBrain`, leak test) | **Opus** | Small but subtle — it's the one place a privacy/leak invariant (`display-leak.test.mts`) could regress | U1 |
| **U3** | `/r/method/[metric]/page.tsx` route | **Sonnet** | Near-mechanical mirror of the existing `/r/source/[table]` page; low-judgment rendering | U1 |
| **U4** | Method affordance in `MetricsTable` + report mapping | **Sonnet** | Mechanical UI add following existing `SourceLink` patterns | U2, U3 |
| **U5** | Hygiene scrub rule + pass-through battery | **Sonnet** | One bounded regex; the mandated pass-through test battery *is* the guard against over-match | — |

### Parallelization (waves)

```
Wave A   (start immediately, no cross-deps)
  ├─ U1  Registry + resolver        [Opus]
  └─ U5  Hygiene scrub + battery     [Sonnet]      ‖ runs fully parallel to U1

Wave B   (after U1 lands)
  ├─ U2  Speaker wiring              [Opus]        ┐ both need only U1,
  └─ U3  /r/method route             [Sonnet]      ┘ not each other → parallel

Wave C   (after U2 + U3)
  └─ U4  Badge UI                    [Sonnet]      ties the affordance to the live target
```

- **Critical path:** U1 → U2 → U4 (or U1 → U3 → U4). Three serial hops.
- **U5 is free** — independent file, independent concern; land it whenever.
- **U4 could overlap** U3's tail once U2 lands (the badge only needs the `methodHref` field; the link 404s until U3 ships). Kept in Wave C for a clean end-to-end demo, but can be pulled forward if we want.
- Each unit is independently committable with its own tests; nothing leaves the tree half-broken (atomic per unit).

## 8. Out of scope (YAGNI)

- Retrodicted skill / lift / accuracy on the public page (§3 — guardrail 3).
- Forward-`outcomes` public track-record surface (future, separate; needs graded calls to exist).
- Publisher-homepage source remap; "Proprietary" badge; auth changes; `SourcesGate` redesign; `BrainOutput` type-lift.
- Auto-generating registry entries from pack metadata — hand-authored is correct at this volume (mirror `SOURCE_PROVENANCE_TABLES`); revisit only if the registry outgrows manual upkeep.

## 9. Risks

- **Registry rot.** Hand-authored formulas drift if a pack changes its math. Mitigation: keep entries terse (what + how, not exact constants); the `/r/source` row sample remains the ground truth for values.
- **Affordance noise.** A `ƒ` on every row could clutter the table. Mitigation: only registered slugs show it (starts sparse); revisit visual weight after the first few render live.
- **Scrub over-match (U5).** The one historical failure mode of this file is a greedy regex eating a domain acronym. Mitigation: the literal `"Brains Supabase"` match is maximally specific, and the pass-through battery is acceptance-gating.
