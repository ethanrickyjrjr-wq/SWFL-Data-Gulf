# Desk Discovery Flywheel — Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: schema

**Goal:** Close out the four open items from the Desk Discovery Flywheel (Spec B) ship: the two takeaway-quality polish checks, the deferred `/r/*` takeaway, the operator-gated robots carve-out, and the deploy-time live-verify that closes the whole build. Each task maps 1:1 to an existing `checks` entry — no new registration needed.

| Task | Closes check | Project |
|---|---|---|
| 1 | `desk_takeaway_national_scope_guard` + `desk_takeaway_polish` | desk-discovery-flywheel |
| 2 | `r_star_report_takeaway` | desk-discovery-flywheel |
| 3 | `desk_robots_answer_engine_carveout` | desk-discovery-flywheel |
| 4 | `desk_discovery_flywheel_live_verify` | brain-platform |

**Source of truth for what already shipped:** `docs/superpowers/plans/2026-07-11-desk-discovery-flywheel-plan.md` (Tasks 1–5 COMPLETE per `.superpowers/sdd/progress.md`; Task 6/robots DEFERRED). This doc does not re-litigate that plan — it picks up exactly where it left off, verified against the code as it exists right now (07/11/2026), not the plan's original intent.

**Global constraints (inherited from the original plan — still binding):**
- No robots edit folded into any other task. Task 3 stands alone, operator-approval-gated.
- Numbers/takeaways live in server-rendered HTML — no client-fetch regression.
- Per-datum `asOf`, never a borrowed page-level stamp.
- No invented figures. `national`/`plural` flags below are explicit metadata, not new numbers.
- Verify with `bunx next build`, not `npx tsc`.
- **One authority for a shared concept** (locked project rule): `makeTakeaway` currently lives in `lib/desk/mappers.ts` and is desk-only. The moment a second consumer (`/r/*`, Task 2) needs it, it must be *extracted*, not re-derived — this is the exact failure pattern (per-builder re-derivation) that caused the prior ZIP-scope drift.

---

### Task 1: Takeaway quality — explicit scope flag + grammar fix

Two checks, same root cause, same call sites — doing them together avoids touching `lib/desk/loaders.ts`'s KPI-push block twice.

**`desk_takeaway_national_scope_guard`:** `lib/desk/loaders.ts:765` currently infers "is this a national figure?" via `/mortgage/i.test(d.label)` — a regex on display text. Fragile: any future national-rate KPI (e.g. a 15-yr rate, a Fed funds citation) silently gets mis-scoped as regional unless someone remembers to extend the regex.

**`desk_takeaway_polish`:** two sub-issues confirmed in the current code:
1. **Grammar** — `makeTakeaway` hardcodes the verb `is`. KPIs with plural labels render ungrammatically: `"Active listings in Southwest Florida is 29,413…"`, `"Listings with a price cut … is 12%…"`, `"New listings, latest scan … is 41…"`.
2. **Dead computation** — `lib/desk/loaders.ts:768-769` computes `gauges.priceReduced.takeaway` and `hero.cities[*].latest.takeaway`, but `app/desk/page.tsx` only ever reads `desk.kpis[*].takeaway` (confirmed via grep — no other file references `.takeaway`). Those two computed sentences never reach SSR HTML — the entire point of Spec B.

**Files:**
- Modify: `lib/desk/types.ts` (extend `DeskDatum`)
- 🔴 Modify: `lib/desk/mappers.ts` (`makeTakeaway` verb logic)
- 🔴 Modify: `lib/desk/mappers.test.ts` (extend)
- 🔴 Modify: `lib/desk/loaders.ts` (explicit flags at push-time, drop the regex)
- Modify: `app/desk/page.tsx` (render the two previously-orphaned takeaway sources)

**Interfaces:**
- `DeskDatum` gains two optional flags, set explicitly at construction, never inferred:
  ```ts
  /** True ONLY for a national figure (e.g. 30-yr mortgage) — takeaway omits the
   *  Southwest Florida scope clause. Explicit, not regex-inferred from the label
   *  (replaces /mortgage/i — desk_takeaway_national_scope_guard). */
  national?: boolean;
  /** True when `label` is a grammatical plural ("Active listings") — takeaway
   *  uses "are" instead of "is" (desk_takeaway_polish). */
  plural?: boolean;
  ```
