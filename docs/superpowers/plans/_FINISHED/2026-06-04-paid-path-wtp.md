# paid_path_wtp — Re-sequence Move #2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smallest possible WTP test — bearer-gate the MCP endpoint, build a $39–$79 ZIP-level housing+flood-risk page from existing brain outputs, and hand a demo URL to LCAR.

**Architecture:** Group A (auth gate) and Group B (WTP page) are fully independent — same repo, zero shared files, can be executed in parallel. Group A flips one function in one file. Group B creates one new server component that reads `brains/housing-swfl.md` and `brains/env-swfl.md` from disk, surfaces the data without re-derivation, and derives badge polarity from `resolveGradeConfig` (the single source of truth — never hardcoded per-metric). No new API routes, no Stripe, no LLM.

**Tech Stack:** Next.js 14 App Router · Server Components · Bun test runner · TypeScript

---

## Scope guards

- **No Stripe / checkout / billing** — price is anchor text only.
- **No tenancy seam / no RLS** — DEFERRED tripwire stays deferred.
- **No `corridor-factor.mts` wiring** — belongs to `corridor_factor_wire` diff-review check.
- **No LLM** in any math path.
- **No push** — both groups commit locally and hand to Ricky.

---

## Group A — Bearer Gate

**Files:**

- Modify: `app/api/mcp/auth.ts`
- Create: `app/api/mcp/auth.test.ts`
- Modify: `.env.example`

- [ ] **Task A1: Write the failing tests**

Create `app/api/mcp/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { assertAuthorized } from "./auth";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("Authorization", authHeader);
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers,
  });
}

describe("assertAuthorized", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.MCP_BEARER_TOKEN;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_BEARER_TOKEN;
    else process.env.MCP_BEARER_TOKEN = original;
  });

  it("(1) open when MCP_BEARER_TOKEN is not set", async () => {
    delete process.env.MCP_BEARER_TOKEN;
    await expect(assertAuthorized(makeRequest())).resolves.toBeUndefined();
  });

  it("(2) throws 401 Response when token set but no Authorization header", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    const req = makeRequest();
    await expect(assertAuthorized(req)).rejects.toBeInstanceOf(Response);
    try {
      await assertAuthorized(req);
    } catch (e) {
      expect((e as Response).status).toBe(401);
    }
  });

  it("(3) throws 401 Response when bearer token is wrong", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    const req = makeRequest("Bearer wrong-token");
    await expect(assertAuthorized(req)).rejects.toBeInstanceOf(Response);
    try {
      await assertAuthorized(req);
    } catch (e) {
      expect((e as Response).status).toBe(401);
    }
  });

  it("(4) resolves when bearer token matches exactly", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    await expect(
      assertAuthorized(makeRequest("Bearer secret-abc")),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Run to confirm red** (cases 2–4 fail; case 1 already passes):

```
bun test app/api/mcp/auth.test.ts
```

- [ ] **Task A2: Implement the bearer gate**

Replace `app/api/mcp/auth.ts` entirely:

```typescript
/**
 * MCP auth gate.
 *
 * - MCP_BEARER_TOKEN not set → open (v1 backward-compatible mode).
 * - MCP_BEARER_TOKEN set     → require `Authorization: Bearer <token>` to match.
 *   Throws a Response(401) so Next.js App Router returns it directly to the caller.
 *   POST and DELETE in route.ts need no changes — the thrown Response propagates.
 */
export async function assertAuthorized(request: Request): Promise<void> {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return;
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : "";
  if (provided !== expected)
    throw new Response("Unauthorized", { status: 401 });
}
```

- [ ] **Run to confirm green:**

```
bun test app/api/mcp/auth.test.ts
```

All 4 cases pass.

- [ ] **Task A3: Update `.env.example`**

Append to `.env.example`:

```
# --- MCP Bearer Token (optional) ---
# Set to gate POST /api/mcp and DELETE /api/mcp with Bearer auth.
# Leave blank to keep the endpoint open (v1 mode).
MCP_BEARER_TOKEN=
```

- [ ] **Task A4: Confirm route.ts needs no edits**

Read `app/api/mcp/route.ts`. Both `POST` and `DELETE` call `await assertAuthorized(request)` before delegating to the handler. Thrown `Response` propagates in Next.js App Router without a catch. No edits required.

- [ ] **Task A5: Full test suite — no regressions**

```
bun test
```

- [ ] **Task A6: Commit Group A**

```bash
git add app/api/mcp/auth.ts app/api/mcp/auth.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(mcp): bearer-token gate for /api/mcp POST+DELETE

