# Weekly-Read (Lane D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 20 files, keywords: migration, architecture

**Goal:** Email + ZIP captured on the zip-report page → enrolled in `weekly_read_subscribers` → a short, personalized, cited weekly market read for that ZIP, built by our engine and sent via Resend batch, approval-locked for v1, until they unsubscribe.

**Architecture:** New isolated module `lib/email/weekly-read/` (pure cadence + pure content extractor + pure render + batch send) that imitates the *shape* of `lib/email/outreach/*` without importing its types or editing any of its files. New table, new subscribe endpoint, third branch on the shared unsubscribe route, `wid`-tag branch on the shared Resend webhook, a DRY-by-default runner script, and an approval-locked GHA workflow modeled on `outreach-demo.yml`.

**Tech Stack:** Next.js App Router (nodejs runtime routes), Supabase (typed client via `database.types.ts`), Resend `batch.send`, Bun scripts + `bun:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-03-weekly-read-design.md`. Provisional defaults confirmed-by-silence 07/03/2026 (operator AFK on re-ask): approval-locked v1 · light 3-stat content · no permits stat (operator's Lane B ruling) · daily digest untouched.

## Global Constraints

- **Never edit `lib/email/outreach/*`.** Copy techniques (jitter, batch shape); never import outreach types (`ComposedMessage`, `DemoStage`, `OutreachEvent`, ...). Importing from `lib/email/weekly-read/*`, `lib/email/validation`, `lib/fetch-brain`, `refinery/*` is fine.
- **Resend batch cap = 100 messages per `batch.send` call** (crawl4ai-verified 07/03/2026). `CHUNK = 100`.
- **Unsubscribe token literal:** `{{{RESEND_UNSUBSCRIBE_URL}}}` — must appear in rendered HTML; the send builder substitutes the per-subscriber URL `/api/unsubscribe?wid=<id>`.
- **CAN-SPAM:** working opt-out (token + `List-Unsubscribe` + `List-Unsubscribe-Post` headers), accurate subject, physical postal address in every live send (runner refuses without it).
- **Consent text is canonical and server-set only:** `"Yes, send me the weekly market read for my ZIP. I can unsubscribe anytime."` — never client-supplied.
- **As-of dates:** MM/DD/YYYY, stated once. The raw freshness token (`SWFL-…`) NEVER ships in an email.
- **No permits stat** in the email (operator ruling 07/03/2026 — "shit data"). Stats = Median Home Value, Market Activity (DOM + homes sold), Annual Flood Loss.
- **No invented numbers:** a ZIP with no held housing row is SKIPPED (reported), never filled.
- **Live sends are operator-run:** `DRY_RUN` defaults true; live requires `DRY_RUN=false` + `WEEKLY_READ_APPROVED=1` + postal address + sender. The GHA cron is DRY-hardcoded. Do NOT live-send during this build (`weekly_read_live_verify` stays open for the operator).
- **Daily digest untouched:** `/api/email/subscribe`, `daily-email-digest.yml`, `email_subscribers` — zero edits.
- **Typed Supabase client** (`createServiceRoleClient`) — the migration + type regen (Task 1) must land before any code referencing `weekly_read_subscribers` compiles. No `*Untyped` hatch.
- **Verify with `bunx next build`**, not bare `npx tsc`.
- **Commit per task; NEVER push** — pushes are operator-confirmed (SESSION_LOG entry + `node scripts/safe-push.mjs`, operator-run).
- Tests are `bun:test`, colocated `*.test.ts`, run as `bun test <path>`.

## File Structure

| File | Responsibility |
|---|---|
| `docs/sql/20260703_weekly_read_subscribers.sql` (create) | Table migration, idempotent |
| `database-generated.types.ts` (regen) | Typed client picks up the new table |
| `lib/email/weekly-read/cadence.ts` (create) | Pure: due/advance/suppress decisions |
| `lib/email/weekly-read/content.ts` (create) | Pure: per-ZIP stats from held brains |
| `lib/email/weekly-read/render.ts` (create) | Pure: issue HTML + subject |
| `lib/email/weekly-read/send.ts` (create) | Pure batch build (`wid` tag) + thin `batch.send` wrapper |
| `lib/email/weekly-read/webhook.ts` (create) | Pure: Resend event + `wid` tag → status flip |
| `app/api/weekly-read/subscribe/route.ts` (create) | Capture endpoint (upsert, ZIP moat gate) |
| `app/api/unsubscribe/route.ts` (modify) | Third branch: `?wid=` |
| `app/api/webhooks/resend/route.ts` (modify) | `wid` branch before the outreach branch |
| `components/email/DigestSubscribe.tsx` (modify) | `endpoint` + `doneMessage` props (additive) |
| `app/r/zip-report/[zip]/page.tsx` (modify) | Point CTA at the new endpoint |
| `scripts/email/weekly-read-run.mts` (create) | Runner: select due → build → preview → gate → (approved) send + advance |
| `.github/workflows/weekly-read.yml` (create) | DRY-hardcoded dispatch workflow, schedule commented |
| `.gitignore` (modify) | `weekly-read-runs/` |

---

### Task 1: Table migration + type regen

**Files:**
- Create: `docs/sql/20260703_weekly_read_subscribers.sql`
- Regen: `database-generated.types.ts` (via `bun scripts/gen-supabase-types.ts`)

**Interfaces:**
- Produces: table `public.weekly_read_subscribers` with columns `id uuid PK`, `email text unique not null`, `zip text not null`, `status text default 'active'`, `next_send_at timestamptz null`, `issues_sent int default 0`, `source text`, `consent_text text`, `consent_at timestamptz`, `created_at`/`updated_at timestamptz` — and its entry in the generated `Database` type (Tasks 6–9 depend on it compiling).

- [ ] **Step 1: Write the migration**

```sql
-- Weekly-read subscribers (Lane D free taste).
-- Spec: docs/superpowers/specs/2026-07-03-weekly-read-design.md
--
-- SEPARATE from public.email_subscribers (daily digest = one generic Resend Segment
-- broadcast): this list is personalized per-ZIP and sent by our own engine via
-- resend.batch.send. One active subscription per address; re-subscribing with a new
-- ZIP updates the existing row (upsert on email).
--
-- Idempotent: safe to re-run.
-- Run: bun scripts/run-migration.ts docs/sql/20260703_weekly_read_subscribers.sql

create table if not exists public.weekly_read_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  zip           text not null,                    -- 5-digit, in-scope gated at the API
  status        text not null default 'active',   -- 'active' | 'unsubscribed' | 'bounced'
  next_send_at  timestamptz,                      -- null = due on the next run (first issue)
  issues_sent   int not null default 0,
  source        text,                             -- 'zip-report' | 'homepage' | ...
  consent_text  text,                             -- canonical wording, server-set only
  consent_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- service_role only (API routes + runner); no public access.
grant insert, select, update on public.weekly_read_subscribers to service_role;
alter table public.weekly_read_subscribers enable row level security;
```

- [ ] **Step 2: Run it**

Run: `bun scripts/run-migration.ts docs/sql/20260703_weekly_read_subscribers.sql`
Expected: `Running docs/sql/20260703_weekly_read_subscribers.sql...` then `✓ done` then `Migrations complete.`

- [ ] **Step 3: Verify row count (RULE 1: verify after migration)**

Run: `bun -e "const{readFileSync}=require('fs');const s=readFileSync('.dlt/secrets.toml','utf8');const g=k=>s.match(new RegExp('^'+k+'\\\\s*=\\\\s*\"([^\"]+)\"','m'))[1];const sql=new Bun.SQL('postgres://'+g('username')+':'+encodeURIComponent(g('password'))+'@'+g('host')+':5432/'+g('database')+'?sslmode=require');const r=await sql\`select count(*) from public.weekly_read_subscribers\`;console.log('rows:',r[0].count);await sql.end()"`
Expected: `rows: 0`

- [ ] **Step 4: Regenerate the typed client**

Run: `bun scripts/gen-supabase-types.ts`
Then: `grep -n "weekly_read_subscribers" database-generated.types.ts`
Expected: a `weekly_read_subscribers: {` Tables entry.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/20260703_weekly_read_subscribers.sql database-generated.types.ts
git commit -m "feat(weekly-read): weekly_read_subscribers table + typed client (Lane D)"
```

---

### Task 2: Cadence module (pure)

**Files:**
- Create: `lib/email/weekly-read/cadence.ts`
- Test: `lib/email/weekly-read/cadence.test.ts`

**Interfaces:**
- Produces: `WeeklyReadStatus`, `WeeklyReadCursor { status; next_send_at }`, `jitterDays(id, min, max): number`, `shouldSend(cur, now): boolean`, `afterSend(subscriberId, now): { next_send_at: string }`, `onEvent(status, event): WeeklyReadStatus | null`. Tasks 8 (runner) and 5 (webhook) consume these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/weekly-read/cadence.test.ts
import { describe, expect, it } from "bun:test";
import { afterSend, jitterDays, onEvent, shouldSend } from "./cadence";

const NOW = new Date("2026-07-03T12:00:00Z");

describe("shouldSend", () => {
  it("active + never sent (null) is due", () => {
    expect(shouldSend({ status: "active", next_send_at: null }, NOW)).toBe(true);
  });
  it("active + past schedule is due", () => {
    expect(shouldSend({ status: "active", next_send_at: "2026-07-01T00:00:00Z" }, NOW)).toBe(true);
  });
  it("active + future schedule is not due", () => {
    expect(shouldSend({ status: "active", next_send_at: "2026-07-09T00:00:00Z" }, NOW)).toBe(false);
  });
  it("terminal statuses never send, even when due", () => {
    expect(shouldSend({ status: "unsubscribed", next_send_at: null }, NOW)).toBe(false);
    expect(shouldSend({ status: "bounced", next_send_at: null }, NOW)).toBe(false);
  });
});

describe("afterSend", () => {
  it("schedules 6–8 days out, deterministically per subscriber", () => {
    const a = afterSend("sub-aaaa", NOW);
    const b = afterSend("sub-aaaa", NOW);
    expect(a.next_send_at).toBe(b.next_send_at);
    const days = (new Date(a.next_send_at).getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(8);
  });
  it("different subscribers can land on different days (jitter)", () => {
    const days = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(
        (id) => (new Date(afterSend(id, NOW).next_send_at).getTime() - NOW.getTime()) / 86_400_000,
      ),
    );
    expect(days.size).toBeGreaterThan(1);
  });
});

describe("jitterDays", () => {
  it("stays within [min, max]", () => {
    for (const id of ["a", "bb", "ccc", "dddd-eeee"]) {
      const d = jitterDays(id, 6, 8);
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(8);
    }
  });
});

describe("onEvent", () => {
  it("bounce → bounced; unsubscribe/complaint → unsubscribed", () => {
    expect(onEvent("active", "bounced")).toBe("bounced");
    expect(onEvent("active", "unsubscribed")).toBe("unsubscribed");
    expect(onEvent("active", "complained")).toBe("unsubscribed");
  });
  it("terminal statuses are never changed (null)", () => {
    expect(onEvent("unsubscribed", "bounced")).toBeNull();
    expect(onEvent("bounced", "complained")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/weekly-read/cadence.test.ts`
Expected: FAIL — cannot resolve `./cadence`.

- [ ] **Step 3: Implement**

```ts
// lib/email/weekly-read/cadence.ts
//
// Weekly-read cadence — pure, no I/O. Deliberately smaller than the outreach demo
// cadence (no touch sequence, no trial funnel): send weekly, forever, until they
// leave. jitterDays is COPIED from demo-cadence.ts — a pure technique — not imported,
// so weekly-read never couples to outreach's types (spec isolation rule).

export type WeeklyReadStatus = "active" | "unsubscribed" | "bounced";

export interface WeeklyReadCursor {
  status: WeeklyReadStatus;
  next_send_at: string | null;
}

/** Deterministic per-subscriber jitter — spreads a growing list across the 6–8 day
 *  window so one weekly instant never carries the whole list into Resend's rate limit. */
export function jitterDays(subscriberId: string, min: number, max: number): number {
  let h = 0;
  for (const c of subscriberId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return min + (h % (max - min + 1));
}

/** Due = active AND (never sent, or the scheduled instant has passed). */
export function shouldSend(cur: WeeklyReadCursor, now: Date): boolean {
  if (cur.status !== "active") return false;
  if (cur.next_send_at === null) return true;
  return new Date(cur.next_send_at).getTime() <= now.getTime();
}

/** After a successful send: next issue 6–8 days out, jittered per subscriber. */
export function afterSend(subscriberId: string, now: Date): { next_send_at: string } {
  const days = jitterDays(subscriberId, 6, 8);
  return { next_send_at: new Date(now.getTime() + days * 86_400_000).toISOString() };
}

/** Suppression event → terminal status. null = already terminal, leave untouched. */
export function onEvent(
  status: WeeklyReadStatus,
  event: "bounced" | "unsubscribed" | "complained",
): WeeklyReadStatus | null {
  if (status !== "active") return null;
  return event === "bounced" ? "bounced" : "unsubscribed";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/email/weekly-read/cadence.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/email/weekly-read/cadence.ts lib/email/weekly-read/cadence.test.ts
git commit -m "feat(weekly-read): pure weekly cadence (due/advance/suppress)"
```

---

### Task 3: Content extractor (pure)

**Files:**
- Create: `lib/email/weekly-read/content.ts`
- Test: `lib/email/weekly-read/content.test.ts`

**Interfaces:**
- Consumes: `ParsedBrain` from `@/refinery/render/speaker.mts` (shape: `output.detail_tables[].{id, source:{url,citation}, rows[].{key, cells}}`, `output.key_metrics[].{metric, value, source:{url,citation}}`, `freshness_token`), `asOfFromToken` from `@/lib/project/as-of`.
- Produces: `WeeklyReadStat { label; value; sub }`, `WeeklyReadContent { zip; place; stats; sources; asOf }`, `extractWeeklyReadContent(housing, env, zip, place): WeeklyReadContent | null`. Tasks 4 and 8 consume these exact names. Returns `null` when the ZIP holds no housing row (subscriber skipped — never invented).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/weekly-read/content.test.ts
import { describe, expect, it } from "bun:test";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import { extractWeeklyReadContent } from "./content";

const SRC = { url: "https://www.redfin.com/news/data-center/", citation: "Redfin Data Center" };

function housingBrain(cells: Record<string, number | string | null>): ParsedBrain {
  return {
    freshness_token: "SWFL-7421-v5-20260630",
    output: {
      key_metrics: [],
      detail_tables: [{ id: "housing_by_zip", source: SRC, rows: [{ key: "33914", cells }] }],
    },
  } as unknown as ParsedBrain;
}

function envBrain(aal: number): ParsedBrain {
  return {
    freshness_token: "SWFL-9001-v5-20260630",
    output: {
      key_metrics: [
        {
          metric: "swfl_zip_33914_flood_aal_usd_per_insured_property",
          value: aal,
          source: { url: "https://www.fema.gov/", citation: "FEMA NFIP" },
        },
      ],
      detail_tables: [],
    },
  } as unknown as ParsedBrain;
}

describe("extractWeeklyReadContent", () => {
  it("builds 3 stats — home value, market activity, flood — with citations and MM/DD/YYYY as-of", () => {
    const c = extractWeeklyReadContent(
      housingBrain({
        median_sale_price: 410_000,
        median_sale_price_yoy_pct: -3,
        median_dom: 41,
        homes_sold: 87,
      }),
      envBrain(1240),
      "33914",
      "Cape Coral",
    );
    expect(c).not.toBeNull();
    expect(c!.stats.map((s) => s.label)).toEqual([
      "Median Home Value",
      "Market Activity",
      "Annual Flood Loss",
    ]);
    expect(c!.stats[0].value).toBe("$410K");
    expect(c!.stats[0].sub).toContain("3% YoY");
    expect(c!.stats[1].value).toBe("41 days");
    expect(c!.stats[1].sub).toContain("87 homes sold");
    expect(c!.stats[2].value).toBe("$1,240");
    expect(c!.sources).toEqual(["Redfin Data Center", "FEMA NFIP"]);
    expect(c!.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(c!.place).toBe("Cape Coral");
  });

  it("returns null when the ZIP has no held housing price (skip, never invent)", () => {
    expect(
      extractWeeklyReadContent(housingBrain({ median_dom: 41 }), envBrain(1240), "33914", null),
    ).toBeNull();
    expect(extractWeeklyReadContent(null, envBrain(1240), "33914", null)).toBeNull();
  });

  it("omits stats whose values are not held — never zero-fills", () => {
    const c = extractWeeklyReadContent(
      housingBrain({ median_sale_price: 850_000 }),
      null,
      "33914",
      null,
    );
    expect(c!.stats.map((s) => s.label)).toEqual(["Median Home Value"]);
    expect(c!.sources).toEqual(["Redfin Data Center"]);
  });

  it("never includes a permits stat (operator ruling 07/03/2026)", () => {
    const c = extractWeeklyReadContent(
      housingBrain({ median_sale_price: 410_000, median_dom: 41 }),
      envBrain(1240),
      "33914",
      "Cape Coral",
    );
    expect(JSON.stringify(c).toLowerCase()).not.toContain("permit");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/weekly-read/content.test.ts`
Expected: FAIL — cannot resolve `./content`.

- [ ] **Step 3: Implement**

```ts
// lib/email/weekly-read/content.ts
//
// Weekly-read issue content — the same per-ZIP figures the zip-report page renders,
// extracted from HELD brains (housing-swfl detail table + env-swfl flood metrics).
// NO PERMITS (operator ruling 07/03/2026 — Lane B killed the permits pill; the email
// follows the ruling even though the page swap hasn't shipped yet). Pure: the runner
// loads the ParsedBrains once and calls this per ZIP. Empty-tolerant: a ZIP with no
// held housing price returns null and that subscriber is SKIPPED — never invented.

import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import { asOfFromToken } from "@/lib/project/as-of";

export interface WeeklyReadStat {
  label: string;
  value: string;
  sub: string;
}

export interface WeeklyReadContent {
  zip: string;
  place: string | null;
  /** 1–3 stats — only figures actually held ride along. */
  stats: WeeklyReadStat[];
  /** Deduped citation labels for the footer sources line. */
  sources: string[];
  /** MM/DD/YYYY, stated once in the email — never the raw token. */
  asOf: string | null;
}

// Same abbreviation the zip-report stats bar uses.
function fmtCurrency(val: number): string {
  if (val >= 1_000_000) return "$" + (val / 1_000_000).toFixed(1) + "M";
  if (val >= 1_000) return "$" + Math.round(val / 1_000) + "K";
  return "$" + val.toLocaleString("en-US");
}

export function extractWeeklyReadContent(
  housing: ParsedBrain | null,
  env: ParsedBrain | null,
  zip: string,
  place: string | null,
): WeeklyReadContent | null {
  const table = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip");
  const row = table?.rows.find((r) => r.key === zip);
  const price = row?.cells["median_sale_price"];
  if (typeof price !== "number") return null; // no held figure → no issue this week

  const priceYoy = row?.cells["median_sale_price_yoy_pct"];
  const dom = row?.cells["median_dom"];
  const homesSold = row?.cells["homes_sold"];

  const stats: WeeklyReadStat[] = [
    {
      label: "Median Home Value",
      value: fmtCurrency(price),
      sub:
        typeof priceYoy === "number" && priceYoy !== 0
          ? `${priceYoy > 0 ? "↑" : "↓"} ${Math.abs(priceYoy)}% YoY · 90-day median sale price`
          : "90-day median sale price",
    },
  ];
  if (typeof dom === "number") {
    stats.push({
      label: "Market Activity",
      value: `${dom} days`,
      sub:
        typeof homesSold === "number"
          ? `median time on market · ${homesSold} homes sold (90 days)`
          : "median time on market",
    });
  }

  const sources: string[] = [];
  if (table?.source.citation) sources.push(table.source.citation);

  const flood = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  if (flood && typeof flood.value === "number") {
    stats.push({
      label: "Annual Flood Loss",
      value: fmtCurrency(flood.value),
      sub: "flood insurance avg/home",
    });
    if (flood.source.citation && !sources.includes(flood.source.citation)) {
      sources.push(flood.source.citation);
    }
  }

  return {
    zip,
    place,
    stats,
    sources,
    asOf: housing?.freshness_token ? (asOfFromToken(housing.freshness_token) ?? null) : null,
  };
}
```

Note for the implementer: if `asOfFromToken`'s signature rejects this call, check `lib/project/as-of.ts` — the zip-report page calls it with a possibly-undefined token (`app/r/zip-report/[zip]/page.tsx:237`), so match whatever it accepts.

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/email/weekly-read/content.test.ts`
Expected: PASS. If `$1,240` fails on locale, use `toLocaleString("en-US")` in `fmtCurrency` (already shown above).

- [ ] **Step 5: Commit**

```bash
git add lib/email/weekly-read/content.ts lib/email/weekly-read/content.test.ts
git commit -m "feat(weekly-read): pure per-ZIP content extractor (housing + flood, no permits)"
```

---

### Task 4: Issue render (pure)

**Files:**
- Create: `lib/email/weekly-read/render.ts`
- Test: `lib/email/weekly-read/render.test.ts`

**Interfaces:**
- Consumes: `WeeklyReadContent` from Task 3.
- Produces: `UNSUB_TOKEN` (the literal `{{{RESEND_UNSUBSCRIBE_URL}}}`), `renderWeeklyReadEmail(input: { content, ctaUrl, postalAddress? }): { html, subject }`. Tasks 5 and 8 consume these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/weekly-read/render.test.ts
import { describe, expect, it } from "bun:test";
import type { WeeklyReadContent } from "./content";
import { renderWeeklyReadEmail, UNSUB_TOKEN } from "./render";

const CONTENT: WeeklyReadContent = {
  zip: "33914",
  place: "Cape Coral",
  stats: [
    { label: "Median Home Value", value: "$410K", sub: "↓ 3% YoY · 90-day median sale price" },
    { label: "Market Activity", value: "41 days", sub: "median time on market · 87 homes sold (90 days)" },
    { label: "Annual Flood Loss", value: "$1,240", sub: "flood insurance avg/home" },
  ],
  sources: ["Redfin Data Center", "FEMA NFIP"],
  asOf: "06/30/2026",
};

describe("renderWeeklyReadEmail", () => {
  const { html, subject } = renderWeeklyReadEmail({
    content: CONTENT,
    ctaUrl: "https://www.swfldatagulf.com/r/zip-report/33914",
    postalAddress: "1234 Example Blvd #5, Fort Myers, FL 33901",
  });

  it("subject names the place and the headline figure (accurate headers)", () => {
    expect(subject).toBe("Cape Coral (33914) weekly read: $410K median home value");
  });
  it("carries the unsubscribe token for send-time substitution", () => {
    expect(html).toContain(UNSUB_TOKEN);
  });
  it("renders every stat, the CTA, sources, and the postal address", () => {
    for (const s of CONTENT.stats) {
      expect(html).toContain(s.label);
      expect(html).toContain(s.value);
    }
    expect(html).toContain("https://www.swfldatagulf.com/r/zip-report/33914");
    expect(html).toContain("Redfin Data Center");
    expect(html).toContain("FEMA NFIP");
    expect(html).toContain("1234 Example Blvd #5, Fort Myers, FL 33901");
  });
  it("states the as-of date once and never a raw freshness token", () => {
    expect(html).toContain("As of 06/30/2026");
    expect(html).not.toMatch(/SWFL-\d+/);
  });
  it("escapes HTML in dynamic fields", () => {
    const evil = renderWeeklyReadEmail({
      content: { ...CONTENT, place: "<script>x</script>" },
      ctaUrl: "https://www.swfldatagulf.com/r/zip-report/33914",
    });
    expect(evil.html).not.toContain("<script>x</script>");
  });
  it("falls back to ZIP when no place, and omits postal block when not configured", () => {
    const bare = renderWeeklyReadEmail({
      content: { ...CONTENT, place: null },
      ctaUrl: "https://www.swfldatagulf.com/r/zip-report/33914",
    });
    expect(bare.subject).toBe("ZIP 33914 weekly read: $410K median home value");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/weekly-read/render.test.ts`
Expected: FAIL — cannot resolve `./render`.

- [ ] **Step 3: Implement**

```ts
// lib/email/weekly-read/render.ts
//
// Render ONE weekly-read issue — pure, deterministic, no LLM, no imports from
// lib/email/outreach/*. Table-based inline-styled HTML (email-client-safe; no raw
// SVG — Outlook renders it as text). The {{{RESEND_UNSUBSCRIBE_URL}}} token lives
// in the shell footer; send.ts substitutes the per-subscriber URL at batch build.
// The as-of date appears once (MM/DD/YYYY); the raw freshness token NEVER ships.

import type { WeeklyReadContent } from "./content";

export const UNSUB_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";

const FONT = "Arial, Helvetica, sans-serif";

export interface WeeklyReadEmailInput {
  content: WeeklyReadContent;
  /** "Build your own" destination — the zip-report page hosting OpenProjectCta. */
  ctaUrl: string;
  /** CAN-SPAM physical postal address. The runner refuses a live send without one. */
  postalAddress?: string;
}

export interface WeeklyReadEmail {
  html: string;
  subject: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function statCell(label: string, value: string, sub: string, width: number): string {
  return `
    <td align="center" width="${width}%" style="padding:14px 8px;border-top:1px solid #e5e7eb;">
      <div style="font-family:${FONT};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;">${escapeHtml(label)}</div>
      <div style="font-family:${FONT};font-size:24px;font-weight:bold;color:#111827;padding:4px 0;">${escapeHtml(value)}</div>
      <div style="font-family:${FONT};font-size:12px;color:#6b7280;">${escapeHtml(sub)}</div>
    </td>`;
}

export function renderWeeklyReadEmail(input: WeeklyReadEmailInput): WeeklyReadEmail {
  const { content, ctaUrl, postalAddress } = input;
  const placeName = content.place ?? `ZIP ${content.zip}`;
  const headline = content.stats[0];
  const subject = `${placeName} (${content.zip}) weekly read: ${headline.value} ${headline.label.toLowerCase()}`;
  const preheader = `${placeName}'s market this week — cited figures, one minute.`;

  const width = Math.floor(100 / Math.max(content.stats.length, 1));
  const statsRow = content.stats.map((s) => statCell(s.label, s.value, s.sub, width)).join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-family:${FONT};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#0d9488;">SWFL Data Gulf · Weekly Read</div>
          <h1 style="font-family:${FONT};font-size:24px;color:#111827;margin:8px 0 0;">${escapeHtml(placeName)} · ${escapeHtml(content.zip)}</h1>
          ${content.asOf ? `<p style="font-family:${FONT};font-size:12px;color:#6b7280;margin:6px 0 0;">As of ${escapeHtml(content.asOf)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${statsRow}</tr></table>
        </td></tr>
        <tr><td align="center" style="padding:20px 32px 8px;">
          <a href="${escapeAttr(ctaUrl)}" style="font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;background:#0d9488;text-decoration:none;padding:12px 28px;border-radius:8px;display:inline-block;">Build your own version →</a>
          <p style="font-family:${FONT};font-size:12px;color:#6b7280;margin:10px 0 0;">Free to build — seed a branded project for ${escapeHtml(placeName)}, style it, send it when you're ready.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;">
          ${content.sources.length ? `<p style="font-family:${FONT};font-size:11px;color:#9ca3af;margin:0;">Sources: ${content.sources.map(escapeHtml).join(" · ")}</p>` : ""}
        </td></tr>
      </table>
      <p style="font-family:${FONT};font-size:12px;color:#888;margin:24px 0 8px;"><a href="${UNSUB_TOKEN}" style="color:#888;">Unsubscribe</a></p>
      ${postalAddress ? `<p style="font-family:${FONT};font-size:12px;color:#999;margin:0 0 16px;">${escapeHtml(postalAddress)}</p>` : ""}
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/email/weekly-read/render.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/email/weekly-read/render.ts lib/email/weekly-read/render.test.ts
git commit -m "feat(weekly-read): pure issue renderer (stats, CTA, sources, CAN-SPAM footer)"
```

---

### Task 5: Batch send module + webhook extractor (pure)

**Files:**
- Create: `lib/email/weekly-read/send.ts`
- Create: `lib/email/weekly-read/webhook.ts`
- Test: `lib/email/weekly-read/send.test.ts`

**Interfaces:**
- Consumes: `UNSUB_TOKEN` (Task 4), `onEvent` (Task 2).
- Produces: `WeeklyReadOutgoing { subscriberId; email; subject; html }`, `buildWeeklyReadBatches(input): WeeklyReadBatchMessage[][]`, `sendWeeklyReadBatches(client, batches): Promise<SendResult>`, `BatchSender`; `extractWeeklyReadAction(payload): { wid; suppressTo } | null`. Tasks 7 (webhook route) and 8 (runner) consume these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/weekly-read/send.test.ts
import { describe, expect, it } from "bun:test";
import { UNSUB_TOKEN } from "./render";
import {
  buildWeeklyReadBatches,
  sendWeeklyReadBatches,
  type BatchSender,
  type WeeklyReadBatchMessage,
  type WeeklyReadOutgoing,
} from "./send";
import { extractWeeklyReadAction } from "./webhook";

function msg(n: number): WeeklyReadOutgoing {
  return {
    subscriberId: `sub-${n}`,
    email: `p${n}@example.com`,
    subject: `s${n}`,
    html: `<html><body><a href="${UNSUB_TOKEN}">Unsubscribe</a></body></html>`,
  };
}

describe("buildWeeklyReadBatches", () => {
  it("substitutes the per-subscriber ?wid= unsubscribe URL and sets one-click headers", () => {
    const [batch] = buildWeeklyReadBatches({
      messages: [msg(1)],
      from: "SWFL Data Gulf <hello@swfldatagulf.com>",
      unsubBase: "https://www.swfldatagulf.com/",
    });
    const m = batch[0];
    const expected = "https://www.swfldatagulf.com/api/unsubscribe?wid=sub-1";
    expect(m.html).toContain(expected);
    expect(m.html).not.toContain(UNSUB_TOKEN);
    expect(m.headers["List-Unsubscribe"]).toBe(`<${expected}>`);
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.to).toEqual(["p1@example.com"]);
    expect(m.tags).toEqual([{ name: "wid", value: "sub-1" }]);
  });
  it("chunks at 100 (Resend batch cap)", () => {
    const batches = buildWeeklyReadBatches({
      messages: Array.from({ length: 205 }, (_, i) => msg(i)),
      from: "x <x@y.z>",
      unsubBase: "https://www.swfldatagulf.com",
    });
    expect(batches.map((b) => b.length)).toEqual([100, 100, 5]);
  });
});

describe("sendWeeklyReadBatches", () => {
  it("counts sent/failed per batch and never throws", async () => {
    let calls = 0;
    const client: BatchSender = {
      batch: {
        send: async (msgs: WeeklyReadBatchMessage[]) => {
          calls++;
          return calls === 1 ? { error: null } : { error: { message: "boom" } };
        },
      },
    };
    const batches = buildWeeklyReadBatches({
      messages: Array.from({ length: 101 }, (_, i) => msg(i)),
      from: "x <x@y.z>",
      unsubBase: "https://www.swfldatagulf.com",
    });
    const r = await sendWeeklyReadBatches(client, batches);
    expect(r.sent).toBe(100);
    expect(r.failed).toBe(1);
    expect(r.errors).toEqual(["boom"]);
  });
});

describe("extractWeeklyReadAction", () => {
  it("bounce → bounced, complaint → unsubscribed (via cadence onEvent)", () => {
    expect(
      extractWeeklyReadAction({ type: "email.bounced", data: { tags: { wid: "w1" } } }),
    ).toEqual({ wid: "w1", suppressTo: "bounced" });
    expect(
      extractWeeklyReadAction({ type: "email.complained", data: { tags: { wid: "w1" } } }),
    ).toEqual({ wid: "w1", suppressTo: "unsubscribed" });
  });
  it("ignores untagged events and non-suppression types", () => {
    expect(extractWeeklyReadAction({ type: "email.bounced", data: { tags: {} } })).toBeNull();
    expect(
      extractWeeklyReadAction({ type: "email.opened", data: { tags: { wid: "w1" } } }),
    ).toBeNull();
    expect(
      extractWeeklyReadAction({ type: "email.received", data: { tags: { wid: "w1" } } }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/weekly-read/send.test.ts`
Expected: FAIL — cannot resolve `./send` / `./webhook`.

- [ ] **Step 3: Implement send.ts**

```ts
// lib/email/weekly-read/send.ts
//
// Weekly-read batch build + send. SAME SHAPE as lib/email/outreach/send.ts — chunk
// 100 (Resend's hard batch cap, re-verified 07/03/2026), per-recipient unsubscribe
// URL substituted into the token, one-click List-Unsubscribe headers — but its OWN
// types: weekly-read messages carry a `wid` tag (weekly_read_subscribers.id), never
// outreach's `rid`, and nothing here imports from lib/email/outreach/*.

import { UNSUB_TOKEN } from "./render";

const CHUNK = 100;

export interface WeeklyReadBatchMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
}

export interface WeeklyReadOutgoing {
  subscriberId: string;
  email: string;
  subject: string;
  html: string;
}

export interface BuildWeeklyReadBatchesInput {
  messages: WeeklyReadOutgoing[];
  from: string;
  replyTo?: string;
  /** Absolute origin for the unsubscribe link, e.g. https://www.swfldatagulf.com */
  unsubBase: string;
}

/** Build per-subscriber Resend messages, chunked into batches of ≤100. Pure. */
export function buildWeeklyReadBatches(
  input: BuildWeeklyReadBatchesInput,
): WeeklyReadBatchMessage[][] {
  const built: WeeklyReadBatchMessage[] = input.messages.map((m) => {
    const unsubUrl = `${input.unsubBase.replace(/\/$/, "")}/api/unsubscribe?wid=${encodeURIComponent(m.subscriberId)}`;
    return {
      from: input.from,
      to: [m.email],
      subject: m.subject,
      html: m.html.split(UNSUB_TOKEN).join(unsubUrl),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // wid rides on the message so the Resend webhook maps events → subscriber.
      tags: [{ name: "wid", value: m.subscriberId }],
    };
  });

  const batches: WeeklyReadBatchMessage[][] = [];
  for (let i = 0; i < built.length; i += CHUNK) batches.push(built.slice(i, i + CHUNK));
  return batches;
}

export interface SendResult {
  sent: number;
  failed: number;
  errors: string[];
}

/** Minimal shape of resend.batch.send we depend on (injectable for tests). */
export interface BatchSender {
  batch: {
    send: (msgs: WeeklyReadBatchMessage[]) => Promise<{ error: { message: string } | null }>;
  };
}

/** Send pre-built batches. Thin I/O; a failed batch counts its whole chunk as failed. */
export async function sendWeeklyReadBatches(
  client: BatchSender,
  batches: WeeklyReadBatchMessage[][],
): Promise<SendResult> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const batch of batches) {
    try {
      const { error } = await client.batch.send(batch);
      if (error) {
        failed += batch.length;
        errors.push(error.message);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      failed += batch.length;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { sent, failed, errors };
}
```

- [ ] **Step 4: Implement webhook.ts**

```ts
// lib/email/weekly-read/webhook.ts
//
// Pure mapping of an inbound Resend outbound-event payload tagged `wid` → the
// weekly_read_subscribers status flip. Mirrors the SHAPE of outreach's
// extractOutreachAction without importing outreach types. Only suppression events
// act in v1 (bounce/complaint); opens/clicks are not tracked for this list.
// NOTE: Resend delivers tags as a plain object {"key":"value"} in webhook payloads.

import { onEvent, type WeeklyReadStatus } from "./cadence";

export interface WeeklyReadWebhookAction {
  /** weekly_read_subscribers.id, from the `wid` tag set at send time. */
  wid: string;
  suppressTo: WeeklyReadStatus;
}

export function extractWeeklyReadAction(payload: {
  type?: string;
  data?: { tags?: Record<string, string> };
}): WeeklyReadWebhookAction | null {
  const wid = payload.data?.tags?.["wid"];
  if (!wid) return null;
  const event =
    payload.type === "email.bounced"
      ? ("bounced" as const)
      : payload.type === "email.complained"
        ? ("complained" as const)
        : null;
  if (!event) return null;
  const suppressTo = onEvent("active", event);
  return suppressTo ? { wid, suppressTo } : null;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `bun test lib/email/weekly-read/send.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add lib/email/weekly-read/send.ts lib/email/weekly-read/webhook.ts lib/email/weekly-read/send.test.ts
git commit -m "feat(weekly-read): batch send (wid tag, chunk 100) + webhook suppression extractor"
```

---

### Task 6: Subscribe endpoint

**Files:**
- Create: `app/api/weekly-read/subscribe/route.ts`

**Interfaces:**
- Consumes: `normalizeEmail`/`isValidEmail`/`sanitizeSource` from `@/lib/email/validation`, `resolveZip` from `@/refinery/lib/zip-resolver.mts`, typed `createServiceRoleClient` from `@/utils/supabase/service-role`, table from Task 1.
- Produces: `POST /api/weekly-read/subscribe` accepting `{ email, zip, source? }` → `{ ok: true }` | `{ error }`. Task 9 points the component here. Body shape is compatible with what `DigestSubscribe`'s `buildSubscribeBody` already sends on the presetZip path (`{ email, source, zip }`).

- [ ] **Step 1: Implement the route**

```ts
// app/api/weekly-read/subscribe/route.ts
//
// Weekly-read enrollment (Lane D). SEPARATE from /api/email/subscribe (the daily
// digest, a Resend Segment broadcast): weekly-read rows live in
// public.weekly_read_subscribers and are sent personalized-per-ZIP by our own
// runner. Unlike the digest, the ZIP is the product here — missing/out-of-scope
// ZIP is a hard 400, never a silent drop.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { normalizeEmail, isValidEmail, sanitizeSource } from "@/lib/email/validation";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

export const runtime = "nodejs";

/**
 * Canonical opt-in wording — defined server-side so the recorded consent can't be
 * spoofed by the client. The subscribe form's submit IS the opt-in action (the CTA
 * copy promises exactly this), so it's recorded on every enrollment.
 */
const CONSENT_TEXT =
  "Yes, send me the weekly market read for my ZIP. I can unsubscribe anytime.";

export async function POST(request: Request) {
  let payload: { email?: unknown; source?: unknown; zip?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // The MOAT gate: weekly-read is per-ZIP by definition — only the 6-county footprint.
  const rawZip = typeof payload.zip === "string" ? payload.zip.trim() : "";
  if (!/^\d{5}$/.test(rawZip) || !resolveZip(rawZip).in_scope) {
    return NextResponse.json({ error: "invalid_zip" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    // One subscription per address: re-subscribing updates the ZIP and reactivates
    // (a fresh opt-in outranks a stale unsubscribe). next_send_at null = first issue
    // goes out on the next run.
    const { error } = await supabase.from("weekly_read_subscribers").upsert(
      {
        email,
        zip: rawZip,
        status: "active",
        next_send_at: null,
        source: sanitizeSource(payload.source),
        consent_text: CONSENT_TEXT,
        consent_at: now,
        updated_at: now,
      },
      { onConflict: "email" },
    );
    if (error) {
      console.error("[weekly-read/subscribe] upsert error:", error);
      return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
    }
  } catch (e) {
    console.error("[weekly-read/subscribe] supabase unavailable:", e);
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx next build`
Expected: build succeeds (the typed client accepts `weekly_read_subscribers` because Task 1 regenerated types).

- [ ] **Step 3: Commit**

```bash
git add app/api/weekly-read/subscribe/route.ts
git commit -m "feat(weekly-read): /api/weekly-read/subscribe enrollment endpoint"
```

---

### Task 7: Suppression wiring — unsubscribe `?wid=` + webhook `wid` branch

**Files:**
- Modify: `app/api/unsubscribe/route.ts` (add third branch; existing `id`/`rid` behavior unchanged)
- Modify: `app/api/webhooks/resend/route.ts` (insert `wid` branch before the outreach branch, ~line 67)

**Interfaces:**
- Consumes: `extractWeeklyReadAction` from Task 5.
- Produces: `GET|POST /api/unsubscribe?wid=<uuid>` flips `weekly_read_subscribers.status` to `'unsubscribed'`; a Resend bounce/complaint webhook tagged `wid` flips status to `bounced`/`unsubscribed`. Both best-effort, both guarded so a terminal status is never resurrected.

- [ ] **Step 1: Add the unsubscribe branch**

In `app/api/unsubscribe/route.ts`, after the `unsubscribeOutreach` function, add:

```ts
// Weekly-read subscribers (Lane D) carry ?wid=<weekly_read_subscribers.id>. Flip
// status to 'unsubscribed' (the weekly runner's shouldSend then excludes them).
// Best-effort, same contract as the branches above.
async function unsubscribeWeeklyRead(wid: string | null): Promise<void> {
  if (!wid) return;
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("weekly_read_subscribers")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("id", wid);
  } catch {
    // best-effort
  }
}
```

And extend `handle`:

```ts
async function handle(req: NextRequest): Promise<void> {
  const params = new URL(req.url).searchParams;
  await unsubscribe(params.get("id"));
  await unsubscribeOutreach(params.get("rid"));
  await unsubscribeWeeklyRead(params.get("wid"));
}
```

- [ ] **Step 2: Add the webhook branch**

In `app/api/webhooks/resend/route.ts`:

Add the import alongside the existing outreach imports:

```ts
import { extractWeeklyReadAction } from "@/lib/email/weekly-read/webhook";
```

Insert this block immediately BEFORE the `// ── Outreach Increment 2 …` comment (before `const outreachAction = …`). Weekly-read messages carry `wid` (never `rid`), so the two branches can't both match:

```ts
  // ── Weekly-read (Lane D): suppression only ────────────────────────────────
  // A bounce/complaint on a `wid`-tagged send flips the subscriber terminal. The
  // status guard makes it idempotent and never resurrects an unsubscribed row.
  const weeklyAction = extractWeeklyReadAction(event as unknown as ResendWebhookPayload);
  if (weeklyAction) {
    try {
      const wdb = createServiceRoleClient();
      await wdb
        .from("weekly_read_subscribers")
        .update({ status: weeklyAction.suppressTo, updated_at: new Date().toISOString() })
        .eq("id", weeklyAction.wid)
        .eq("status", "active");
    } catch (err) {
      console.error(
        `[resend-webhook] weekly-read suppression failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return NextResponse.json({ ok: true, kind: "weekly-read" }, { status: 200 });
  }
```

- [ ] **Step 3: Verify compile + existing tests still green**

Run: `bunx next build && bun test lib/email/weekly-read`
Expected: build succeeds; all weekly-read tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/unsubscribe/route.ts app/api/webhooks/resend/route.ts
git commit -m "feat(weekly-read): ?wid= unsubscribe branch + webhook bounce/complaint suppression"
```

---

### Task 8: Runner script

**Files:**
- Create: `scripts/email/weekly-read-run.mts`
- Modify: `.gitignore` (add `weekly-read-runs/` next to the existing runs-dir entries — check with `grep -n "outreach-runs" .gitignore` and mirror the style; if absent, add both patterns' style consistently)

**Interfaces:**
- Consumes: Task 2 `shouldSend`/`afterSend`, Task 3 `extractWeeklyReadContent`, Task 4 `renderWeeklyReadEmail`/`UNSUB_TOKEN`, Task 5 `buildWeeklyReadBatches`/`sendWeeklyReadBatches`/`BatchSender`, `loadParsedBrain` from `@/lib/fetch-brain` (reads `brains/*.md` from the repo checkout — no lake creds needed), `resolveZip`, `getMarketingResend` from `@/lib/email/marketing-client`, typed `createServiceRoleClient`.
- Produces: `bun scripts/email/weekly-read-run.mts` — DRY by default; previews + `run-report.json` under `weekly-read-runs/<stamp>/`; live only with `DRY_RUN=false` + `WEEKLY_READ_APPROVED=1` + postal + sender.

- [ ] **Step 1: Implement the runner**

```ts
// scripts/email/weekly-read-run.mts
//
// Weekly-read send runner (Lane D). A standalone Bun process modeled on
// outreach-demo-run.mts's safety ladder:
//   1. DRY_RUN default true (opt OUT with DRY_RUN=false).
//   2. Previews written unconditionally BEFORE any live block: no preview, no send.
//   3. Gate failures SKIP the subscriber (reported, never auto-fixed).
//   4. Live additionally requires WEEKLY_READ_APPROVED=1 + a postal address + a
//      verified From. The agent never sends; live runs are operator commands.
//
// Selects due active subscribers, builds each ZIP's content ONCE from the held
// brains (brains/*.md on disk), renders + gates per subscriber, then (live only)
// sends via resend.batch.send and advances each cursor (+6–8d jittered, issues_sent+1).
//
// Usage:
//   bun scripts/email/weekly-read-run.mts
//   env: DRY_RUN (default true), WEEKLY_READ_APPROVED (must be "1" for live),
//        WEEKLY_READ_POSTAL_ADDRESS (fallback OUTREACH_POSTAL_ADDRESS),
//        WEEKLY_READ_FROM_NAME/WEEKLY_READ_FROM_EMAIL (fallback DIGEST_SENDER_*),
//        WEEKLY_READ_BATCH_LIMIT (default 200), SITE_ORIGIN

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterSend, shouldSend } from "@/lib/email/weekly-read/cadence";
import { extractWeeklyReadContent, type WeeklyReadContent } from "@/lib/email/weekly-read/content";
import { renderWeeklyReadEmail, UNSUB_TOKEN } from "@/lib/email/weekly-read/render";
import {
  buildWeeklyReadBatches,
  sendWeeklyReadBatches,
  type BatchSender,
  type WeeklyReadOutgoing,
} from "@/lib/email/weekly-read/send";
import { loadParsedBrain } from "@/lib/fetch-brain";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { getMarketingResend } from "@/lib/email/marketing-client";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to send
const APPROVED = process.env.WEEKLY_READ_APPROVED === "1";
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com";
const BATCH_LIMIT = Number(process.env.WEEKLY_READ_BATCH_LIMIT ?? "200");
const POSTAL_ADDRESS =
  process.env.WEEKLY_READ_POSTAL_ADDRESS ?? process.env.OUTREACH_POSTAL_ADDRESS;

interface DueRow {
  id: string;
  email: string;
  zip: string;
  status: string;
  next_send_at: string | null;
  issues_sent: number;
}

interface RunRow {
  email: string;
  zip: string;
  outcome: "would_send" | "sent" | "skipped";
  reason?: string;
  subject?: string;
  preview?: string;
}

function weeklyReadFrom(): string {
  const name =
    process.env.WEEKLY_READ_FROM_NAME ?? process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf";
  const email = process.env.WEEKLY_READ_FROM_EMAIL ?? process.env.DIGEST_SENDER_ADDRESS;
  if (!email) {
    throw new Error("WEEKLY_READ_FROM_EMAIL (or DIGEST_SENDER_ADDRESS) required for a live send.");
  }
  return `${name} <${email}>`;
}

/** Mechanical pre-send gates — mirror outreach's bar: unsub token present, subject
 *  non-empty, at least one held stat. Failures skip the subscriber, never auto-fix. */
function preSendGates(html: string, subject: string, content: WeeklyReadContent): string[] {
  const failures: string[] = [];
  if (!html.includes(UNSUB_TOKEN)) failures.push("unsubscribe token missing");
  if (!subject.trim()) failures.push("empty subject");
  if (content.stats.length === 0) failures.push("no held stats");
  return failures;
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  const now = new Date();

  const { data, error } = await db
    .from("weekly_read_subscribers")
    .select("id, email, zip, status, next_send_at, issues_sent")
    .eq("status", "active")
    .order("next_send_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(`select due weekly-read subscribers: ${error.message}`);

  const due = ((data ?? []) as DueRow[]).filter((r) =>
    shouldSend({ status: "active", next_send_at: r.next_send_at }, now),
  );
  console.log(`[weekly-read] ${DRY_RUN ? "DRY_RUN " : ""}${due.length} due · limit=${BATCH_LIMIT}`);

  // Load the held brains ONCE; extract per ZIP once (subscribers share ZIPs).
  const [housing, env] = await Promise.all([
    loadParsedBrain("housing-swfl"),
    loadParsedBrain("env-swfl"),
  ]);
  const contentByZip = new Map<string, WeeklyReadContent | null>();
  function contentFor(zip: string): WeeklyReadContent | null {
    if (!contentByZip.has(zip)) {
      const res = resolveZip(zip);
      const place = res.in_scope
        ? ((res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null)
        : null;
      contentByZip.set(
        zip,
        res.in_scope ? extractWeeklyReadContent(housing, env, zip, place) : null,
      );
    }
    return contentByZip.get(zip) ?? null;
  }

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = join("weekly-read-runs", stamp);
  await mkdir(outDir, { recursive: true });

  const rows: RunRow[] = [];
  const sendable: Array<{ rec: DueRow; out: WeeklyReadOutgoing }> = [];

  for (const rec of due) {
    const content = contentFor(rec.zip);
    if (!content) {
      // No held housing figure for this ZIP (or out-of-scope row) — skip, report,
      // do NOT advance the cursor. Never invented.
      rows.push({ email: rec.email, zip: rec.zip, outcome: "skipped", reason: "no_held_data" });
      continue;
    }

    const { html, subject } = renderWeeklyReadEmail({
      content,
      ctaUrl: `${SITE_ORIGIN.replace(/\/$/, "")}/r/zip-report/${rec.zip}`,
      ...(POSTAL_ADDRESS ? { postalAddress: POSTAL_ADDRESS } : {}),
    });

    // Preview FIRST — unconditionally. No preview, no send.
    const previewName = `${rec.email.replace(/[^a-z0-9]/gi, "_")}-${rec.zip}.html`;
    await writeFile(join(outDir, previewName), html);

    const failures = preSendGates(html, subject, content);
    if (failures.length > 0) {
      rows.push({
        email: rec.email,
        zip: rec.zip,
        outcome: "skipped",
        reason: `gates: ${failures.join(" | ")}`,
        subject,
        preview: previewName,
      });
      continue;
    }

    rows.push({
      email: rec.email,
      zip: rec.zip,
      outcome: DRY_RUN ? "would_send" : "sent",
      subject,
      preview: previewName,
    });
    sendable.push({ rec, out: { subscriberId: rec.id, email: rec.email, subject, html } });
  }

  const summary = {
    due: due.length,
    sendable: sendable.length,
    skipped: rows.filter((r) => r.outcome === "skipped").length,
    zips: contentByZip.size,
  };
  await writeFile(
    join(outDir, "run-report.json"),
    JSON.stringify({ generated_at: now.toISOString(), dry_run: DRY_RUN, summary, rows }, null, 2),
  );

  console.log("\n========================================================================");
  console.log(`RUN REPORT: ${join(outDir, "run-report.json")}`);
  console.log(`SUMMARY: ${JSON.stringify(summary)}`);
  for (const r of rows) {
    console.log(`  ${r.outcome.toUpperCase().padEnd(11)} ${r.zip} ${r.email}`);
    if (r.subject) console.log(`    subject: ${r.subject}`);
    if (r.reason) console.log(`    reason: ${r.reason}`);
  }
  console.log("========================================================================\n");

  if (DRY_RUN) {
    console.log("[weekly-read] DRY_RUN — previews written, nothing sent, nothing mutated.");
    return;
  }

  // ── live send: the operator's approval ladder, refused loudly when incomplete ──
  if (!APPROVED) {
    console.error(
      "[weekly-read] LIVE SEND REFUSED — operator approval required: review the previews, then set WEEKLY_READ_APPROVED=1.",
    );
    process.exit(1);
  }
  if (!POSTAL_ADDRESS) {
    console.error(
      "[weekly-read] LIVE SEND REFUSED — set WEEKLY_READ_POSTAL_ADDRESS (CAN-SPAM).",
    );
    process.exit(1);
  }
  const from = weeklyReadFrom();
  const resend = getMarketingResend();

  const batches = buildWeeklyReadBatches({
    messages: sendable.map((s) => s.out),
    from,
    unsubBase: SITE_ORIGIN,
  });
  const result = await sendWeeklyReadBatches(resend as unknown as BatchSender, batches);
  console.log(`[weekly-read] sent=${result.sent} failed=${result.failed}`);
  for (const e of result.errors) console.error(`  send error: ${e}`);

  // Advance each cursor: next issue 6–8 days out (jittered), issues_sent+1.
  for (const s of sendable) {
    const cursor = afterSend(s.rec.id, now);
    await db
      .from("weekly_read_subscribers")
      .update({
        next_send_at: cursor.next_send_at,
        issues_sent: s.rec.issues_sent + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", s.rec.id);
  }
  console.log(`[weekly-read] advanced ${sendable.length} cadence cursor(s).`);
}

main().catch((err) => {
  console.error(`[weekly-read] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

Known v1 limitation (accepted, mirrors the spec's scope): a batch that Resend reports failed still gets its cursors advanced only for `sendable` as a whole — per-message failure attribution inside a failed chunk isn't tracked. The run report + `failed` count surface it for the operator. Do not build retry machinery in v1.

- [ ] **Step 2: Add the runs dir to .gitignore**

Check: `grep -n "outreach-runs" .gitignore` — add `weekly-read-runs/` in the same style/section (create the line even if `outreach-runs` is absent).

- [ ] **Step 3: DRY smoke run**

Run: `bun scripts/email/weekly-read-run.mts`
Expected: `[weekly-read] DRY_RUN 0 due · limit=200` (table is empty), a `weekly-read-runs/<stamp>/run-report.json` with `"due": 0`, exit 0.

Then a real-shape smoke: insert a test row, re-run DRY, and clean up:

```bash
bun -e "const{readFileSync}=require('fs');const s=readFileSync('.dlt/secrets.toml','utf8');const g=k=>s.match(new RegExp('^'+k+'\\\\s*=\\\\s*\"([^\"]+)\"','m'))[1];const sql=new Bun.SQL('postgres://'+g('username')+':'+encodeURIComponent(g('password'))+'@'+g('host')+':5432/'+g('database')+'?sslmode=require');await sql\`insert into public.weekly_read_subscribers (email, zip, source) values ('dry-smoke@example.com','33914','plan-smoke') on conflict (email) do nothing\`;await sql.end()"
bun scripts/email/weekly-read-run.mts
bun -e "const{readFileSync}=require('fs');const s=readFileSync('.dlt/secrets.toml','utf8');const g=k=>s.match(new RegExp('^'+k+'\\\\s*=\\\\s*\"([^\"]+)\"','m'))[1];const sql=new Bun.SQL('postgres://'+g('username')+':'+encodeURIComponent(g('password'))+'@'+g('host')+':5432/'+g('database')+'?sslmode=require');await sql\`delete from public.weekly_read_subscribers where email='dry-smoke@example.com'\`;await sql.end()"
```

Expected: run 2 shows `1 due`, outcome `WOULD_SEND 33914 dry-smoke@example.com`, a preview HTML containing the three stat labels and the `{{{RESEND_UNSUBSCRIBE_URL}}}` token, and NO raw `SWFL-…` token. Open the preview and eyeball it.

- [ ] **Step 4: Commit**

```bash
git add scripts/email/weekly-read-run.mts .gitignore
git commit -m "feat(weekly-read): DRY-by-default send runner (previews, gates, approval ladder)"
```

---

### Task 9: Capture wiring — DigestSubscribe endpoint prop + zip-report repoint

**Files:**
- Modify: `components/email/DigestSubscribe.tsx` (additive props only — landing/other callers unchanged)
- Modify: `app/r/zip-report/[zip]/page.tsx:718-723` (the `DigestSubscribe` call)

**Interfaces:**
- Consumes: `POST /api/weekly-read/subscribe` (Task 6).
- Produces: `DigestSubscribe` gains `endpoint?: string` (default `"/api/email/subscribe"`) and `doneMessage?: string` (default the current digest copy). The zip-report CTA posts to the weekly-read endpoint — the mislabel the spec found is fixed.

- [ ] **Step 1: Add the props**

In `components/email/DigestSubscribe.tsx`, extend the component signature (existing props unchanged):

```ts
export default function DigestSubscribe({
  source = "landing",
  heading = "Get the free daily SWFL data digest",
  blurb = "ZIP-level prices, permits, and the day's market read — one short email each weekday. Cited, no spam.",
  activation = false,
  presetZip,
  endpoint = "/api/email/subscribe",
  doneMessage = "You're subscribed. Watch for the next weekday digest.",
}: {
  source?: string;
  heading?: string;
  blurb?: string;
  activation?: boolean;
  presetZip?: string;
  /** POST target — the daily digest by default; pass /api/weekly-read/subscribe for the weekly read. */
  endpoint?: string;
  /** Success copy — override when the product isn't the weekday digest. */
  doneMessage?: string;
}) {
```

(Keep the existing doc comments on `activation`/`presetZip` as they are.)

Then replace the hardcoded fetch target:

```ts
      const res = await fetch(endpoint, {
```

And the done-state copy:

```tsx
        <p className="mt-4 text-sm font-medium text-teal-primary">{doneMessage}</p>
```

- [ ] **Step 2: Repoint the zip-report call**

In `app/r/zip-report/[zip]/page.tsx`, the existing call becomes:

```tsx
          <DigestSubscribe
            source="zip-report"
            presetZip={zip}
            endpoint="/api/weekly-read/subscribe"
            heading={`Subscribe to ${zip}'s weekly read`}
            blurb={`A short weekly market read for ${primaryPlace ?? `ZIP ${zip}`}, built and sent by our engine — see it before you build your own.`}
            doneMessage={`You're in — ${zip}'s next weekly read will land in your inbox.`}
          />
```

- [ ] **Step 3: Verify**

Run: `bunx next build && bun test components/email lib/email/weekly-read`
Expected: build succeeds; any existing `DigestSubscribe` helper tests plus all weekly-read tests pass (the pure helpers `activationFieldsVisible`/`buildSubscribeBody` are untouched).

- [ ] **Step 4: Commit**

```bash
git add components/email/DigestSubscribe.tsx "app/r/zip-report/[zip]/page.tsx"
git commit -m "fix(weekly-read): zip-report CTA now enrolls in the weekly read it promises"
```

---

### Task 10: GHA workflow + session bookkeeping

**Files:**
- Create: `.github/workflows/weekly-read.yml`
- Modify: `SESSION_LOG.md` (new top entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync Lane D status)

**Interfaces:**
- Consumes: the runner (Task 8). No new repo secrets — reuses `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`NEXT_PUBLIC_SITE_URL` secrets and `DIGEST_SENDER_*`/`OUTREACH_POSTAL_ADDRESS` vars already wired in `outreach-demo.yml`/`daily-email-digest.yml` (pre-push Gate 3 satisfied: nothing to `gh secret set`).
- Produces: a dispatch-only, DRY-hardcoded workflow. Live sends stay operator-local until the approval gate opens.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/weekly-read.yml
name: Weekly Read Cadence
on:
  # SCHEDULE COMMENTED until the first operator-approved live cycle ships clean
  # (spec: v1 is approval-locked — the content pipeline is new; a human reviews
  # each week's previews before anything reaches real subscribers). Before
  # uncommenting: several clean weeks of operator-local preview → approve → send.
  # NOTE: WEEKLY_READ_APPROVED is deliberately NOT provided by this workflow —
  # even a live cron run would refuse to send until that env is threaded on purpose.
  # schedule:
  #   - cron: "0 13 * * 2" # 13:00 UTC Tuesdays (~9am ET)
  workflow_dispatch:
concurrency:
  group: weekly-read
  cancel-in-progress: false
jobs:
  weekly-read:
    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.14"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run weekly read (DRY)
        env:
          # Hardcoded DRY — v1 live sends are operator-local only (preview → approve → send).
          DRY_RUN: "true"
          SITE_ORIGIN: ${{ secrets.NEXT_PUBLIC_SITE_URL }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          WEEKLY_READ_FROM_NAME: ${{ vars.WEEKLY_READ_FROM_NAME || vars.DIGEST_SENDER_NAME }}
          WEEKLY_READ_FROM_EMAIL: ${{ vars.WEEKLY_READ_FROM_EMAIL || vars.DIGEST_SENDER_ADDRESS }}
          WEEKLY_READ_POSTAL_ADDRESS: ${{ vars.WEEKLY_READ_POSTAL_ADDRESS || vars.OUTREACH_POSTAL_ADDRESS }}
          WEEKLY_READ_BATCH_LIMIT: ${{ vars.WEEKLY_READ_BATCH_LIMIT || '200' }}
        run: bun scripts/email/weekly-read-run.mts
```

Implementer note: before finalizing, mirror how `createServiceRoleClient` actually reads its env (open `utils/supabase/service-role.ts`) — if it expects `NEXT_PUBLIC_SUPABASE_URL`/other names, copy the exact env wiring `outreach-demo.yml` uses, since the demo runner uses the same client and its workflow is the proven precedent.

- [ ] **Step 2: Full verification pass**

Run: `bun test lib/email/weekly-read && bunx next build`
Expected: all weekly-read tests pass; production build succeeds.

- [ ] **Step 3: SESSION_LOG + build queue**

Append a top-of-file `SESSION_LOG.md` entry (what shipped: table, module, endpoints, runner, workflow; what's next: operator runs `weekly_read_live_verify` — a real signup through the zip-report CTA + a manually-approved live send with a working unsubscribe). Sync `_AUDIT_AND_ROADMAP/build-queue.md`'s Lane D line. Do NOT close `weekly_read_live_verify` — it's prod evidence, operator-run.

- [ ] **Step 4: Commit — then STOP (no push)**

```bash
git add .github/workflows/weekly-read.yml SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "feat(weekly-read): approval-locked GHA workflow + session bookkeeping (Lane D)"
git log origin/main..HEAD --oneline
```

Show the log to the operator and ask before pushing (`node scripts/safe-push.mjs`, own commits only — name any foreign commits first).

---

## Self-Review (done at authoring time)

- **Spec coverage:** table ✓ (T1) · cadence ✓ (T2) · content ✓ (T3, adjusted: no permits, matching the operator's Lane B ruling — the spec's "same 3-stat as the hero" claim was stale, live hero still shows permits) · send mechanics ✓ (T5) · cron ✓ (T10) · capture fix ✓ (T6+T9) · unsubscribe ✓ (T7) · digest coexistence ✓ (zero digest files touched) · homepage swap correctly NOT here (Lane B's job — the endpoint + component variant are now available for it).
- **Beyond-spec additions:** webhook `wid` suppression (T5/T7) — the spec's `onEvent` names bounce/complaint transitions but never says who calls them; without the webhook branch they'd be dead code. Smallest honest wiring chosen.
- **Type consistency:** `WeeklyReadContent`/`WeeklyReadStat` (T3) consumed by T4/T8 · `UNSUB_TOKEN` single definition in render.ts, imported by send.ts + runner · `WeeklyReadOutgoing` (T5) produced by runner · `onEvent` (T2) consumed by webhook.ts · statuses `'active'|'unsubscribed'|'bounced'` consistent across SQL, cadence, route, webhook.
- **Known deferred items (v1-accepted):** per-message failure attribution in a failed batch; open/click tracking for this list; `email_events` logging for `wid` sends; homepage placement (Lane B); auto-send (after clean cycles); full deliverable-engine content (D3 "Both" upgrade).

---

## REVISION 07/03/2026 — operator ruling: route through the full deliverable engine

Mid-execution (after Tasks 1–2 landed) the operator answered the content-grain question:
**"route through the full deliverable engine."** This supersedes the light 3-stat default.
Tasks 1, 2, 5, 6, 7, 9, 10 are unchanged. Tasks 3, 4, 8 are replaced as follows.

**Architecture:** per-ZIP engine build, fanned out to subscribers. The runner groups due
subscribers by ZIP; each distinct ZIP gets ONE real engine build per week:
`buildContentDoc` (`lib/email/build-doc.ts` — the ONE Email Lab build root: lake context,
stale-figure web refresh, chart injection, authored-prose lint; `mode:"quality"` = Sonnet,
the tier the scheduled lane runs) on a house seed doc with `scope:{kind:"zip",value}`,
then `renderEmailDocHtml` (the ONE EmailDoc→HTML root), then a weekly-read finalize
(CTA + `ensureUnsubscribeToken` + postal). Fan-out per subscriber stays on Task 5's
`wid`-tagged batch send. Mirrors `buildEmailDocOccurrence` (`lib/email/emaildoc-occurrence.ts`)
with one deliberate inversion: the scheduled lane ships the saved doc when the AI fill
falls through (`applied:false`); weekly-read SKIPS that ZIP instead — an unfilled house
skeleton is not a market read, and a skipped week is honest.

**Cost:** ONE Sonnet quality build per distinct due ZIP per week (≤57 SWFL ZIPs ceiling),
independent of subscriber count. At >25 distinct due ZIPs per window, the PARKED
batch-authoring spec's volume trigger fires (`docs/superpowers/specs/2026-07-02-batch-deliverable-authoring-design.md`
§2) — flip the transport per that spec then; do not re-derive it.

**No paid calls during this build:** `agentsAreMocked()` (no `ANTHROPIC_API_KEY`) runs
`buildContentDoc` in deterministic mock mode — DRY smokes are free. First real build is
the operator's (`weekly_read_live_verify`).

### Task 3R: weekly-read issue module — pure helpers + DI decision core (TDD)

**Files:** Create `lib/email/weekly-read/issue.ts` + `lib/email/weekly-read/issue.test.ts`

**Interfaces:**
- Consumes: `seedById`/`defaultDoc` (`@/lib/email/doc/default-docs`), `EmailDocSchema`,
  `deriveEmailDocSubject` (`@/lib/email/emaildoc-subject`), `ensureUnsubscribeToken`
  (`@/lib/email/scheduler` — shared root, NOT outreach), `BuildScope` (`@/lib/email/build-doc`).
- Produces (Task 8R consumes): `weeklyReadPrompt(zip, place)`, `weeklyReadSeedDoc(): EmailDoc`
  (fresh deep copy each call), `finalizeIssueHtml(html, {ctaUrl, postalAddress?})`,
  `buildWeeklyIssue(zip, place, deps, opts): Promise<{html,subject}|null>` where
  `deps = { buildDoc: (args:{prompt;rawDoc:EmailDoc;scope?:BuildScope}) => Promise<{doc:EmailDoc;applied:boolean}>, renderDoc: (doc:EmailDoc)=>Promise<string> }`
  and `opts = { ctaUrl: string; postalAddress?: string }`. `applied:false` → null (skip).

Tests: prompt names place+ZIP; seed doc schema-valid + copy-isolated; finalize injects
CTA URL + unsubscribe token (idempotent) + postal (only when given), escapes the postal
address; buildWeeklyIssue returns finalized html + non-empty subject on applied:true,
null on applied:false, and passes scope {kind:"zip"} through to deps.buildDoc.

### Task 4R: (absorbed) — the standalone 3-stat renderer is dead

`render.ts`/`content.ts` from the original plan are NOT built. The engine authors and
renders the issue; Task 3R's finalize is the only weekly-read-specific presentation code.

### Task 8R: runner — per-ZIP engine build, per-subscriber fan-out

Same safety ladder, selection, previews, report, approval gates, and cursor advance as
the original Task 8, with the content step replaced: group due subscribers by ZIP →
`buildWeeklyIssue(zip, place, realDeps, opts)` once per distinct ZIP (realDeps =
buildContentDoc mode:"quality" + renderEmailDocHtml, exactly the run-schedules.mts:321-326
seam shape but returning `applied`) → null = every subscriber in that ZIP skipped with
reason "fill_not_applied"/"out_of_scope" → per-subscriber messages reuse the ZIP's html
(send.ts substitutes each wid). Previews: one HTML per distinct ZIP + run-report.json
listing every subscriber outcome. GHA env additionally mirrors email-scheduler.yml's
build-seam vars (ANTHROPIC_API_KEY deliberately OMITTED from weekly-read.yml — DRY cron
previews run mocked; real builds are operator-local with the real key).