- `makeTakeaway(d, scope?)` reads `d.plural` for the verb; callers pass `d.national ? undefined : scope` instead of a regex test.

- [ ] **Step 1: Extend `DeskDatum`** — add `national?: boolean; plural?: boolean;` to `lib/desk/types.ts` (next to the existing `takeaway?` field, same doc-comment style).

- [ ] **Step 2: Update `makeTakeaway` tests first** (`lib/desk/mappers.test.ts`)
  ```ts
  test("makeTakeaway: plural label uses 'are'", () => {
    const t = makeTakeaway(
      { label: "Active listings", display: "29,413", asOf: "07/10/2026", sourceLabel: "SWFL Data Gulf", plural: true },
      "Southwest Florida",
    );
    assert.equal(t, "Active listings in Southwest Florida are 29,413 as of 07/10/2026, per SWFL Data Gulf.");
  });
  ```
  Run `bun test lib/desk/mappers.test.ts` — expect FAIL (`plural` not read yet).

- [ ] **Step 3: Implement the verb switch in `makeTakeaway`**
  ```ts
  export function makeTakeaway(
    d: { label: string; display: string; asOf?: string; sourceLabel: string; plural?: boolean },
    scope?: string,
  ): string {
    if (!d.display) return "";
    const where = scope ? ` in ${scope}` : "";
    const asOf = d.asOf ? ` as of ${d.asOf}` : "";
    const verb = d.plural ? "are" : "is";
    return `${d.label}${where} ${verb} ${d.display}${asOf}, per ${d.sourceLabel}.`;
  }
  ```
  Run tests — expect PASS (existing non-plural tests keep the `is` default, unaffected).

- [ ] **Step 4: Set explicit flags at each KPI push site in `lib/desk/loaders.ts`**
  - `"Active listings"` (line ~567) → add `plural: true`
  - `"Listings with a price cut"` (line ~577) → add `plural: true`
  - `"30-yr fixed mortgage"` (line ~587) → add `national: true`
  - `"New listings, latest scan"` (line ~604) → add `plural: true`
  - `"Confirmed sold, latest scan"` — leave singular (reads as a count-of-event, not a bare plural noun)
  - `gauges.priceReduced` object (line ~750, label `"Share of active listings with a price cut"`) — singular subject ("Share"), leave as-is

- [ ] **Step 5: Replace the regex loop with explicit-flag reads** (lines 760-769)
  ```ts
  // Quotable takeaways (Spec B GEO). scope/plural are explicit metadata set at
  // each push site above — never inferred from label text (desk_takeaway_national_scope_guard).
  const SWFL = "Southwest Florida";
  for (const d of kpis) {
    d.takeaway = makeTakeaway(d, d.national ? undefined : SWFL);
  }
  if (gauges.priceReduced) gauges.priceReduced.takeaway = makeTakeaway(gauges.priceReduced, SWFL);
  if (hero) for (const c of hero.cities) c.latest.takeaway = makeTakeaway(c.latest);
  ```

- [ ] **Step 6: Render the previously-orphaned takeaways in `app/desk/page.tsx`**
  - Near the gauges row (~line 247, beside `<DeskGaugePanel datum={desk.gauges.priceReduced} />`): render `desk.gauges.priceReduced.takeaway` as a small caption line under the gauge panel, same `text-[11px] text-gray-500` treatment as the KPI takeaway list.
  - Near the hero zone (~line 151, beside `<DeskHero hero={desk.hero} />`): render each city's `c.latest.takeaway` (one line per city) beneath the chart, same treatment.
  - Both must land in server-rendered HTML (these are already server-component blocks — no client state needed).

- [ ] **Step 7: Verify**
  Run: `bun test lib/desk/mappers.test.ts lib/desk/loaders.test.ts 2>/dev/null; bunx next build`
  Then: `bunx next start & sleep 4 && curl -s localhost:3000/desk | grep -c 'listings are\|Share of active listings.*is' ; kill %1`
  Expect: grammar count ≥ 1, build green.