MCP_BEARER_TOKEN unset = open (v1 compat). When set, Authorization:
Bearer <token> must match exactly or route returns 401. Tested with
4 Bun cases. No call-site changes in route.ts.
EOF
)"
```

**Do NOT push. Hand commit to Ricky.**

---

## Group B — WTP Page

**Files:**

- Create: `app/r/zip-report/[zip]/page.tsx`

**No routing conflict:** Next.js 14 prefers literal segments over dynamic ones, so `zip-report` is never captured by `app/r/[slug]/page.tsx`.

### Badge polarity — design invariant

Badge colors derive exclusively from `resolveGradeConfig(slug).direction_polarity`. Never hardcoded per-metric. Three states:

| `direction_polarity`                | value up                | value down              |
| ----------------------------------- | ----------------------- | ----------------------- |
| `higher_is_bullish`                 | emerald                 | rose                    |
| `lower_is_bullish`                  | rose                    | emerald                 |
| `none` (absent / invalid / neutral) | zinc-500 (neutral gray) | zinc-500 (neutral gray) |

`resolveGradeConfig` is the vocab single source of truth (`refinery/vocab/loader.mts`). It never throws — unknown or polarity-less slugs return `{ direction_polarity: "none" }`, producing a gray badge automatically. Three currently-non-conforming slugs (`licenses_cbc_share_swfl`, `dbpr_notices_abt_90d`, `dbpr_releases_abt_90d`) will render gray badges by construction; no page code change is needed when the vocab is later updated.

---

- [ ] **Task B1: Verify brain files and routing**

```
ls app/r/
```

Expected: `[slug]/`, `cre-swfl/`, `source/` — no `zip-report/` yet.

```
ls brains/
```

Confirm `housing-swfl.md` and `env-swfl.md` are present.

- [ ] **Task B2: Create `app/r/zip-report/[zip]/page.tsx`**

```typescript
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { parseBrainMarkdown } from "../../../../refinery/render/speaker.mts";
import {
  resolveGradeConfig,
  type DirectionPolarity,
} from "../../../../refinery/vocab/loader.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAINS_DIR = path.join(process.cwd(), "brains");
const VALID_ZIP = /^\d{5}$/;

interface PageProps {
  params: Promise<{ zip: string }>;
}

async function loadBrain(slug: string) {
  const raw = await readFile(path.join(BRAINS_DIR, `${slug}.md`), "utf-8");
  return parseBrainMarkdown(raw);
}

/**
 * Compute badge text + polarity for a YoY-style delta.
 * Polarity is resolved from the vocab — never hardcoded.
 * Returns null when delta is absent so callers can skip the badge entirely.
 */
function deltaForSlug(
  deltaSlug: string,
  delta: number | null | undefined,
  unitLabel: string,
): { text: string; polarity: DirectionPolarity; isUp: boolean } | null {
  if (delta == null) return null;
  const { direction_polarity } = resolveGradeConfig(deltaSlug);
  return {
    text: `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}${unitLabel}`,
    polarity: direction_polarity,
    isUp: delta > 0,
  };
}

