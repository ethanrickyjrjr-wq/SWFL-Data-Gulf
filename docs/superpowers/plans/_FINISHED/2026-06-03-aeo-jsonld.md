# AEO JSON-LD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: schema, architecture

**Goal:** Add `Dataset` + `FAQPage` JSON-LD to brain report pages and `Place` + `FAQPage` to corridor drill-down pages so AI engines (Claude, Perplexity, ChatGPT) cite swfldatagulf.com organically on SWFL real estate and economic queries.

**Architecture:** A single pure-function helper `lib/jsonld.ts` exports `brainJsonLd` and `corridorJsonLd`. Each function takes already-parsed display data and returns an array of Schema.org JSON-LD objects. Both page components inject the result as a `<script type="application/ld+json">` tag in their JSX — no new runtime dependencies.

**Tech Stack:** TypeScript, Next.js 15 App Router (RSC), Schema.org (`Dataset`, `FAQPage`, `Place`), `bun test`

---

## File Map

| Action | Path                                 | Responsibility                                  |
| ------ | ------------------------------------ | ----------------------------------------------- |
| Create | `lib/jsonld.ts`                      | Pure functions: `brainJsonLd`, `corridorJsonLd` |
| Create | `lib/jsonld.test.ts`                 | Unit tests for both functions                   |
| Modify | `app/r/[slug]/page.tsx`              | Inject `brainJsonLd` script tag                 |
| Modify | `app/r/cre-swfl/[corridor]/page.tsx` | Inject `corridorJsonLd` script tag              |

---

## Task 1: Create `lib/jsonld.ts` — `brainJsonLd`

**Files:**

- Create: `lib/jsonld.ts`
- 🔴 Create: `lib/jsonld.test.ts`

- [ ] **Step 1: Write the failing tests for `brainJsonLd`**

Create `lib/jsonld.test.ts`:

```typescript
import { test } from "bun:test";
import assert from "node:assert/strict";
import { brainJsonLd } from "./jsonld.ts";
import type { DisplayBrain } from "../refinery/render/speaker.mts";

const minBrain: DisplayBrain = {
  title: "SWFL Environment",
  scope: "Lee and Collier County FL flood and environmental risk.",
  freshnessToken: "SWFL-7421-v5-20260601",
  refinedAt: "2026-06-01",
  direction: "bullish",
  magnitudePct: 72,
  confidencePct: 85,
  conclusion: "Flood risk remains elevated in coastal ZIPs.",
  metrics: [
    {
      label: "AAL per policy",
      value: "$1,234",
      direction: "bearish",
      sourceLabel: "FEMA NFIP",
      sourceUrl: "https://www.fema.gov/nfip",
    },
  ],
  summaryCaveats: [],
  detailCaveats: [],
};

test("brainJsonLd: returns two blocks", () => {
  const ld = brainJsonLd(minBrain, "env-swfl");
  assert.equal(ld.length, 2);
});

test("brainJsonLd: first block is Dataset", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  assert.equal((dataset as Record<string, unknown>)["@type"], "Dataset");
});

test("brainJsonLd: Dataset url contains slug", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  assert.ok(
    ((dataset as Record<string, unknown>).url as string).includes("env-swfl"),
  );
});

test("brainJsonLd: Dataset variableMeasured maps metrics", () => {
  const [dataset] = brainJsonLd(minBrain, "env-swfl");
  const vm = (dataset as Record<string, unknown>).variableMeasured as unknown[];
  assert.equal(vm.length, 1);
  assert.equal((vm[0] as Record<string, unknown>).name, "AAL per policy");
});

test("brainJsonLd: second block is FAQPage", () => {
  const [, faq] = brainJsonLd(minBrain, "env-swfl");
  assert.equal((faq as Record<string, unknown>)["@type"], "FAQPage");
});

test("brainJsonLd: FAQPage first Q is conclusion-based", () => {
  const [, faq] = brainJsonLd(minBrain, "env-swfl");
  const first = (
    (faq as Record<string, unknown>).mainEntity as Record<string, unknown>[]
  )[0];
  assert.ok((first.name as string).toLowerCase().includes("outlook"));
  assert.equal(
    (first.acceptedAnswer as Record<string, unknown>).text,
    minBrain.conclusion,
  );
});

test("brainJsonLd: FAQPage capped at 8 entries", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => ({
    label: `Metric ${i}`,
    value: `${i}`,
    direction: "neutral",
    sourceLabel: "src",
    sourceUrl: "",
  }));
  const [, faq] = brainJsonLd(
    { ...minBrain, metrics: manyMetrics },
    "env-swfl",
  );
  assert.ok(
    ((faq as Record<string, unknown>).mainEntity as unknown[]).length <= 8,
  );
});

test("brainJsonLd: empty conclusion drops the intro Q, no empty acceptedAnswer", () => {
  const manyMetrics = Array.from({ length: 20 }, (_, i) => ({
    label: `Metric ${i}`,
    value: `${i}`,
    direction: "neutral",
    sourceLabel: "src",
    sourceUrl: "",
  }));
  const [, faq] = brainJsonLd(
    { ...minBrain, conclusion: "", metrics: manyMetrics },
    "env-swfl",
  );
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  // No question's answer is empty (the invalid-FAQPage case).
  for (const e of entries) {
    assert.notEqual((e.acceptedAnswer as Record<string, unknown>).text, "");
  }
  // The intro "outlook" Q is gone; metrics fill all 8 slots.
  assert.equal(entries.length, 8);
  assert.ok(!(entries[0].name as string).toLowerCase().includes("outlook"));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun test lib/jsonld.test.ts
```