- [ ] **Step 8: Commit**
  ```bash
  git add lib/desk/types.ts lib/desk/mappers.ts lib/desk/mappers.test.ts lib/desk/loaders.ts app/desk/page.tsx
  git commit -m "fix(desk-geo): explicit national/plural takeaway flags, render orphaned gauge+hero takeaways"
  ```
  Closes: `desk_takeaway_national_scope_guard`, `desk_takeaway_polish`.

---

### Task 2: `/r/*` report-page takeaway (Spec B item 2, deferred)

The original plan explicitly deferred this: `/r/[slug]` already SSRs `display.conclusion` (prose direction) and an "As of" `Meta`, but no number-first, single-sentence takeaway — the specific GEO tactic (Cite-Sources + Statistics-Addition) that `/desk` now has.

**Verified against `refinery/render/speaker.mts` and `app/r/[slug]/page.tsx`:**
- `DisplayBrain.metrics: DisplayMetric[]` (from `toDisplayBrain`, line 840) already carries `{ label, value, direction, sourceLabel, sourceUrl, fetchedAt, ... }` — the same shape `DeskDatum` has, under different field names (`value` is already display-formatted; `fetchedAt` is a raw ISO string, not yet MM/DD/YYYY).
- `lib/project/as-of.ts` exports `asOfFromIso(iso)` — already imported in `app/r/[slug]/page.tsx` — which does exactly the ISO→MM/DD/YYYY conversion `fetchedAt` needs.
- `cre-swfl` is special-cased elsewhere on this page (`summaryMetrics` filters out MB-city-rollup and current-events-signal metrics via `parseMBCityLabel`/`isMBRollup`) — the takeaway's lead-metric pick must reuse that same filter or it'll surface a rollup row as the "headline number" for that one brain.
- Insertion point: directly under the existing conclusion paragraph (`<AnswerText text={display.conclusion} />`, ~line 200), inside the same `<section className="mt-8">`.

**Files:**
- Create: `lib/geo-takeaway.ts` (extracted from `lib/desk/mappers.ts` — the shared-authority move)
- 🔴 Modify: `lib/desk/mappers.ts` (re-export or delete local copy, import from the new shared module)
- 🔴 Modify: `lib/desk/loaders.ts` (update import path)
- Create: `lib/geo-takeaway.test.ts` (move the existing `makeTakeaway` tests here)
- 🔴 Modify: `lib/desk/mappers.test.ts` (remove the moved tests)
- Modify: `app/r/[slug]/page.tsx` (lead-metric selection + SSR render)

**Interfaces:**
- `makeTakeaway(d: { label; display; asOf?; sourceLabel; plural? }, scope?: string): string` — signature unchanged, just relocated. Both `/desk` and `/r/*` import the same function.
- New in `app/r/[slug]/page.tsx`: `leadMetric = display.metrics.find(isRealMetric)` where `isRealMetric` reuses the existing cre-swfl rollup filter (falls through to `metrics[0]` for every non-cre-swfl brain, since the filter is a no-op there).

- [ ] **Step 1: Extract `makeTakeaway` to `lib/geo-takeaway.ts`**
  Move the function + its doc comment verbatim. `lib/desk/mappers.ts` re-exports it (`export { makeTakeaway } from "../geo-takeaway";`) so nothing else in `lib/desk/` needs an import-path change beyond this one line.

- [ ] **Step 2: Move its tests to `lib/geo-takeaway.test.ts`**
  Cut the four existing `makeTakeaway` tests (+ the new plural test from Task 1) out of `lib/desk/mappers.test.ts`, paste into the new test file, update the import path. Run both files — expect PASS, no behavior change.

