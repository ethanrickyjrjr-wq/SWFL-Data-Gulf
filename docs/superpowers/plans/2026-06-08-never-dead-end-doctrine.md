# Never-Dead-End Doctrine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-page Highlighter answer **every** metric and **every** self-constructed prompt with one of two shapes — *"here's how it's derived from what we hold"* or *"here's how we / your AI can find it"* — **never** *"we don't know"* and **never** an invented breakdown. Every gap we hit is logged so the Ops coverage page can drive us toward holding all answers.

**Architecture:** Three layers. (1) A **universal floor** in the converse grounding prompt: the model states held figures as held and offers to find finer detail, but is forbidden from naming/guessing components it wasn't given — so the long tail of unregistered metrics already stops dead-ending and stops inventing on day one. (2) A **registered upgrade**: a metric with an authored `methodology-registry` entry gets its real equation + component have/need map injected server-side, so the answer recites the authored derivation instead of guessing. (3) A **deterministic gap log**: when an entry has `role:"need"` components (or the floor offers to find), we write a `data_requests` row naming the missing pieces — that table is the Ops page's feed.

**Tech Stack:** Next.js App Router (Route Handler SSE), React 19 client hooks, `@anthropic-ai/sdk` (Haiku 4.5), Supabase (`data_requests`), the refinery `methodology-registry.mts` (pure, React/DB-free, imported by both the build and the app), `bun test`, `npm run refinery:typecheck`.

---

## The doctrine (locked — this is the spine)

For **any** metric, **any** question, **any** chip we put in the user's mouth:

1. **Two answer shapes only, never a third.**
   - **Derive it** → show how the number is built from data we hold; the user assembles it however they want.
   - **Offer to find it** → "here's how *we* can find it for you" or "hand it to *your* Claude to pull" — an offer, never a refusal.