export default async function ZipReportPage({ params }: PageProps) {
  const { zip } = await params;
  if (!VALID_ZIP.test(zip)) notFound();

  // Definite-assignment: notFound() in the catch never returns.
  let housing!: Awaited<ReturnType<typeof loadBrain>>;
  let env!: Awaited<ReturnType<typeof loadBrain>>;
  try {
    [housing, env] = await Promise.all([
      loadBrain("housing-swfl"),
      loadBrain("env-swfl"),
    ]);
  } catch {
    notFound();
  }

  // Housing row — 404 if this ZIP is absent from the brain
  const housingTable = housing.output.detail_tables?.find(
    (t) => t.id === "housing_by_zip",
  );
  const housingRow = housingTable?.rows.find((r) => r.key === zip);
  if (!housingRow) notFound();

  const price      = housingRow.cells["median_sale_price"] as number;
  const priceYoy   = housingRow.cells["median_sale_price_yoy_pct"] as number | null;
  const dom        = housingRow.cells["median_dom"] as number;
  const domYoy     = housingRow.cells["median_dom_yoy_days"] as number | null;
  const saleToList = housingRow.cells["avg_sale_to_list_pct"] as number | null;
  const mos        = housingRow.cells["months_of_supply"] as number | null;
  const homesSold  = housingRow.cells["homes_sold"] as number | null;
  const inventory  = housingRow.cells["inventory"] as number | null;

  // Flood metrics — section silently hidden for inland ZIPs with no NFIP data
  const floodMetric = env.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  const rankMetric = env.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`,
  );
  const hasFlood = floodMetric !== undefined && rankMetric !== undefined;

  // Badges — polarity from vocab, never hardcoded
  const priceBadge = deltaForSlug("median_sale_price_yoy_pct", priceYoy, "% YoY");
  const domBadge   = deltaForSlug("median_dom_yoy_days", domYoy, " days");

  return (
    <div className="min-h-dvh bg-white font-sans text-zinc-900">
      <main className="mx-auto max-w-2xl px-6 py-12 sm:px-8 sm:py-16">

        {/* Header */}
        <header className="border-b border-zinc-200 pb-6">
          <div className="flex items-center gap-2 text-zinc-500">
            <WaveMark />
            <p className="text-xs uppercase tracking-wider">SWFL Data Gulf</p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            ZIP {zip} — Housing &amp; Flood Risk Report
          </h1>
          <dl className="mt-4 flex flex-wrap gap-5 text-sm">
            <Meta
              label="Freshness"
              value={<code className="text-xs">{housing.freshness_token}</code>}
            />
            <Meta label="Updated" value={formatDate(housing.refined_at)} />
          </dl>
        </header>

        {/* Housing Market */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Housing Market
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            housing-swfl · 90-day window
          </p>
          <dl className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            <DataRow
              label="Median sale price"
              value={`$${price.toLocaleString()}`}
              badge={priceBadge}
            />
            <DataRow
              label="Days on market"
              value={String(dom)}
              badge={domBadge}
            />
            {saleToList != null && (
              <DataRow label="Sale-to-list ratio" value={`${saleToList}%`} />
            )}
            {mos != null && (
              <DataRow label="Months of supply" value={String(mos)} />
            )}
            {homesSold != null && (
              <DataRow label="Homes sold (90d)" value={String(homesSold)} />
            )}
            {inventory != null && (
              <DataRow label="Active inventory" value={String(inventory)} />
            )}
          </dl>
        </section>

        {/* Flood Risk */}
        {hasFlood && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Flood Risk
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              env-swfl · NFIP 10-yr average annual loss
            </p>
            <dl className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              <DataRow
                label="Avg Annual Loss"
                value={`$${(floodMetric!.value as number).toLocaleString(
                  undefined,
                  { maximumFractionDigits: 0 },
                )} / yr per insured property`}
              />
              <DataRow
                label="SWFL percentile rank"
                value={`${Math.round(rankMetric!.value as number)}th`}
              />
              <div className="flex items-start justify-between px-4 py-3 text-sm">
                <dt className="text-zinc-500">Source</dt>
                <dd className="ml-4 text-right text-xs text-zinc-600">
                  <a
                    href={floodMetric!.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-sky-700"
                  >
                    {floodMetric!.source.citation}
                  </a>
                </dd>
              </div>
            </dl>
          </section>
        )}

        {/* Price CTA */}
        <div className="mt-10 rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-6">
          <p className="text-center text-sm font-medium text-zinc-700">
            Get this for any SWFL ZIP
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-6 text-sm text-zinc-600">
            <span>
              One-time report{" "}
              <span className="font-semibold text-zinc-900">$39</span>
            </span>
            <span>
              Weekly updates{" "}
              <span className="font-semibold text-zinc-900">$79/mo</span>
            </span>
          </div>
          <div className="mt-4 flex justify-center">
            <a
              href={`mailto:support@swfldatagulf.com?subject=ZIP%20Report%20${zip}`}
              className="inline-flex items-center rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Order this report
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <WaveMark />
            <span>
              SWFL Data Gulf ·{" "}
              <code className="text-xs">{housing.freshness_token}</code>
            </span>
          </div>
          <p className="mt-2 flex flex-wrap gap-3">
            <span>Raw data:</span>
            <a
              href="/api/b/housing-swfl"
              className="underline underline-offset-2 hover:text-zinc-700"
            >
              /api/b/housing-swfl
            </a>
            <a
              href="/api/b/env-swfl"
              className="underline underline-offset-2 hover:text-zinc-700"
            >
              /api/b/env-swfl
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function WaveMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 18"
      className="h-4 w-6 text-sky-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M1 5c3.5-4 7-4 10.5 0S18.5 9 22 5s4.5-1 5 0" />
      <path d="M1 10c3.5-4 7-4 10.5 0S18.5 14 22 10s4.5-1 5 0" />
      <path d="M1 15c3.5-4 7-4 10.5 0S18.5 19 22 15s4.5-1 5 0" />
    </svg>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{value}</dd>
    </div>
  );
}

/**
 * Badge color derived from direction_polarity (vocab source of truth):
 *   higher_is_bullish + up   → emerald (good)
 *   higher_is_bullish + down → rose    (bad)
 *   lower_is_bullish  + up   → rose    (bad)
 *   lower_is_bullish  + down → emerald (good)
 *   none / invalid           → zinc    (neutral — no directional assertion)
 */
function badgeColor(
  polarity: DirectionPolarity,
  isUp: boolean,
): string {
  if (polarity === "none") return "text-zinc-500";
  if (polarity === "higher_is_bullish") {
    return isUp ? "text-emerald-600" : "text-rose-600";
  }
  // lower_is_bullish
  return isUp ? "text-rose-600" : "text-emerald-600";
}

function DataRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: {
    text: string;
    polarity: DirectionPolarity;
    isUp: boolean;
  } | null;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="flex items-center gap-2 text-right font-mono text-zinc-900">
        {value}
        {badge && (
          <span className={`font-sans text-xs ${badgeColor(badge.polarity, badge.isUp)}`}>
            {badge.text}
          </span>
        )}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Task B3: TypeScript typecheck**

```
npx tsc --noEmit
```

Expected: 0 errors. If TypeScript objects to the `!` assertions inside `{hasFlood && ...}`, introduce local consts before the return:

```typescript
const aal = (floodMetric as NonNullable<typeof floodMetric>).value as number;
const rank = Math.round(
  (rankMetric as NonNullable<typeof rankMetric>).value as number,
);
```

And reference `aal`/`rank` in the JSX instead of `floodMetric!.value`.

- [ ] **Task B4: Verify in browser**

```
bun run dev
```

Navigate to `http://localhost:3000/r/zip-report/33931`

Checklist:

- [ ] Title: "ZIP 33931 — Housing & Flood Risk Report"
- [ ] Freshness token visible
- [ ] Median sale price shows with a YoY badge; badge is **emerald** (rising price = bullish, `higher_is_bullish`) OR **gray** if `median_sale_price_yoy_pct` has no polarity in the vocab yet
- [ ] Days on market shows with a YoY badge; if DOM rose it should be **rose** (`lower_is_bullish`) OR **gray** if slug has no polarity
- [ ] Flood AAL shows (e.g. ~$30,075/yr per insured property)
- [ ] SWFL rank shows (e.g. 99th)
- [ ] Source citation is a live FEMA link
- [ ] "Order this report" opens `mailto:support@swfldatagulf.com?subject=ZIP%20Report%2033931`
- [ ] No routing collision: `http://localhost:3000/r/housing-swfl` and `/r/env-swfl` still render

- [ ] **Task B5: Commit Group B**

```bash
git add "app/r/zip-report/[zip]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(r): ZIP-level housing + flood risk report page (/r/zip-report/[zip])

Server component reads housing-swfl and env-swfl brains from disk.
Housing: median price/DOM/S2L/MOS/sold/inventory from housing_by_zip
detail table. Flood: NFIP 10-yr AAL + SWFL percentile rank from
env-swfl key_metrics. Badge polarity from resolveGradeConfig (vocab
single source of truth) — three states: higher_is_bullish/
lower_is_bullish/none (neutral gray). CTA anchors at $39 one-time /
$79/mo → mailto:support@swfldatagulf.com. No Stripe, no LLM.
Demo target: /r/zip-report/33931 (FMB — highest AAL in SWFL).
EOF
)"
```

**Do NOT push. Hand commit to Ricky.**

---

## Piece 3 — LCAR Demo Target

No new files. Hand Ricky this URL:

```
https://www.swfldatagulf.com/r/zip-report/33931
```

**Why 33931:** Fort Myers Beach — highest NFIP AAL in SWFL ($30,075/yr per insured property, 99th percentile), high-median coastal market, DOM rising. One page makes the flood-housing intersection legible to a real-estate professional without domain knowledge.

---

## Verification Summary

### Group A

| Test                 | Command                                                                                            | Expected             |
| -------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| All 4 Bun tests pass | `bun test app/api/mcp/auth.test.ts`                                                                | 4 passing            |
| No regressions       | `bun test`                                                                                         | all passing          |
| Open (no env var)    | `curl -X POST http://localhost:3000/api/mcp`                                                       | MCP handler response |
| Closed + no header   | `MCP_BEARER_TOKEN=abc curl -X POST http://localhost:3000/api/mcp`                                  | 401                  |
| Wrong token          | `MCP_BEARER_TOKEN=abc curl -H "Authorization: Bearer wrong" -X POST http://localhost:3000/api/mcp` | 401                  |
| Correct token        | `MCP_BEARER_TOKEN=abc curl -H "Authorization: Bearer abc" -X POST http://localhost:3000/api/mcp`   | MCP handler          |

### Group B

| Check                         | Expected                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| `npx tsc --noEmit`            | 0 errors                                                                  |
| `/r/zip-report/33931` renders | All sections visible                                                      |
| Price badge color             | emerald if `higher_is_bullish` in vocab; zinc if no polarity declared yet |
| DOM badge color               | rose (for rising DOM) if `lower_is_bullish` in vocab; zinc if no polarity |
| Flood AAL                     | ~$30,075 / yr per insured property                                        |
| Rank                          | 99th                                                                      |
| mailto href                   | `support@swfldatagulf.com?subject=ZIP%20Report%2033931`                   |
| Existing brain routes         | `/r/housing-swfl`, `/r/env-swfl` unaffected                               |