- [ ] **Step 3: Write the failing test for the report-page takeaway**
  Add to a new `app/r/[slug]/page.test.ts` (or extend an existing report-page test file if one exists — check `app/r/` for `*.test.ts` first per RULE 0.5):
  ```ts
  test("report takeaway: leads with the first real metric, own asOf, no scope clause", () => {
    const t = makeTakeaway(
      { label: "Median list price", display: "$345,000", asOf: "07/10/2026", sourceLabel: "SWFL Data Gulf" },
    );
    assert.equal(t, "Median list price is $345,000 as of 07/10/2026, per SWFL Data Gulf.");
  });
  ```
  (Report pages don't get a blanket "Southwest Florida" scope clause the way desk KPIs do — a report's `display.scope` line already states its own scope in the header immediately above; a redundant "in Southwest Florida" in the takeaway would be noise, not signal. Pass no `scope` arg.)

- [ ] **Step 4: Add the lead-metric filter + takeaway render to `app/r/[slug]/page.tsx`**
  Near the existing `summaryMetrics` computation (~line 155), add:
  ```ts
  const isRealMetric = (m: { label: string }) =>
    slug !== "cre-swfl" || (!parseMBCityLabel(m.label) && !isMBRollup(m.label) && !/current-events signals/i.test(m.label));
  const leadMetric = display.metrics.find(isRealMetric);
  const reportTakeaway = leadMetric
    ? makeTakeaway({
        label: leadMetric.label,
        display: leadMetric.value,
        asOf: asOfFromIso(leadMetric.fetchedAt) ?? undefined,
        sourceLabel: leadMetric.sourceLabel,
      })
    : "";
  ```
  Import `makeTakeaway` from `@/lib/geo-takeaway`.

  Render immediately after the conclusion paragraph:
  ```tsx
  {reportTakeaway ? (
    <p className="mt-2 text-sm text-gray-500">{reportTakeaway}</p>
  ) : null}
  ```

- [ ] **Step 5: Verify SSR presence + build**
  Run: `bun test lib/geo-takeaway.test.ts app/r/\[slug\]/page.test.ts 2>/dev/null; bunx next build`
  Then: `bunx next start & sleep 4 && curl -s localhost:3000/r/master | grep -c 'per SWFL Data Gulf\|per ' ; kill %1`
  Expect count ≥ 1. Also spot-check `curl -s localhost:3000/r/cre-swfl | grep 'per '` — confirm the lead metric is a real corridor/summary figure, not an MB-rollup or a current-events-signal row.

- [ ] **Step 6: Commit**
  ```bash
  git add lib/geo-takeaway.ts lib/geo-takeaway.test.ts lib/desk/mappers.ts lib/desk/mappers.test.ts lib/desk/loaders.ts "app/r/[slug]/page.tsx"
  git commit -m "feat(desk-geo): number-first GEO takeaway on /r/* report pages (Spec B item 2)"
  ```
  Closes: `r_star_report_takeaway`.

---

### Task 3: Robots carve-out — OPERATOR-GATED, ready to lift as-is

This is **Task 6 of the original plan, unchanged** (`docs/superpowers/plans/2026-07-11-desk-discovery-flywheel-plan.md`, lines 563-613) — verified against the current `app/robots.ts` and still accurate: `AI_ANSWER_ENGINES` still lists `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` among 8 answer-engine tokens, all still fully blocked via the blanket `BLOCKED` array. Nothing to re-derive.