2. **Never dead-end.** The phrase class *"we don't hold what's driving that number"* is banned from answers. (Regression-guarded by a test, not by a runtime parser.)
3. **Never invent.** The model may only name components that were handed to it in a registry entry. With no entry, it states the published figure as held and offers to find finer detail — it does **not** guess what the drivers might be. (This is the exact failure in the origin answer: *"whether that's floor rent, tenant mix, property age, location premium…"* — all fabricated.)
4. **Never undersell.** A published figure is **held**. When a registry entry marks some components `need`, those belong to a *broader derived quantity* (e.g. a tenant's all-in occupancy cost), not to the published number. The answer must say "this figure is the base, which we hold; the fuller picture adds X/Y/Z, which we don't carry — want them?" — never "we only have part of this number."
5. **Don't waste the user's time.** No unprompted definitions, no assuming they don't know a term. Answer the question asked, tightly. Chips are action/data ("Break down the $27.51", "Compare to Naples", "How do you find this?"), never definitional ("What is triple-net?").
6. **Every gap feeds the Ops page.** A `need` component (or a floor-level offer-to-find) writes a `data_requests` row. The Ops coverage page (SP2) reads that table; over time the gap list is what we ingest against until we hold all answers.

This doctrine is **already half-encoded** in `RULES_OF_ENGAGEMENT` rule 3 (`refinery/lib/rules-of-engagement.mts:47`: *"GRAIN: answer at the grain held; a gap = offer to pull, never invent."*). The current converse prompt **contradicts** it (declines). This plan makes the converse surface obey the rule we already wrote — it does **not** add a new mandatory gate (RULE 3 C2), and it does **not** edit the byte-mirrored, 210-token-capped ROE block.

---

## Reused seams (verified in code, with file:line)

| Surface | Status | Note |
| --- | --- | --- |
| `refinery/lib/methodology-registry.mts` | ships | `MethodologyEntry` + literals + **patterns** + `resolveMethod(slug)`. Imported by the build (`speaker.mts`) **and** the app. **Canary: never register `cap_rate_median`** (`:16`). |
| `app/api/converse/route.ts` | ships | SSE; takes `{report_id, fact, question}`; **no slug today** (`:51`). `DATA_GAP_PHRASES` lives here (`:110-125`). |
| `lib/highlighter/grounding.ts` | ships | `buildGroundingContext` — **this** is where the decline instruction lives (`:75`), and where the entry must be injected. |
| `lib/highlighter/converse.ts` | ships | Client SSE driver; sends the body (`:52-56`). `answered` flows back on the done frame. |
| `lib/highlighter/use-highlight.ts` | ships | `SelectedFact` = `{text, rect, factType, context, mode}` — **no slug** (`:7-15`). Free selections can't know a slug; only metric-row chips can. |
| `components/highlighter/HighlightPopup.tsx` | ships | 2-stage popup; amber data-gap card gated on `answered===false` (`:235-248`); footer has **"Copy prompt for Claude ↗"** (`:279`) — there is **no** "Open in your Claude" link. |
| `lib/highlighter/handoff.ts` | ships | `buildClaudeHandoff` — the copy-prompt text (already done). |
| `lib/highlighter/meter.ts` | ships | `recordAsk` → `data_requests` (`:57-76`). |
| `docs/sql/20260608_data_requests.sql` | applied | `data_requests(report_id, fact, question, reach, answered)`; `answered=false` rows "feed the §4 data_targets loop" (`:6-9`). service_role only. |
| `lib/highlighter/suggestions.ts` | ships | Client **fallback** copy of `suggestionsForMetric`; real precompute is in `refinery/stages/4-output.mts` into `BrainOutputMetric.suggestions`. |
| `refinery/packs/cre-swfl.mts` | ships | Emits the real CRE slugs (below) + the per-submarket fan-out whose label is the Task-0 bug. |

### The real CRE metric slugs (from `brains/cre-swfl.md`, do not use prose names)

- Corridor medians (headline): `asking_rent_psf_median` ($27.51), `vacancy_rate_median` (3.2%), `absorption_sqft_median` (6,200 sqft). **`cap_rate_median` is the registry canary — never register it.**
- Per-submarket family (e.g. the Marco Island row in the origin answer): `vacancy_rate_marketbeat_<submarket>`, `asking_rent_nnn_marketbeat_<submarket>`, `absorption_sqft_marketbeat_<submarket>` — a **family**, so use a registry **pattern**, not literals.

---

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `refinery/packs/cre-swfl.mts` | Source-accurate citation label (publisher from `source_name`) | 0 |
| `refinery/packs/cre-swfl.test.mts` | Citation assertions updated to new publisher prefixes | 0 |
| `refinery/lib/methodology-registry.mts` | `equation` + `components` fields; 3 corridor-median literals; 1 marketbeat-submarket pattern | 1 |
| `refinery/lib/methodology-registry.test.mts` | Resolver returns equation/components for the new entries; canary still unregistered | 1 |
| `lib/highlighter/use-highlight.ts` | `SelectedFact.slug?` | 2 |
| `lib/highlighter/converse.ts` | Send `slug` in the POST body | 2 |
| `app/r/_components/metrics-table.tsx` | Pass the metric slug into the chip/fact path | 2 |
| `app/api/converse/route.ts` | Accept `slug`; resolve entry; inject; drive gap-log off components | 3,4 |
| `lib/highlighter/grounding.ts` | Inject `method` block; flip decline→pivot; floor anti-invention rule | 3 |
| `lib/highlighter/grounding.test.ts` | Asserts the floor + the injected-entry rendering | 3 |
| `docs/sql/20260608_data_requests_components.sql` | `needed_components text[]` column (idempotent) | 4 |
| `lib/highlighter/meter.ts` | `recordAsk` accepts `needed_components` | 4 |
| `lib/highlighter/suggestions.ts` | `suggestionsForSpan` — span-aware, action-only chips | 5 |
| `lib/highlighter/suggestions.test.ts` | Span variants; no definitional chip | 5 |
| `components/highlighter/HighlightPopup.tsx` | "Open in your Claude ↗" link; keep copy-prompt | 6 |

---

## Task 0 — Provenance-accurate citations (the Marco Island data fix)

Independent of the doctrine; ships on its own. The per-submarket citation hardcodes `MarketBeat` even when the row is `mhs_databook` (origin answer's Marco Island row traces to `mhsappraisal.com`). `group.row.source_name` ('cw_marketbeat' | 'mhs_databook') is available (`cre-source.mts:351`).

> **Operator note:** the display strings below (`"Cushman & Wakefield MarketBeat"`, `"MHS Databook"`) are a Data-Provenance wording choice. Reword in the helper if you want different customer-facing labels; the mechanism is unaffected. Scope is deliberately minimal — only the two **single-row, single-publisher** sites (per-submarket metric + zero-matched caveat). The cross-publisher aggregates (`buildMarketbeatRollupSource:426`, the SWFL-wide medians `:219`) keep "MarketBeat" as the feed name and are a documented follow-up, not part of this task.

**Files:**
- Modify: `refinery/packs/cre-swfl.mts` (add helper; lines 280, 1365)
- Test: `refinery/packs/cre-swfl.test.mts`

- [ ] **Step 1 — Add the publisher helper.** Insert near `cleanSubmarket` (`cre-swfl.mts:247`):

```ts
/** Customer-facing publisher label for a marketbeat_swfl row, from its source_name.
 *  The marketbeat_swfl table unions two publishers; the citation must name the real
 *  one, not the generic feed name. (source_name is 'cw_marketbeat' | 'mhs_databook',
 *  NOT NULL — see refinery/sources/marketbeat-swfl-source.mts:22.) */
function publisherLabel(sourceName: string): string {
  return sourceName === "mhs_databook"
    ? "MHS Databook"
    : "Cushman & Wakefield MarketBeat";
}
```

- [ ] **Step 2 — Per-submarket citation.** In `buildMarketbeatSubmarketSource`, change the citation (`:280`) from `` `MarketBeat ${display}${sectorLabel} ...` `` to:

```ts
    citation: `${publisherLabel(group.row.source_name)} ${display}${sectorLabel} ${group.row.quarter} — ${field} across the ${display} submarket; ${matchedDisclosure}${tail}.`,
```

- [ ] **Step 3 — Zero-matched caveat.** At `:1365`, change the leading `` `MarketBeat ${cleanSubmarket(group.submarket).display} submarket ...` `` to:

```ts
        `${publisherLabel(group.row.source_name)} ${cleanSubmarket(group.submarket).display} submarket reports a value but 0 of its ${group.mappedCorridorNames.length} mapped corridors are in the verified corpus this run — metric ships but cannot be tied to specific corridors.`,
```

- [ ] **Step 4 — Update test assertions.** Run `bun test refinery/packs/cre-swfl.test.mts` and update each citation assertion: a `cw_marketbeat` fixture row now expects the prefix `"Cushman & Wakefield MarketBeat <Place>"`; the `mhs_databook` helper row (`cre-swfl.test.mts:708`) now expects `"MHS Databook <Place>"`. (Assertions that match the bare substring `"MarketBeat"` still pass via "…Wakefield MarketBeat"; assertions matching `"MarketBeat <Place>"` must change.)

- [ ] **Step 5 — Gates + verify.** Touching `refinery/packs/**` fires the pre-push gate:

```
bun test refinery/packs/cre-swfl.test.mts
bun test refinery/lib/corridor-aliases.test.mts
bun refinery/tools/check-vocab-coverage.mts --all
```
Expected: all green; no new slugs introduced (label-text only). **Do not push** — `refinery/packs/**` is a diff-review surface (RULE 1). Show the diff and stop.

- [ ] **Step 6 — Commit (local).**
```
git add refinery/packs/cre-swfl.mts refinery/packs/cre-swfl.test.mts
git commit -m "fix(cre-swfl): cite MHS Databook vs C&W MarketBeat by source_name"
```

---

## Task 1 — Registry: `equation` + `components` + the marketbeat-submarket pattern

Adds the authored upgrade. **The `components` list is the allowlist of components the model is allowed to name** — this is the structural anti-invention guarantee.

**Files:**
- Modify: `refinery/lib/methodology-registry.mts`
- Test: `refinery/lib/methodology-registry.test.mts`

- [ ] **Step 1 — Extend the type.** Add to `MethodologyEntry` (after `doc?`, `:35`):

```ts
  /** Explicit derivation of the quantity a user means when they "break this down".
   *  Plain language, no exact constants. e.g. "all-in occupancy = base rent + taxes + insurance + CAM". */
  equation?: string;
  /** The parts of `equation`. role:"have" = we hold an input for it; role:"need" = we don't (yet).
   *  This list is the ONLY set of components an answer may name — the anti-invention allowlist. */
  components?: {
    name: string;                  // "Property taxes"
    role: "have" | "need";
    heldFrom?: string;             // slug/source we hold it from, when role==="have"
    candidateSource?: string;      // where to get it, when role==="need"
  }[];
```

- [ ] **Step 2 — Add the three corridor-median literals.** Into `METHODOLOGY_LITERALS` (`:39`). Note `measures` states the published figure is **held**, so the answer never undersells.

```ts
  asking_rent_psf_median: {
    label: "Median asking rent (NNN)",
    measures:
      "The median quoted triple-net asking rent across SWFL CRE corridors reporting this period. This published figure is the base asking rate — held, not estimated.",
    formula: "Median of each corridor's quoted NNN asking rent for the period.",
    denominator: "per sqft (PSF), across reporting corridors",
    brain: "cre-swfl",
    equation: "all-in occupancy cost = base (NNN asking rent) + property taxes + insurance + CAM",
    components: [
      { name: "Base (NNN asking rent)", role: "have", heldFrom: "asking_rent_psf_median" },
      { name: "Property taxes", role: "need", candidateSource: "county property appraiser / broker comps" },
      { name: "Insurance", role: "need", candidateSource: "broker comps / carrier quotes" },
      { name: "CAM (common-area maintenance)", role: "need", candidateSource: "landlord CAM reconciliation / broker comps" },
    ],
  },
  vacancy_rate_median: {
    label: "Median vacancy rate",
    measures:
      "The median vacancy rate across SWFL CRE corridors reporting this period. The published rate is held; the underlying GLA counts are not.",
    formula: "Median of each corridor's reported vacancy rate for the period.",
    denominator: "percent, across reporting corridors",
    brain: "cre-swfl",
    equation: "vacancy rate = vacant GLA ÷ total GLA",
    components: [
      { name: "Reported vacancy rate", role: "have", heldFrom: "vacancy_rate_median" },
      { name: "Vacant GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
      { name: "Total GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
    ],
  },
  absorption_sqft_median: {
    label: "Median net absorption",
    measures:
      "The median net absorption across SWFL CRE corridors reporting this period. The published flow is held; the period-end GLA snapshots are not.",
    formula: "Median of each corridor's reported net absorption for the period.",
    denominator: "sqft, across reporting corridors",
    brain: "cre-swfl",
    equation: "net absorption = occupied GLA (period end) − occupied GLA (period start)",
    components: [
      { name: "Reported net absorption", role: "have", heldFrom: "absorption_sqft_median" },
      { name: "Occupied GLA (period start)", role: "need", candidateSource: "broker survey detail / CoStar" },
      { name: "Occupied GLA (period end)", role: "need", candidateSource: "broker survey detail / CoStar" },
    ],
  },
```

- [ ] **Step 3 — Add the per-submarket pattern.** Into `METHODOLOGY_PATTERNS` (`:85`). One pattern covers the whole family (Marco Island, Naples, Fort Myers, …).

```ts
  {
    // Per-submarket broker metrics, e.g. asking_rent_nnn_marketbeat_marco_island.
    test: /^(vacancy_rate|asking_rent_nnn|absorption_sqft)_marketbeat_[a-z0-9_]+$/,
    build: (slug) => {
      const m = slug.match(/^(vacancy_rate|asking_rent_nnn|absorption_sqft)_marketbeat_(.+)$/)!;
      const field = m[1];
      const place = m[2].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (field === "asking_rent_nnn") {
        return {
          label: `${place} asking rent (NNN)`,
          measures: `The quoted triple-net asking rent reported for the ${place} submarket. This published figure is the base asking rate — held, not estimated.`,
          formula: `Quoted NNN asking rent for the ${place} submarket from the latest verified broker report.`,
          denominator: "per sqft (PSF)",
          brain: "cre-swfl",
          equation: "all-in occupancy cost = base (NNN asking rent) + property taxes + insurance + CAM",
          components: [
            { name: "Base (NNN asking rent)", role: "have", heldFrom: slug },
            { name: "Property taxes", role: "need", candidateSource: "county property appraiser / broker comps" },
            { name: "Insurance", role: "need", candidateSource: "broker comps / carrier quotes" },
            { name: "CAM (common-area maintenance)", role: "need", candidateSource: "landlord CAM reconciliation / broker comps" },
          ],
        };
      }
      const isVac = field === "vacancy_rate";
      return {
        label: `${place} ${isVac ? "vacancy rate" : "net absorption"}`,
        measures: `The ${isVac ? "vacancy rate" : "net absorption"} reported for the ${place} submarket. The published ${isVac ? "rate" : "flow"} is held; the underlying GLA detail is not.`,
        formula: `${isVac ? "Reported vacancy rate" : "Reported net absorption"} for the ${place} submarket from the latest verified broker report.`,
        denominator: isVac ? "percent" : "sqft",
        brain: "cre-swfl",
        equation: isVac
          ? "vacancy rate = vacant GLA ÷ total GLA"
          : "net absorption = occupied GLA (period end) − occupied GLA (period start)",
        components: isVac
          ? [
              { name: "Reported vacancy rate", role: "have", heldFrom: slug },
              { name: "Vacant GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
              { name: "Total GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
            ]
          : [
              { name: "Reported net absorption", role: "have", heldFrom: slug },
              { name: "Occupied GLA (period start)", role: "need", candidateSource: "broker survey detail / CoStar" },
              { name: "Occupied GLA (period end)", role: "need", candidateSource: "broker survey detail / CoStar" },
            ],
      };
    },
  },
```

- [ ] **Step 4 — Tests.** In `refinery/lib/methodology-registry.test.mts`:

```ts
test("corridor-median entries carry equation + a held base component", () => {
  const e = resolveMethod("asking_rent_psf_median")!;
  expect(e.equation).toContain("base");
  expect(e.components?.find((c) => c.role === "have")?.heldFrom).toBe("asking_rent_psf_median");
  expect(e.components?.some((c) => c.role === "need")).toBe(true);
});

test("per-submarket family resolves via pattern, slug-keyed held component", () => {
  const e = resolveMethod("asking_rent_nnn_marketbeat_marco_island")!;
  expect(e.label).toBe("Marco Island asking rent (NNN)");
  expect(e.components?.find((c) => c.role === "have")?.heldFrom).toBe("asking_rent_nnn_marketbeat_marco_island");
});

test("cap_rate_median stays UNregistered (display-leak canary)", () => {
  expect(resolveMethod("cap_rate_median")).toBeNull();
});
```

Run: `bun test refinery/lib/methodology-registry.test.mts` — Expected: PASS. Then `bun test refinery/render/speaker.mts` consumers and `bun refinery/tools/check-vocab-coverage.mts --all` to confirm no methodHref/display-leak regressions.

- [ ] **Step 5 — Commit.**
```
git add refinery/lib/methodology-registry.mts refinery/lib/methodology-registry.test.mts
git commit -m "feat(registry): equation + have/need components; CRE medians + submarket pattern"
```

---

## Task 2 — Thread the metric `slug` end-to-end

The registry resolves by **slug**, but the endpoint only gets `fact` (a string). The slug is reliably known **only on the metric-row / chip path** (the row carries it). Free text selections leave `slug` undefined and fall to the floor — that's correct, not a gap.

**Files:**
- Modify: `lib/highlighter/use-highlight.ts:7-15` (add field)
- Modify: `lib/highlighter/converse.ts:11-16, 52-56` (carry + send)
- Modify: `app/r/_components/metrics-table.tsx` (populate slug on the chip/fact)

- [ ] **Step 1 — `SelectedFact.slug?`.** In `use-highlight.ts`, add to the interface:
```ts
  /** Metric slug when the selection is a known key_metric value (chip/row path). Undefined for free selections. */
  slug?: string;
```

- [ ] **Step 2 — `ConverseInput.slug?` + send it.** In `converse.ts`, add `slug?: string;` to `ConverseInput` and include it in the POST body:
```ts
      body: JSON.stringify({
        report_id: input.reportId,
        fact: input.fact,
        slug: input.slug,
        question,
      }),
```

- [ ] **Step 3 — Populate from the metric row.** In `app/r/_components/metrics-table.tsx`, the value-cell fact chip already knows its `DisplayMetric` (it renders `methodHref`/`suggestions`). Pass that metric's slug into the `SelectedFact` it constructs, and thread it through `HighlightPopup`'s `submit()` into `ask({ reportId, fact, slug: fact.slug, question })`. (Derive the slug from the metric row's own field, or parse it from `methodHref` = `/r/method/<slug>` when only the href is in scope.)

- [ ] **Step 4 — Test the wire.** Extend `lib/highlighter/converse.test.ts` so the fetch stub captures the request body and asserts `slug` is present when supplied and omitted when not:
```ts
test("streamConverse sends slug when provided", async () => {
  let sent: any;
  const stub = ((_u: string, init: any) => { sent = JSON.parse(init.body); return okSse(""); }) as any;
  await streamConverse({ reportId: "cre-swfl", fact: "$27.51", slug: "asking_rent_psf_median", question: "break it down" }, noopHandlers, stub);
  expect(sent.slug).toBe("asking_rent_psf_median");
});
```
Run: `bun test lib/highlighter/converse.test.ts` — Expected: PASS.

- [ ] **Step 5 — Commit.**
```
git add lib/highlighter/use-highlight.ts lib/highlighter/converse.ts lib/highlighter/converse.test.ts app/r/_components/metrics-table.tsx
git commit -m "feat(highlighter): carry metric slug into /api/converse"
```

---

## Task 3 — Server: resolve the entry, inject it, flip decline→pivot (the floor + the upgrade)

**Files:**
- Modify: `lib/highlighter/grounding.ts` (inject `method`; rewrite the prompt preamble)
- Modify: `app/api/converse/route.ts` (accept `slug`; `resolveMethod`; pass `method`)
- Test: `lib/highlighter/grounding.test.ts`

- [ ] **Step 1 — Extend `GroundingInput`.** In `grounding.ts`, import the type and add an optional entry:
```ts
import type { MethodologyEntry } from "../../refinery/lib/methodology-registry.mts";
// ...
export interface GroundingInput {
  rules: string;
  gazetteer: string;
  blocks: GroundingBlock[];
  method?: MethodologyEntry | null; // authored derivation for the highlighted metric, when known
}
```

- [ ] **Step 2 — Render the method block.** Add a helper and include it when present:
```ts
function renderMethod(m: MethodologyEntry): string {
  const have = (m.components ?? []).filter((c) => c.role === "have").map((c) => c.name);
  const need = (m.components ?? []).filter((c) => c.role === "need");
  const lines = [
    `### How "${m.label}" works (authored — use ONLY this, never guess)`,
    `Means: ${m.measures}`,
    m.equation ? `Equation: ${m.equation}` : "",
    have.length ? `We HOLD: ${have.join(", ")} (this is the published figure — state it as held, never as partial).` : "",
    need.length
      ? `We do NOT hold: ${need.map((c) => `${c.name} (could come from ${c.candidateSource})`).join("; ")}. Offer to find these; do not estimate them.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}
```

- [ ] **Step 3 — Rewrite the preamble (the doctrine).** Replace the decline lines (`grounding.ts:74-77`) with the never-dead-end / never-invent / never-undersell floor:
```ts
  return [
    "You are the SWFL Data Gulf in-page analyst. Answer from the grounded blocks below and the authored method block when present.",
    "NEVER say we don't have the data, can't find it, or don't know what's driving a number. Two shapes only:",
    "  (a) DERIVE IT — explain how the figure is built from what we hold; or",
    "  (b) OFFER TO FIND IT — say we can pull the missing piece, or that they can hand it to their own Claude. An offer, never a refusal.",
    "A published figure in a block is HELD — state it as held, never as partial or missing.",
    "NEVER invent or guess components, drivers, or breakdowns. If an authored method block is present, you may name ONLY the components it lists. If there is NO method block, give the held figure and offer to find finer detail — do NOT speculate about what the drivers might be.",
    "Tag any projection beyond the cited numbers inline with [INFERENCE] + one falsifier.",
    `Quote this freshness token exactly once: ${token}`,
    "",
    input.method ? "=== METHOD ===\n" + renderMethod(input.method) + "\n" : "",
    "=== RULES OF ENGAGEMENT ===",
    input.rules,
    "",
    "=== GEOGRAPHY ===",
    input.gazetteer,
    "",
    "=== GROUNDED DATA ===",
    input.blocks.map(renderBlock).join("\n\n"),
  ].filter((s) => s !== "").join("\n");
```

- [ ] **Step 4 — Wire the route.** In `app/api/converse/route.ts`: read `slug` from the body (`:57`), resolve it, pass to grounding:
```ts
import { resolveMethod } from "@/refinery/lib/methodology-registry.mts";
// ...
const { report_id, fact, slug, question } = body as {
  report_id?: string; fact?: string; slug?: string; question?: string;
};
const method = typeof slug === "string" ? resolveMethod(slug) : null;
// ...
system = FORMAT_RULE + buildGroundingContext({
  rules: RULES_OF_ENGAGEMENT, gazetteer: GAZETTEER_STR,
  blocks: [primary, ...reachBlocks], method,
});
```
(Keep the existing `&& method` available to Task 4 for gap-logging.)

- [ ] **Step 5 — Tests.** In `lib/highlighter/grounding.test.ts`:
```ts
test("floor: prompt forbids decline and forbids guessing components", () => {
  const s = buildGroundingContext({ rules: "R", gazetteer: "G", blocks: [block] });
  expect(s).not.toContain("DECLINE");
  expect(s.toLowerCase()).toContain("offer to find");
  expect(s).toContain("NEVER invent");
});
test("upgrade: an injected entry renders held + need components", () => {
  const s = buildGroundingContext({ rules: "R", gazetteer: "G", blocks: [block],
    method: resolveMethod("asking_rent_psf_median") });
  expect(s).toContain("We HOLD");
  expect(s).toContain("We do NOT hold");
});
```
Run: `bun test lib/highlighter/grounding.test.ts` — Expected: PASS.

- [ ] **Step 6 — Commit.**
```
git add lib/highlighter/grounding.ts lib/highlighter/grounding.test.ts app/api/converse/route.ts
git commit -m "feat(converse): never-dead-end floor + authored-method injection"
```

---

## Task 4 — Deterministic gap-logging into the Ops feed

The doctrine forbids dead-end phrases, so the old `answered=false` parser would go silent — and with it the Ops page's feed. Replace it with a **deterministic** signal: a metric whose entry has `role:"need"` components is, by definition, a gap; log the named components. `DATA_GAP_PHRASES` is demoted to a **test-only regression guard**.

**Files:**
- Create: `docs/sql/20260608_data_requests_components.sql`
- Modify: `lib/highlighter/meter.ts` (`recordAsk` accepts `needed_components`)
- Modify: `app/api/converse/route.ts` (compute gap from `method`; log)
- Test: `app/api/converse/route.test.ts`

- [ ] **Step 1 — Idempotent migration.**
```sql
-- docs/sql/20260608_data_requests_components.sql (idempotent)
BEGIN;
ALTER TABLE public.data_requests
  ADD COLUMN IF NOT EXISTS needed_components text[] NOT NULL DEFAULT '{}';
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Verify: SELECT column_name FROM information_schema.columns
--          WHERE table_name='data_requests' AND column_name='needed_components';
```
Run it directly (creds in `.dlt/secrets.toml`, per RULE 1 SQL policy); confirm the column exists.

- [ ] **Step 2 — `recordAsk` carries components.** In `meter.ts`, add `needed_components?: string[]` to the `recordAsk` meta and insert it (`db.from("data_requests").insert({ ..., needed_components: meta.needed_components ?? [] })`).

- [ ] **Step 3 — Drive the gap deterministically.** In `route.ts`, after `method` is resolved, compute the named gaps and replace the phrase-derived `answered`:
```ts
const neededComponents = (method?.components ?? [])
  .filter((c) => c.role === "need").map((c) => c.name);
// answered=false means "we offered to find something" (a tracked gap), NOT "we failed".
const answered = neededComponents.length === 0;
// ... in the done frame and recordAsk:
void recordAsk({ report_id, fact, question, reach: reachSlugs, answered, needed_components: neededComponents });
```
Keep emitting `answered` on the done frame so the popup affordance (Task — unchanged) still fires; its meaning is now "there's a findable gap," which is exactly what the "find it" offer wants.

- [ ] **Step 4 — Demote `DATA_GAP_PHRASES` to a test guard.** Remove the runtime `DATA_GAP_PHRASES.some(...)` (`route.ts:144-145`). Move the list into `app/api/converse/route.test.ts` as a regression assertion:
```ts
const DEAD_END = ["don't have that data","no data available","can't find that","cannot find that"];
test("converse system prompt never instructs a dead-end", () => {
  // build the system prompt via the exported helper / a thin extraction
  expect(DEAD_END.some((p) => systemPrompt.toLowerCase().includes(p))).toBe(false);
});
```

- [ ] **Step 5 — Route test for the gap log.** Assert that asking about a `need`-bearing slug logs the components (inject a stub service-role client / spy on `recordAsk`). Run: `bun test app/api/converse/route.test.ts` — Expected: PASS.

- [ ] **Step 6 — Commit.**
```
git add docs/sql/20260608_data_requests_components.sql lib/highlighter/meter.ts app/api/converse/route.ts app/api/converse/route.test.ts
git commit -m "feat(converse): deterministic gap-log of need-components into data_requests"
```

---

## Task 5 — Span-aware, action-only chips

Chips must (a) be answerable by Tasks 1–4, (b) vary by what's highlighted, (c) never be definitional. This is a **new runtime client function** layered on the existing precompute — the precomputed `BrainOutputMetric.suggestions` stays the base case for plain metric rows.

**Files:**
- Modify: `lib/highlighter/suggestions.ts` (add `suggestionsForSpan`)
- Modify: `components/highlighter/HighlightPopup.tsx` / its caller (use span chips when a slug+entry are known)
- Test: `lib/highlighter/suggestions.test.ts`

- [ ] **Step 1 — Add `suggestionsForSpan`.** Pure, React-free; uses the clean label, never the raw slug; emits action/data chips only:
```ts
import type { MethodologyEntry } from "../../refinery/lib/methodology-registry.mts";

/** Span-aware chips. `value` present => offer to break the specific figure down.
 *  `place` present => offer a comparison + a find-the-missing-parts action.
 *  Never definitional ("What is X?") — the doctrine: don't assume the user doesn't know. */
export function suggestionsForSpan(args: {
  entry?: MethodologyEntry | null; value?: string | number; place?: string;
}): string[] {
  const { entry, value, place } = args;
  const label = entry?.label ?? "this";
  const out: string[] = [];
  if (value != null) out.push(`Break down the ${value}`);
  else out.push(`How is ${label.toLowerCase()} derived?`);
  if (place) out.push(`Compare to Naples`);
  const need = (entry?.components ?? []).filter((c) => c.role === "need");
  if (need.length) out.push(place ? `Find ${place}'s ${need[0].name.toLowerCase()}` : `Find the ${need[0].name.toLowerCase()}`);
  else out.push(`How do you find this?`);
  return out.slice(0, 3);
}
```

- [ ] **Step 2 — Use it in the popup.** When the popup has a slug, resolve the entry client-side (`resolveMethod(fact.slug)`) and prefer `suggestionsForSpan({ entry, value: fact.text, place: fact.factType === "place" ? fact.text : undefined })` over the precomputed list. Fall back to the precomputed `suggestions` prop when no slug/entry.

- [ ] **Step 3 — Tests.**
```ts
test("value span => break down the figure, no definitional chip", () => {
  const c = suggestionsForSpan({ entry: resolveMethod("asking_rent_psf_median"), value: "$27.51" });
  expect(c[0]).toBe("Break down the $27.51");
  expect(c.some((s) => /^what is/i.test(s))).toBe(false);
});
test("need-component surfaces a find action", () => {
  const c = suggestionsForSpan({ entry: resolveMethod("asking_rent_nnn_marketbeat_marco_island"), value: "$27.9", place: "Marco Island" });
  expect(c.some((s) => /^Find Marco Island's/.test(s))).toBe(true);
});
```
Run: `bun test lib/highlighter/suggestions.test.ts` — Expected: PASS.

- [ ] **Step 4 — Commit.**
```
git add lib/highlighter/suggestions.ts lib/highlighter/suggestions.test.ts components/highlighter/HighlightPopup.tsx
git commit -m "feat(highlighter): span-aware action-only chips"
```

---

## Task 6 — "Open in your Claude ↗" link (the actually-missing R4 affordance)

The popup already **copies** a handoff prompt; it does not **open** Claude. Add the link next to the existing copy button; keep both.

**Files:**
- Modify: `components/highlighter/HighlightPopup.tsx` (footer, near `:274-280`)

- [ ] **Step 1 — Add the link.** Reuse `buildClaudeHandoff` text as a URL-encoded prefill to `https://claude.ai/new?q=`:
```tsx
<a
  href={`https://claude.ai/new?q=${encodeURIComponent(handoff)}`}
  target="_blank" rel="noopener noreferrer"
  className="text-xs text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400"
>
  Open in your Claude ↗
</a>
```
> **Vendor-First:** verify the claude.ai prefill query param in-session (WebFetch the current claude.ai new-chat URL contract) before shipping — the `?q=` param shape can drift. If unverified, ship copy-only and leave this behind a follow-up check.

- [ ] **Step 2 — Commit.**
```
git add components/highlighter/HighlightPopup.tsx
git commit -m "feat(highlighter): add Open-in-your-Claude handoff link"
```

---

## Verification (end-to-end, before any push)

- [ ] **Floor (unregistered metric):** highlight any metric with no registry entry → ask "what's driving this?" → answer states the held figure + offers to find finer detail; **no invented drivers, no "we don't know."**
- [ ] **Upgrade (registered):** highlight `$27.51` (asking rent) → chips are `Break down the $27.51 · Compare to Naples · How do you find this?` → tap Break down → answer gives the equation, says the base is held, names taxes/insurance/CAM as findable, offers to find them. The origin dead-end+invention answer must be impossible to reproduce.
- [ ] **Gap log:** that same ask writes a `data_requests` row with `answered=false` and `needed_components = {Property taxes, Insurance, CAM (common-area maintenance)}`. (`SELECT needed_components FROM public.data_requests ORDER BY id DESC LIMIT 1;`)
- [ ] **Provenance (Task 0):** the Marco Island submarket citation reads "MHS Databook Marco Island …", not "MarketBeat …".
- [ ] **Gates:** `bun test` (registry, grounding, converse, suggestions, cre-swfl) all green; `npm run refinery:typecheck` shows only the ~18 baseline strictness errors (no new ones); `bun refinery/tools/check-vocab-coverage.mts --all` OK.
- [ ] **Ship:** top-of-file `SESSION_LOG.md` entry + `node scripts/safe-push.mjs`. `refinery/packs/**` (Task 0) and the live `/api/converse` response (Tasks 3–4) are **diff-review surfaces** — show the diff and get the go-ahead before pushing (RULE 1).

---

## Explicitly deferred (so this stays tight)

- **SP2 — Ops coverage page.** A page over `data_requests` (esp. `answered=false` + `needed_components`) showing, per metric/brain, what we're missing and how often it's asked — the gap ledger that tells us what to ingest next. Reads the table this plan fills; builds nothing in the answer path.
- **SP3 — Author entries across all brains.** Fan-out: write `methodology-registry` entries for every brain's headline metrics. The floor already keeps those honest; SP3 upgrades each to a real equation.
- **SP4 — Inline fetch / bring-it-home.** Actually pulling the `need` components at runtime (web/tools in converse) or an ingest flywheel off the gap log. This breaks the "context-starved = no-invention" guarantee and is its own spec (sits with R2 in the reach ladder).
- **Cross-publisher aggregate citations.** The rollup + SWFL-wide median citations still say "MarketBeat"; they aggregate across publishers, so a source-accurate label there is a separate, larger change.
```