Expected: `Cannot find module './jsonld.ts'` or similar. Confirms tests are wired up.

- [ ] **Step 3: Create `lib/jsonld.ts` with `brainJsonLd`**

```typescript
import type { DisplayBrain } from "../refinery/render/speaker.mts";
import type { CorridorNormalized } from "../refinery/sources/cre-source.mts";

const SITE = "https://www.swfldatagulf.com";
const PUBLISHER = {
  "@type": "Organization",
  name: "SWFL Data Gulf",
  url: SITE,
};
const SPATIAL = {
  "@type": "Place",
  name: "Southwest Florida",
  containedInPlace: {
    "@type": "State",
    name: "Florida",
    containedInPlace: { "@type": "Country", name: "United States" },
  },
};

function question(name: string, text: string) {
  return {
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", text },
  };
}

export function brainJsonLd(display: DisplayBrain, slug: string): object[] {
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: display.title,
    description: display.scope,
    url: `${SITE}/r/${slug}`,
    dateModified: display.refinedAt,
    publisher: PUBLISHER,
    spatialCoverage: SPATIAL,
    variableMeasured: display.metrics.map((m) => ({
      "@type": "PropertyValue",
      name: m.label,
      value: m.value,
      ...(m.sourceUrl ? { url: m.sourceUrl } : {}),
    })),
  };

  // `conclusion` is typed `string` but `sanitizeProse` can return "" for a
  // brand-new/empty brain. An empty acceptedAnswer.text invalidates the whole
  // FAQPage — so skip the intro Q when falsy and let metrics fill all 8 slots.
  const introQ = display.conclusion
    ? [
        question(
          `What is the ${display.title} outlook for Southwest Florida?`,
          display.conclusion,
        ),
      ]
    : [];
  const faqEntries = [
    ...introQ,
    ...display.metrics
      .slice(0, introQ.length ? 7 : 8)
      .map((m) =>
        question(
          `What is ${m.label} in Southwest Florida?`,
          `${m.value} (${m.direction}). Source: ${m.sourceLabel}. As of ${display.freshnessToken}.`,
        ),
      ),
  ].slice(0, 8);

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };

  return [dataset, faq];
}

export function corridorJsonLd(
  corridor: CorridorNormalized,
  freshnessToken: string,
  displayName: string,
): object[] {
  // `corridor.name` is the DB join key — NEVER user-facing. The page already
  // computes the safe label via `displayNameFor`; require it as an arg so this
  // helper can never leak the raw slug into public JSON-LD.
  const displayN = displayName;

  const place = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: displayN,
    ...(corridor.character ? { description: corridor.character } : {}),
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: `${corridor.county} County, Florida`,
      containedInPlace: SPATIAL,
    },
  };

  const faqEntries: object[] = [];

  if (corridor.character) {
    faqEntries.push(
      question(
        `What is the commercial real estate market like on ${displayN}?`,
        corridor.character,
      ),
    );
  }

  if (corridor.cap_rate_pct !== null) {
    faqEntries.push(
      question(
        `What is the cap rate on ${displayN} in Southwest Florida?`,
        `${corridor.cap_rate_pct}%${corridor.cap_rate_direction ? ` (${corridor.cap_rate_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.vacancy_rate_pct !== null) {
    faqEntries.push(
      question(
        `What is the vacancy rate on ${displayN} in Southwest Florida?`,
        `${corridor.vacancy_rate_pct}%${corridor.vacancy_rate_direction ? ` (${corridor.vacancy_rate_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.asking_rent_psf !== null) {
    faqEntries.push(
      question(
        `What is the asking rent per square foot on ${displayN}?`,
        `$${corridor.asking_rent_psf} PSF (NNN)${corridor.asking_rent_psf_direction ? ` (${corridor.asking_rent_psf_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.absorption_sqft !== null) {
    faqEntries.push(
      question(
        `What is the net absorption on ${displayN}?`,
        `${corridor.absorption_sqft.toLocaleString()} sqft${corridor.absorption_sqft_direction ? ` (${corridor.absorption_sqft_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  // A FAQPage with zero questions is invalid Schema.org — most corridors are
  // pre-sourcing (no character, all metrics null), so emit Place-only then.
  if (faqEntries.length === 0) {
    return [place];
  }

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };

  return [place, faq];
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
bun test lib/jsonld.test.ts
```

Expected output: all 8 brain tests pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/jsonld.ts lib/jsonld.test.ts
git commit -m "feat(aeo): add brainJsonLd + corridorJsonLd helpers"
```

---

## Task 2: Add corridor tests

**Files:**

- 🔴 Modify: `lib/jsonld.test.ts`

- [ ] **Step 1: Add corridor tests to `lib/jsonld.test.ts`**

Append to `lib/jsonld.test.ts`:

```typescript
import { corridorJsonLd } from "./jsonld.ts";
import type { CorridorNormalized } from "../refinery/sources/cre-source.mts";

const minCorridor: CorridorNormalized = {
  kind: "corridor",
  name: "airport-pulling",
  display_name: "Airport-Pulling",
  city: "Naples",
  county: "Collier",
  corridor_type: "strip",
  seasonal_index: 0.8,
  character: "Mixed retail corridor showing signs of repositioning.",
  evolution_direction: "stabilizing",
  tenant_mix: "Service, QSR, medical",
  flags: [],
  source_url: null,
  cap_rate_source_url: null,
  vacancy_rate_source_url: null,
  absorption_sqft_source_url: null,
  asking_rent_psf_source_url: null,
  cap_rate_pct: 6.5,
  cap_rate_direction: "neutral",
  vacancy_rate_pct: 8.2,
  vacancy_rate_direction: null,
  absorption_sqft: null,
  absorption_sqft_direction: null,
  asking_rent_psf: 22.5,
  asking_rent_psf_direction: "up",
  metrics_period: "2026-Q1",
  metrics_verified_date: "2026-06-01",
  character_broker_narrative: null,
  character_facts: null,
  character_speculative: null,
};

const TOKEN = "SWFL-7421-v5-20260601";

test("corridorJsonLd: returns two blocks", () => {
  const ld = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  assert.equal(ld.length, 2);
});

test("corridorJsonLd: first block is Place", () => {
  const [place] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  assert.equal((place as Record<string, unknown>)["@type"], "Place");
});

test("corridorJsonLd: Place name is the passed display name, never raw slug", () => {
  // Even if display_name is unset, the caller-supplied label must win.
  const [place] = corridorJsonLd(
    { ...minCorridor, display_name: undefined },
    TOKEN,
    "Airport-Pulling",
  );
  assert.equal((place as Record<string, unknown>).name, "Airport-Pulling");
});

test("corridorJsonLd: FAQPage includes cap rate question", () => {
  const [, faq] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  const capRateQ = entries.find((e) =>
    (e.name as string).toLowerCase().includes("cap rate"),
  );
  assert.ok(capRateQ, "expected a cap rate FAQ entry");
  assert.ok(
    (
      (capRateQ.acceptedAnswer as Record<string, unknown>).text as string
    ).includes("6.5%"),
  );
});

test("corridorJsonLd: null metrics are omitted from FAQ", () => {
  const [, faq] = corridorJsonLd(minCorridor, TOKEN, "Airport-Pulling");
  const entries = (faq as Record<string, unknown>).mainEntity as Record<
    string,
    unknown
  >[];
  const absorptionQ = entries.find((e) =>
    (e.name as string).toLowerCase().includes("absorption"),
  );
  assert.equal(
    absorptionQ,
    undefined,
    "absorption_sqft is null — should not appear",
  );
});

test("corridorJsonLd: pre-sourcing corridor emits Place only, no empty FAQPage", () => {
  const bare: CorridorNormalized = {
    ...minCorridor,
    character: null,
    cap_rate_pct: null,
    vacancy_rate_pct: null,
    absorption_sqft: null,
    asking_rent_psf: null,
  };
  const ld = corridorJsonLd(bare, TOKEN, "Airport-Pulling");
  assert.equal(ld.length, 1);
  assert.equal((ld[0] as Record<string, unknown>)["@type"], "Place");
});
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
bun test lib/jsonld.test.ts
```

Expected: the 5 new corridor tests fail because `CorridorNormalized` may have fields not yet in the fixture. If you get a TypeScript error about missing fields (e.g. `character_facts`, `character_speculative`), add them as `null` to the `minCorridor` fixture.

- [ ] **Step 3: Fix fixture if needed**

If the compile fails due to missing `CorridorNormalized` fields, run:

```bash
grep -n "^\s\+\w\+:" refinery/sources/cre-source.mts | head -60
```

Add any missing fields as `null` to the `minCorridor` fixture in the test. The fixture only needs to satisfy TypeScript — the function only reads the fields listed in `lib/jsonld.ts`.

- [ ] **Step 4: Run tests — all 13 should pass**

```bash
bun test lib/jsonld.test.ts
```

Expected: 13 passing tests (8 brain + 5 corridor).

- [ ] **Step 5: Commit**

```bash
git add lib/jsonld.test.ts
git commit -m "test(aeo): add corridor JSON-LD tests"
```

---

## Task 3: Inject into `/r/[slug]/page.tsx`

**Files:**

- Modify: `app/r/[slug]/page.tsx`

- [ ] **Step 1: Add the import and inject the script tag**

At the top of `app/r/[slug]/page.tsx`, add the import after existing imports:

```typescript
import { brainJsonLd } from "../../../lib/jsonld.ts";
```

In the `ReportPage` component, find the closing `</main>` tag and add the script tag just before it. The component already has `display` in scope. Add a variable for the slug too — `slug` is already destructured from params. The full addition:

```typescript
  const ld = brainJsonLd(display, slug);

  return (
    <div className="min-h-dvh bg-white font-sans text-zinc-900">
      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        {/* ... existing JSX unchanged ... */}
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
    </div>
  );
```

Place `const ld = brainJsonLd(display, slug);` immediately after `display` is constructed (after the `toDisplayBrain` call, before the `return`).

- [ ] **Step 2: TypeScript check**

```bash
bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "jsonld\|r/\[slug\]" | head -20
```

Expected: no errors on `jsonld` or `[slug]/page`. (Ignore pre-existing baseline errors — see `refinery:typecheck` note in CLAUDE.md.)

- [ ] **Step 3: Commit**

```bash
git add app/r/\[slug\]/page.tsx
git commit -m "feat(aeo): inject Dataset+FAQPage JSON-LD on brain report pages"
```

---

## Task 4: Inject into `/r/cre-swfl/[corridor]/page.tsx`

**Files:**

- Modify: `app/r/cre-swfl/[corridor]/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `app/r/cre-swfl/[corridor]/page.tsx`, add after existing imports:

```typescript
import { corridorJsonLd } from "../../../../lib/jsonld.ts";
```

- [ ] **Step 2: Inject the script tag**

In `CorridorPage`, `c` (the `CorridorNormalized`), `freshnessToken`, and the safe label `displayN` are already in scope (`const { corridor: c, freshnessToken } = d;` at line 88, and `const displayN = c.display_name ?? displayNameFor(c.name);` at line 89). Pass `displayN` — never let the helper derive the name itself, or the raw join key leaks. Add the variable and script tag:

```typescript
  const ld = corridorJsonLd(c, freshnessToken, displayN);

  return (
    <div className="min-h-dvh bg-white font-sans text-zinc-900">
      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-8 sm:py-16">
        {/* ... existing JSX unchanged ... */}
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
    </div>
  );
```

Place `const ld = corridorJsonLd(c, freshnessToken, displayN);` immediately before the `return`.

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "jsonld\|corridor\]" | head -20
```

Expected: no errors on `jsonld` or `[corridor]/page`.

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

Expected: all existing tests continue to pass. The new `lib/jsonld.test.ts` passes too.

- [ ] **Step 5: Commit and push**

```bash
git add app/r/cre-swfl/\[corridor\]/page.tsx
# Update SESSION_LOG.md first (RULE 0)
node scripts/safe-push.mjs
```

---

## Self-Review

**Spec coverage:**

- ✅ `Dataset` + `FAQPage` on brain pages → Tasks 1 + 3
- ✅ `Place` + `FAQPage` on corridor pages → Tasks 1 + 4
- ✅ Single `lib/jsonld.ts` helper, no new dependencies → Task 1
- ✅ Tests for both functions → Tasks 1 + 2
- ✅ Cap at 8 FAQ entries (brain) → Task 1 implementation
- ✅ Null metrics omitted from corridor FAQ → Task 1 implementation

**Type consistency:**

- `brainJsonLd` defined in Task 1, imported in Task 3 ✅
- `corridorJsonLd` defined in Task 1, imported in Task 4 ✅
- `DisplayBrain` and `CorridorNormalized` types used consistently ✅

**No placeholders:** All steps contain complete code. ✅

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `lib/jsonld.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