- [ ] **Step 1 (approval gate):** Present the moat-vs-reach trade-off (verbatim below) and get an explicit operator yes/no before touching the file.
  > Today `app/robots.ts` blocks the answer-engine INDEX bots (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`) AND the TRAINING bots everywhere. Consequence: Perplexity/ChatGPT Search never surface `/desk` or `/r/*` on their own; Google AI Overviews and human URL-paste still reach us either way.
  > **Proposed carve-out:** allow the 3 INDEX bots on `/desk` + `/r/` only, keep TRAINING bots blocked everywhere. Public data becomes citable in answer engines without feeding training corpora.
  > Caveat: robots.txt is advisory — the real enforcement is the WAF, not this file.

- [ ] **Step 2 (only on yes):** Apply the exact diff from the original plan's Task 6 Step 2 (splits `SEARCH_INDEX` out of `BLOCKED`, adds a path-scoped `allow: ["/desk", "/r/"]` rule for those 3 tokens, keeps everything else fully blocked). Update the file's header comment with the carve-out + decision date.

- [ ] **Step 3:** `bunx next build && bunx next start & sleep 4 && curl -s localhost:3000/robots.txt ; kill %1` — confirm `OAI-SearchBot`/`Claude-SearchBot`/`PerplexityBot` show `Allow: /desk` + `Allow: /r/` with `Disallow: /`; `GPTBot`/`ClaudeBot`/`CCBot` still show `Disallow: /`.

- [ ] **Step 4:** Commit — `git commit -m "feat(desk-geo): allowlist answer-engine index bots for /desk + /r/* (operator-approved carve-out)"`. Closes `desk_robots_answer_engine_carveout`.

If the operator says no: close the check with a note ("declined — moat prioritized over reach") rather than leaving it open indefinitely.

---

### Task 4: Deploy-time live-verify — closes the build

Turns the original plan's live-verify bullet list (lines 617-627) into an executable runbook against the deployed site. This is prod evidence, not local `next build`/`next start` — run it after the Task 1/2/3 commits above (whichever have shipped) are live on `https://www.swfldatagulf.com`.

- [ ] **Step 1: Dataset JSON-LD validates (Google Rich Results + Schema.org)**
  - Paste `https://www.swfldatagulf.com/desk` into the Google Rich Results Test (`https://search.google.com/test/rich-results`) — confirm a `Dataset` item is detected with no errors, and that `temporalCoverage`, `spatialCoverage` (Lee + Collier named), `creator`, `isAccessibleForFree` are all present in the parsed result.
  - Repeat for `https://www.swfldatagulf.com/r/master`.
  - Cross-check both URLs against `https://validator.schema.org/` for stricter structural validation (Rich Results only checks Google-relevant properties).

- [ ] **Step 2: Numbers + takeaways in raw server HTML (not post-hydration)**
  ```bash
  curl -s https://www.swfldatagulf.com/desk | grep -o '\$[0-9,]*' | head -5
  curl -s https://www.swfldatagulf.com/desk | grep -c 'per SWFL Data Gulf'
  curl -s https://www.swfldatagulf.com/r/master | grep -c 'As of\|per '
  ```
  Expect real dollar figures and a takeaway-sentence count ≥ 1 on both. If either is 0, this is a regression — stop and report, don't paper over.

- [ ] **Step 3: Embed widget — frame headers + attribution**
  ```bash
  curl -sI https://www.swfldatagulf.com/embed/desk/pulse | grep -i 'x-frame-options\|content-security-policy'
  curl -s https://www.swfldatagulf.com/embed/desk/pulse | grep -c 'Source: SWFL Data Gulf'
  ```
  Expect `X-Frame-Options: ALLOWALL` and/or `Content-Security-Policy: frame-ancestors *`, plus attribution count = 1. Then paste the iframe snippet into a scratch local HTML file and confirm it actually renders framed (headers alone don't prove the visual embed works).

- [ ] **Step 4: Sitemap + llms.txt**
  ```bash
  curl -s https://www.swfldatagulf.com/sitemap.xml | grep -c '/desk'
  curl -s https://www.swfldatagulf.com/llms.txt | head -3
  ```
  Expect count = 1 and the `# SWFL Data Gulf` header.

- [ ] **Step 5: Robots carve-out (only if Task 3 shipped)**
  ```bash
  curl -s https://www.swfldatagulf.com/robots.txt
  ```
  Confirm search-index bots `Allow: /desk`/`Allow: /r/`, training bots still `Disallow: /`. If Task 3 hasn't shipped yet, skip this step — it doesn't block closing the check (Task 3 is its own standalone check).

- [ ] **Step 6: Close the check**
  ```bash
  node scripts/check.mjs close desk_discovery_flywheel_live_verify
  ```
  Note in the close message which of Steps 1–5 passed vs. any that surfaced a regression needing a follow-up check.

- [ ] **Step 7: SESSION_LOG entry**
  One line noting what was verified live and the outcome — RULE 0, before any push that touches this.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `lib/desk/mappers.ts`, `lib/desk/mappers.test.ts`, `lib/desk/loaders.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
