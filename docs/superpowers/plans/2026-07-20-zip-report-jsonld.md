# ZIP Report Dataset+FAQPage JSON-LD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: schema, architecture

**Goal:** `/r/zip-report/[zip]` emits source-cited Dataset+FAQPage JSON-LD built from the page's own ranked signals — zero new fetches, zero invented values.

**Architecture:** One new pure helper `zipReportJsonLd()` in `lib/jsonld.ts` beside the four existing helpers, with a decoupled input interface (the page imports CSS so only the helper is bun-testable). One `<script type="application/ld+json">` injection in the page. One 3-line ISO-date export added to the existing token parser in `lib/project/as-of.ts`.

**Tech Stack:** TypeScript, Next.js App Router (server component), bun:test + node:assert/strict.

**Spec:** `docs/superpowers/specs/2026-07-20-zip-report-jsonld-design.md` · **Check:** `zip_report_jsonld_live_verify`

## Global Constraints

- NO raw freshness token (`SWFL-…-YYYYMMDD`) anywhere in emitted markup — prose dates are the preformatted MM/DD/YYYY `asOf`; `dateModified` is ISO `YYYY-MM-DD`.
- Signal `display` values are restated VERBATIM — never recomputed, reformatted, or parsed.
- FAQ entries only for signals carrying a real `source` (label+url); zero eligible → Dataset-only array (a 0-question FAQPage is invalid schema.org).
- Verify builds with `bunx next build` — never `npx tsc`.
- `git add` explicit paths only; commit freely, NEVER push (operator approval is per-push, given in-conversation only).
- Match existing file style: `lib/jsonld.ts` helper conventions, `lib/jsonld.test.ts` bun:test + `node:assert/strict` pattern.

---

### Task 1: `asOfIsoFromToken` in the as-of root

**Files:**
- Modify: `lib/project/as-of.ts` (insert after `asOfFromToken`, ~line 35)
- Test: `lib/project/as-of.test.ts` (append)

**Interfaces:**
- Consumes: internal `parseTokenDate()` already in the file (the ONE token parser).
- Produces: `asOfIsoFromToken(token: string | null | undefined): string | null` — `"SWFL-7421-v10-20260719"` → `"2026-07-19"`. Task 3 imports this.

- [ ] **Step 1: Write the failing tests** — append to `lib/project/as-of.test.ts` (match the file's existing bun:test import style):

```ts
test("asOfIsoFromToken: token trailing date → ISO YYYY-MM-DD", () => {
  assert.equal(asOfIsoFromToken("SWFL-7421-v10-20260719"), "2026-07-19");
});

test("asOfIsoFromToken: null on missing/unparseable/impossible date", () => {
  assert.equal(asOfIsoFromToken(null), null);
  assert.equal(asOfIsoFromToken("no-date-here"), null);
  assert.equal(asOfIsoFromToken("SWFL-7421-v2-20260231"), null); // Feb 31
});
```

Add `asOfIsoFromToken` to the file's existing import from `./as-of`.

- [ ] **Step 2: Run to verify failure** — `bun test lib/project/as-of.test.ts` — Expected: FAIL (`asOfIsoFromToken` not exported).

- [ ] **Step 3: Implement** — in `lib/project/as-of.ts`, directly below `asOfFromToken`:

```ts
/** ISO `YYYY-MM-DD` of a freshness token's trailing date, or null — the machine-field
 *  twin of `asOfFromToken` (Dataset.dateModified wants ISO; prose wants MM/DD/YYYY).
 *  Same ONE parser; never hand-slice the token elsewhere. */
export function asOfIsoFromToken(token: string | null | undefined): string | null {
  const p = parseTokenDate(token);
  return p ? `${p.y}-${p.mo}-${p.d}` : null;
}
```

- [ ] **Step 4: Run to verify pass** — `bun test lib/project/as-of.test.ts` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/project/as-of.ts lib/project/as-of.test.ts
git commit -m "feat(as-of): asOfIsoFromToken — ISO twin of asOfFromToken for machine date fields"
```

---

### Task 2: `zipReportJsonLd()` helper

**Files:**
- Modify: `lib/jsonld.ts` (append after `communityJsonLd`)
- Test: `lib/jsonld.test.ts` (append)

**Interfaces:**
- Consumes: module constants already in `lib/jsonld.ts` — `SITE`, `PUBLISHER`, `CREATOR`, `LICENSE_URL`, `SPATIAL`, `question()`.
- Produces (Task 3 imports these):

```ts
export interface ZipReportJsonLdSignal {
  label: string;
  display: string;            // preformatted verbatim value, e.g. "$485K"
  sub?: string;
  source?: { label: string; url: string };
}
export interface ZipReportJsonLdInput {
  zip: string;
  place: string | null;
  county: string | null;
  signals: ZipReportJsonLdSignal[];
  asOf: string | null;        // MM/DD/YYYY
  asOfIso: string | null;     // YYYY-MM-DD
}
export function zipReportJsonLd(input: ZipReportJsonLdInput): object[];
```

- [ ] **Step 1: Write the failing tests** — append to `lib/jsonld.test.ts`:

```ts
import { zipReportJsonLd, type ZipReportJsonLdSignal } from "./jsonld.ts";

function zipSig(i: number, withSource = true): ZipReportJsonLdSignal {
  return {
    label: `Signal ${i}`,
    display: `$${i}K`,
    sub: `sub ${i}`,
    ...(withSource ? { source: { label: `Src ${i}`, url: `https://example.com/${i}` } } : {}),
  };
}

const zipBase = {
  zip: "33914",
  place: "Cape Coral",
  county: "Lee",
  signals: [zipSig(1), zipSig(2)],
  asOf: "07/19/2026",
  asOfIso: "2026-07-19",
};

test("zipReportJsonLd: Dataset first — name, url, dateModified", () => {
  const [dataset] = zipReportJsonLd(zipBase);
  const d = dataset as Record<string, unknown>;
  assert.equal(d["@type"], "Dataset");
  assert.equal(d.name, "Cape Coral 33914 Market Report — SWFL Data Gulf");
  assert.ok((d.url as string).endsWith("/r/zip-report/33914"));
  assert.equal(d.dateModified, "2026-07-19");
});

test("zipReportJsonLd: ZIP-scoped spatialCoverage chain", () => {
  const [dataset] = zipReportJsonLd(zipBase);
  const sc = (dataset as Record<string, unknown>).spatialCoverage as Record<string, unknown>;
  assert.equal(sc.name, "Cape Coral, FL 33914");
  const county = sc.containedInPlace as Record<string, unknown>;
  assert.equal(county.name, "Lee County, Florida");
});

test("zipReportJsonLd: place-less fallback naming", () => {
  const [dataset] = zipReportJsonLd({ ...zipBase, place: null });
  const d = dataset as Record<string, unknown>;
  assert.equal(d.name, "ZIP 33914 Market Report — SWFL Data Gulf");
  assert.equal((d.spatialCoverage as Record<string, unknown>).name, "ZIP 33914, Florida");
});

test("zipReportJsonLd: variableMeasured restates display verbatim; url only with source", () => {
  const [dataset] = zipReportJsonLd({ ...zipBase, signals: [zipSig(1), zipSig(2, false)] });
  const vm = (dataset as Record<string, unknown>).variableMeasured as Record<string, unknown>[];
  assert.equal(vm.length, 2);
  assert.equal(vm[0].value, "$1K");
  assert.equal(vm[0].url, "https://example.com/1");
  assert.equal(vm[1].value, "$2K");
  assert.ok(!("url" in vm[1]));
});

test("zipReportJsonLd: FAQ excludes uncited signals and caps at 8", () => {
  const signals = Array.from({ length: 10 }, (_, i) => zipSig(i + 1)).concat([zipSig(99, false)]);
  const [, faq] = zipReportJsonLd({ ...zipBase, signals });
  const entries = (faq as Record<string, unknown>).mainEntity as unknown[];
  assert.equal(entries.length, 8);
});

test("zipReportJsonLd: FAQ answer carries value, sub, source, as-of", () => {
  const [, faq] = zipReportJsonLd(zipBase);
  const first = ((faq as Record<string, unknown>).mainEntity as Record<string, unknown>[])[0];
  const answer = (first.acceptedAnswer as Record<string, unknown>).text as string;
  assert.ok(answer.includes("$1K — sub 1"));
  assert.ok(answer.includes("Source: Src 1 (https://example.com/1)"));
  assert.ok(answer.includes("As of 07/19/2026"));
});

test("zipReportJsonLd: zero cited signals → Dataset only", () => {
  const ld = zipReportJsonLd({ ...zipBase, signals: [zipSig(1, false)] });
  assert.equal(ld.length, 1);
});

test("zipReportJsonLd: no raw freshness token pattern in output", () => {
  const serialized = JSON.stringify(zipReportJsonLd(zipBase));
  assert.ok(!/SWFL-\d+-v\d+-\d{8}/.test(serialized));
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/jsonld.test.ts` — Expected: FAIL (`zipReportJsonLd` not exported); existing tests still PASS.

- [ ] **Step 3: Implement** — append to `lib/jsonld.ts`:

```ts
/** Minimal decoupled shapes for the ZIP report page (same pattern as
 *  `CommunityJsonLdInput` — the page imports CSS so only this helper is
 *  bun-testable). `display` restates a served number VERBATIM. */
export interface ZipReportJsonLdSignal {
  label: string;
  display: string;
  sub?: string;
  source?: { label: string; url: string };
}

export interface ZipReportJsonLdInput {
  zip: string;
  place: string | null;
  county: string | null;
  signals: ZipReportJsonLdSignal[];
  /** MM/DD/YYYY prose date — NEVER the raw freshness token. */
  asOf: string | null;
  /** ISO YYYY-MM-DD for Dataset.dateModified (machine field). */
  asOfIso: string | null;
}

/**
 * Dataset + FAQPage for /r/zip-report/[zip]. FAQ entries exist ONLY for signals
 * carrying a real source (no uncited answers); zero eligible → Dataset alone
 * (a 0-question FAQPage is invalid schema.org — same guard as corridor/community).
 */
export function zipReportJsonLd(input: ZipReportJsonLdInput): object[] {
  const { zip, place, county, signals, asOf, asOfIso } = input;
  const where = place ? `${place}, ${zip}` : `ZIP ${zip}`;
  const countyArea = county
    ? {
        "@type": "AdministrativeArea",
        name: `${county} County, Florida`,
        containedInPlace: SPATIAL,
      }
    : SPATIAL;

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: place
      ? `${place} ${zip} Market Report — SWFL Data Gulf`
      : `ZIP ${zip} Market Report — SWFL Data Gulf`,
    description: `Home values, flood risk, and building permits for ${where}${
      county ? ` in ${county} County, FL` : ""
    } — cited to the source.`,
    url: `${SITE}/r/zip-report/${zip}`,
    ...(asOfIso ? { dateModified: asOfIso } : {}),
    isAccessibleForFree: true,
    publisher: PUBLISHER,
    creator: CREATOR,
    ...(LICENSE_URL ? { license: LICENSE_URL } : {}),
    spatialCoverage: {
      "@type": "Place",
      name: place ? `${place}, FL ${zip}` : `ZIP ${zip}, Florida`,
      containedInPlace: countyArea,
    },
    variableMeasured: signals.map((s) => ({
      "@type": "PropertyValue",
      name: s.label,
      value: s.display,
      ...(s.source?.url ? { url: s.source.url } : {}),
    })),
  };

  const faqEntries = signals
    .filter((s) => s.source && s.source.url)
    .slice(0, 8)
    .map((s) =>
      question(
        `What is ${s.label} in ${place ?? `ZIP ${zip}`} (${zip})?`,
        `${s.display}${s.sub ? ` — ${s.sub}` : ""}. Source: ${s.source!.label} (${s.source!.url}).${
          asOf ? ` As of ${asOf}.` : ""
        }`,
      ),
    );

  if (faqEntries.length === 0) return [dataset];

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };
  return [dataset, faq];
}
```

- [ ] **Step 4: Run to verify pass** — `bun test lib/jsonld.test.ts` — Expected: all PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add lib/jsonld.ts lib/jsonld.test.ts
git commit -m "feat(zip-report-jsonld): zipReportJsonLd helper — Dataset+FAQPage from ranked signals, no raw token"
```

---

### Task 3: Page injection + build verify

**Files:**
- Modify: `app/r/zip-report/[zip]/page.tsx` (import block ~line 27; body after `const asOf = …` ~line 211; JSX next to `<ReportFooter …/>` ~line 533)

**Interfaces:**
- Consumes: `zipReportJsonLd` (Task 2), `asOfIsoFromToken` (Task 1), page locals `ranked`, `primaryPlace`, `res.county_names`, `freshnessToken`, `asOf` — all already in scope in the page body.
- Produces: the rendered `<script type="application/ld+json">` tag (no exports).

- [ ] **Step 1: Extend imports** — in `app/r/zip-report/[zip]/page.tsx`, change the existing as-of import (line 27) and add the helper import beside it:

```tsx
import { asOfFromToken, asOfIsoFromToken } from "../../../../lib/project/as-of";
import { zipReportJsonLd } from "../../../../lib/jsonld";
```

- [ ] **Step 2: Build the blocks** — directly below `const asOf = asOfFromToken(freshnessToken);` (~line 211):

```tsx
// ── Structured data — Dataset+FAQPage from the SAME ranked signals the page
// serves (verbatim displays, per-signal sources). Formatted dates only; the
// raw freshness token never enters markup (check jsonld_raw_freshness_token_leak).
const ld = zipReportJsonLd({
  zip,
  place: primaryPlace,
  county: res.county_names[0] ?? null,
  signals: ranked.map((s) => ({
    label: s.label,
    display: s.display,
    sub: s.sub,
    source: s.source,
  })),
  asOf,
  asOfIso: asOfIsoFromToken(freshnessToken),
});
```

- [ ] **Step 3: Inject** — in the JSX, on the line after `<ReportFooter freshnessToken={freshnessToken} />` (~line 533), matching `app/r/[slug]/page.tsx:281` exactly:

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
```

- [ ] **Step 4: Run the helper tests once more** — `bun test lib/jsonld.test.ts lib/project/as-of.test.ts` — Expected: all PASS.

- [ ] **Step 5: Build verify** — `bunx next build` — Expected: compiles clean; `/r/zip-report/[zip]` present in the route manifest. (This is the repo's verify command — do NOT use `npx tsc`.)

- [ ] **Step 6: Commit**

```bash
git add "app/r/zip-report/[zip]/page.tsx"
git commit -m "feat(zip-report-jsonld): inject Dataset+FAQPage on /r/zip-report/[zip]"
```

---

### Post-deploy (not a coding task — closes the check)

After the operator-approved push deploys: fetch `https://www.swfldatagulf.com/r/zip-report/33914`, extract the `application/ld+json` script, confirm it parses and its figures match the served page values byte-for-byte, then:

```bash
node scripts/check.mjs close zip_report_jsonld_live_verify --evidence "<what was fetched + matched>"
```
