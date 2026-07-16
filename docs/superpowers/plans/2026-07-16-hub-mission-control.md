# Hub Mission-Control Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 13 tasks, 20 files, keywords: migration, refactor, schema

**Goal:** Replace the hub center's grouped project list with a mission-control dashboard — compact send calendar, campaign analysis with a drill-in drawer, and a See/Edit/Update frozen-preview widget — per spec `docs/superpowers/specs/2026-07-16-hub-mission-control-design.md`.

**Architecture:** Two new pure, unit-tested utils (schedule→month expansion reusing `computeNextRunAt`; campaign aggregation over stored `email_events`/`email_blasts`/`email_sends`) feed client cards inside the existing cockpit shell. Selection moves from cockpit-local state to a small client context in the project layout so the rail can drive it once the center list dies. Update is a new doc-lane fork route (supersedes pattern) over `buildContentDoc` — it never sends.

**Tech Stack:** Next.js App Router (RSC + client components), Supabase (cookie client + service-role escalation per the blast-results grammar), bun:test, existing `ChartBlockView` chart root, `EmailPreviewFrame`.

**Check:** `hub_mission_control_live_verify` (already open). **Spec:** `docs/superpowers/specs/2026-07-16-hub-mission-control-design.md`.

## Probe results this plan stands on (RULE 0.5, verified 07/16/2026)

- `email_schedules` / `social_schedules` columns match the spec exactly (`cadence` ∈ daily|weekly|monthly|once, `day_of_week`, `day_of_month`, `send_hour_et`, `next_run_at`, `status`) — `database-generated.types.ts:1299,3417`.
- **Send-identity fork (the spec's mandated probe, answered):** scheduled occurrences re-render the SAME deliverable (`email_schedules.deliverable_id`, block-canvas lane in `lib/email/scheduler.ts` + `lib/email/emaildoc-occurrence.ts`) and go out as Resend **Broadcasts** recorded in `email_sends` (broadcast_id, schedule_id, sent_at) — they write **no did-tagged `email_events`**. Only manual blasts (`app/api/deliverables/[id]/blast`, tags from `lib/email/blast-tags.ts`) produce `email_events` rows (did, user_id, event, created_at, contact_id, variant; unique on (resend_email_id, event) → per-recipient FIRST occurrence of each event only ⇒ all counts are UNIQUE counts).
- **Campaign identity:** `deliverables.campaign_key` (stamped by `lib/campaigns.ts` `campaignKeyForPrompt` for quick-start campaigns; both artifacts of one campaign share it). Group by `campaign_key` when present, else solo per deliverable. Re-blasting one did blends events (documented limitation in `blast-results/route.ts`) — send-over-send therefore compares DIDs within a campaign_key group, never blasts of one did.
- `computeNextRunAt(spec, fromUtc)` (`lib/email/schedule-cadence.ts:153`) is the ONE cadence/DST authority — pure, walks forward, returns first occurrence strictly after `fromUtc`; returns null for `once` (use `next_run_at` directly) and invalid specs. The calendar util iterates it; NO re-derived cadence math.
- Update seam: `buildContentDoc({prompt, rawDoc, scope, mode})` (`lib/email/build-doc.ts:646`) is the ONE Email Lab build root; the cron wrapper (`scripts/email/run-schedules.mts:328-374`) shows the canonical usage incl. `mode: "quality"`, fresh `projects.subject_address`, and `result.payload?.doc ?? rawDoc` fallback. `renderEmailDocHtml` (`lib/email/render-email-doc`) is the ONE EmailDoc→HTML root (used by `/p/[id]`).
- The existing `POST /api/deliverables/[id]/refresh` does NOT serve block-canvas: `assembleDeliverable` never carries `doc` (check `deliverable_refresh_drops_blockcanvas_doc` opened 07/16/2026). Update is a NEW doc-lane route.
- `EmailPreviewFrame({srcDoc})` (`app/p/[id]/EmailPreviewFrame.tsx`) scales a 600px email to its container — reuse as-is.
- `ChartBlockView({block, compact, asOf})` (`components/charts/ChartBlockView.tsx`) renders `ChartBlock` (`refinery/validate/chart-block-lint.mts:46`: title, columns, rows, chart_type bar|area|scatter|table, value_format, asOf ISO, source.citation) — the in-app chart root the drawer reuses.
- Rail rows (`app/project/ProjectsRail.tsx`) currently NAVIGATE on every click; the cockpit's selection lived in the center rows that this build deletes → selection moves to a context (Task 7).
- Research (mission-control setups of successful companies, crawl4ai 07/16/2026): **Stripe Web Dashboard** (docs.stripe.com/dashboard/basics) — Home = "analytics and charts about your business performance" + "surfaces important notifications, like unresolved disputes", widgets customizable; **Shopify admin** (help.shopify.com/en/manual/shopify-admin/shopify-admin-overview) — Home = "real-time metrics such as sales and traffic, as well as task reminders", "highlights urgent actions... Click any of the actions to be directed to the appropriate page." Pattern both share and this layout follows: overview metrics + what-needs-attention, and **every card is a door** (click-through), not a report. Resend webhook event vocabulary re-verified live (resend.com/docs/webhooks/event-types): email.sent/delivered/opened/clicked/bounced/complained/… — our `email_events` CHECK constraint stores sent/delivered/opened/clicked/bounced/unsubscribed, so `email.complained` maps to `unsubscribed` where recorded.

## Global Constraints

- **One-room law** (`one-room` skill): center column only. Rail, ToolSwitcher pills, and aside CHROME untouched — the aside's "Running now" section retires (spec §"One fact, one home") but its container/tones stay. No new container idioms: uppercase tracking labels, `border-white/8` separators, aside tones `bg-[#0f1d24] border-l border-[#0a141a]`.
- **Update never sends, schedules, or alters an active schedule** (automation-trust boundary, round5 research) — it forks a superseded copy and shows it for review. No send affordance is added anywhere in this build (send stays on `/p/[id]` and the lab).
- **No external benchmarks** — deltas only vs the user's OWN average. **No model in any dashboard number or sentence** — all math deterministic in code.
- **No invented curves:** a chart renders only when stored event timestamps support it; otherwise the counts table renders alone.
- **No popovers** on the calendar (clipped-popover lesson 07/16) — a day click filters the under-grid list.
- Every empty state says what will appear there + gives the direct pathway (NN/g, cited in spec).
- As-of dates display MM/DD/YYYY (via `friendlyAsOf` on ChartBlock captions), never a raw token.
- `h-full`/`dvh`, never `h-screen`. Mobile: cards stack single-column.
- Verification floor: `bun test lib/project lib/email` green, `bunx next build` green, live verify per `.claude/skills/verify` before the check closes.
- Deviation from spec, flagged: campaign stats load through a server loader called from the hub page (RSC) instead of a client-hit API route — same pure util, same owner-then-service-role grammar as `blast-results/route.ts`, one fewer moving part; the drawer gets its data in the same payload (no second fetch).
- **Task 12 is operator-gated** (extends the live Resend webhook's write path). Everything else works without it; without it scheduled sends show send dates only (honest degrade).

## File map

| File | Role |
|---|---|
| Create `lib/project/schedule-calendar.ts` + `.test.ts` | Pure month expansion (Task 1) |
| Create `lib/email/campaign-stats.ts` + `.test.ts` | Pure campaign aggregation (Task 2) |
| Modify `lib/email/emaildoc-occurrence.ts` + `lib/email/emaildoc-occurrence.test.ts` | Export `deriveDocBuildArgs` (Task 3) |
| Create `app/api/deliverables/[id]/update-doc/route.ts` | Update fork route (Task 4) |
| Create `app/api/deliverables/[id]/preview-html/route.ts` | Owner-gated doc→HTML for selection switches (Task 5) |
| Create `lib/email/load-campaign-stats.ts` | Server loader (Task 6) |
| Create `app/project/SelectedProjectContext.tsx`; modify `app/project/layout.tsx`, `app/project/ProjectsRail.tsx` | Selection root (Task 7) |
| Create `app/project/_cockpit/CalendarCard.tsx` | Task 8 |
| Create `app/project/_cockpit/CampaignsCard.tsx`, `app/project/_cockpit/CampaignDrawer.tsx` | Task 9 |
| Create `app/project/_cockpit/SelectedProjectCard.tsx` | Task 10 |
| Modify `app/project/_cockpit/ProjectsCockpit.tsx`, `app/project/page.tsx` | Assembly + deletions (Task 11) |
| Modify `lib/email/blast-events.ts` (+ test), `app/api/webhooks/resend/route.ts` | OPERATOR-GATED broadcast events (Task 12) |

---

### Task 1: `lib/project/schedule-calendar.ts` — pure month expansion

**Files:**
- Create: `lib/project/schedule-calendar.ts`
- Test: `lib/project/schedule-calendar.test.ts`

**Interfaces:**
- Consumes: `computeNextRunAt`, `type CadenceSpec, Cadence` from `@/lib/email/schedule-cadence`; `type EmailScheduleRow, SocialScheduleRow` from `@/lib/project/schedule-chips` (both already exported).
- Produces: `expandScheduleMonth(emailSch, socialSch, opts: {year: number; month0: number}): Map<string, MonthSendMark[]>` — keys are ET calendar dates `"YYYY-MM-DD"`; `MonthSendMark = { chipKey: string; kind: "email" | "social" }` where `chipKey` matches `buildScheduleChips` keys (`e${id}` / `s${id}`). Also `etDateISO(d: Date): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/project/schedule-calendar.test.ts
import { describe, expect, test } from "bun:test";
import { expandScheduleMonth, etDateISO } from "./schedule-calendar";
import type { EmailScheduleRow, SocialScheduleRow } from "./schedule-chips";

const email = (over: Partial<EmailScheduleRow>): EmailScheduleRow => ({
  id: 1,
  project_id: "p1",
  status: "active",
  cadence: "weekly",
  day_of_week: 1, // Monday
  day_of_month: null,
  send_hour_et: 8,
  audience_slug: "sphere",
  next_run_at: null,
  deliverable_id: null,
  ...over,
});
const social = (over: Partial<SocialScheduleRow>): SocialScheduleRow => ({
  id: 9,
  project_id: "p1",
  status: "active",
  cadence: "monthly",
  day_of_week: null,
  day_of_month: 15,
  send_hour_et: 9,
  platform: "instagram",
  next_run_at: null,
  ...over,
});

describe("expandScheduleMonth", () => {
  test("weekly Monday lands on every Monday of July 2026 (ET)", () => {
    const days = expandScheduleMonth([email({})], [], { year: 2026, month0: 6 });
    // July 2026 Mondays: 6, 13, 20, 27
    expect([...days.keys()].sort()).toEqual([
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
    expect(days.get("2026-07-06")).toEqual([{ chipKey: "e1", kind: "email" }]);
  });

  test("monthly day 15 yields exactly one mark; paused schedules are excluded", () => {
    const days = expandScheduleMonth([email({ status: "paused" })], [social({})], {
      year: 2026,
      month0: 6,
    });
    expect([...days.keys()]).toEqual(["2026-07-15"]);
    expect(days.get("2026-07-15")).toEqual([{ chipKey: "s9", kind: "social" }]);
  });

  test("monthly day 31 in a 30-day month yields nothing (no invented occurrence)", () => {
    const days = expandScheduleMonth([], [social({ day_of_month: 31 })], {
      year: 2026,
      month0: 5, // June
    });
    expect(days.size).toBe(0);
  });

  test("once uses next_run_at directly, only when it falls in the target month", () => {
    const inMonth = email({ id: 2, cadence: "once", next_run_at: "2026-07-20T12:00:00.000Z" });
    const outMonth = email({ id: 3, cadence: "once", next_run_at: "2026-08-02T12:00:00.000Z" });
    const days = expandScheduleMonth([inMonth, outMonth], [], { year: 2026, month0: 6 });
    expect([...days.keys()]).toEqual(["2026-07-20"]);
    expect(days.get("2026-07-20")).toEqual([{ chipKey: "e2", kind: "email" }]);
  });

  test("daily across the November 2026 DST fall-back covers every calendar day once", () => {
    const days = expandScheduleMonth([email({ cadence: "daily", day_of_week: null })], [], {
      year: 2026,
      month0: 10,
    });
    expect(days.size).toBe(30); // November has 30 days; DST day never doubles or drops
  });

  test("etDateISO renders the ET calendar date of a UTC instant", () => {
    // 2026-07-07T02:30Z is still 07/06 22:30 in ET (EDT, UTC-4)
    expect(etDateISO(new Date("2026-07-07T02:30:00.000Z"))).toBe("2026-07-06");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/project/schedule-calendar.test.ts`
Expected: FAIL — `Cannot find module './schedule-calendar'`.

- [ ] **Step 3: Implement**

```ts
// lib/project/schedule-calendar.ts
/**
 * Deterministic expansion of email/social schedule rows into the ET calendar
 * days of ONE visible month — the hub calendar card's data shape. Cadence/DST
 * math is NOT re-derived here: recurring cadences iterate the ONE shared
 * authority `computeNextRunAt` (lib/email/schedule-cadence); `once` rows read
 * their explicitly-set next_run_at. Pure; no Supabase, no Date.now().
 */
import { computeNextRunAt, type CadenceSpec } from "@/lib/email/schedule-cadence";
import type { EmailScheduleRow, SocialScheduleRow } from "@/lib/project/schedule-chips";

export interface MonthSendMark {
  /** Matches buildScheduleChips keys (`e${id}` / `s${id}`) so the UI joins a
   *  mark back to its chip's line + href without re-deriving either. */
  chipKey: string;
  kind: "email" | "social";
}

const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The ET calendar date ("YYYY-MM-DD") of a UTC instant. */
export function etDateISO(d: Date): string {
  return ET_DATE.format(d); // en-CA formats as YYYY-MM-DD
}

interface CommonRow {
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  next_run_at: string | null;
}

/** Occurrence ET dates of one schedule row inside the target month. */
function rowDatesInMonth(row: CommonRow, year: number, month0: number): string[] {
  if (row.status !== "active") return [];
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}-`;

  if (row.cadence === "once") {
    if (!row.next_run_at) return [];
    const date = etDateISO(new Date(row.next_run_at));
    return date.startsWith(prefix) ? [date] : [];
  }

  const spec: CadenceSpec = {
    cadence: row.cadence as CadenceSpec["cadence"],
    day_of_week: row.day_of_week,
    day_of_month: row.day_of_month,
    send_hour_et: row.send_hour_et,
  };
  // Start 48h before the month's first UTC midnight so the ET/UTC offset can
  // never hide a day-1 occurrence; computeNextRunAt walks strictly forward.
  let cursor = new Date(Date.UTC(year, month0, 1) - 48 * 3_600_000);
  const dates: string[] = [];
  for (let i = 0; i < 100; i++) {
    const next = computeNextRunAt(spec, cursor);
    if (!next) break; // invalid spec (or a cadence with no occurrence) — stop
    const date = etDateISO(next);
    if (date > `${prefix}31`) break; // walked past the month
    if (date.startsWith(prefix)) dates.push(date);
    cursor = next;
  }
  return dates;
}

export function expandScheduleMonth(
  emailSch: EmailScheduleRow[],
  socialSch: SocialScheduleRow[],
  opts: { year: number; month0: number },
): Map<string, MonthSendMark[]> {
  const days = new Map<string, MonthSendMark[]>();
  const add = (date: string, mark: MonthSendMark) => {
    const list = days.get(date) ?? [];
    list.push(mark);
    days.set(date, list);
  };
  for (const s of emailSch) {
    for (const date of rowDatesInMonth(s, opts.year, opts.month0)) {
      add(date, { chipKey: `e${s.id}`, kind: "email" });
    }
  }
  for (const s of socialSch) {
    for (const date of rowDatesInMonth(s, opts.year, opts.month0)) {
      add(date, { chipKey: `s${s.id}`, kind: "social" });
    }
  }
  return days;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/project/schedule-calendar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/project/schedule-calendar.ts lib/project/schedule-calendar.test.ts
git commit -m "feat(hub): pure schedule->calendar month expansion on computeNextRunAt"
```

---

### Task 2: `lib/email/campaign-stats.ts` — pure campaign aggregation

**Files:**
- Create: `lib/email/campaign-stats.ts`
- Test: `lib/email/campaign-stats.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure).
- Produces (Tasks 6, 9, 11 rely on these exact names):

```ts
export interface CampaignRow {
  key: string;              // deliverables.campaign_key, else `did:${id}`
  label: string;
  projectId: string | null;
  dids: string[];
  lastSentAt: string | null; // ISO
  sendCount: number;         // blast + scheduled occurrences
  delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number;
  openPct: number | null;    // opened/delivered ×100, 1 decimal; null when delivered=0
  clickPct: number | null;
  deltaOpenVsAvg: number | null; // percentage points vs ownAvgOpenPct
  hourBuckets: { label: string; opens: number; clicks: number }[] | null; // 6×4h after latest blast; null if unsupported
  sendOverSend: { label: string; openPct: number }[]; // per did with delivered>0, chronological
  asOf: string | null;       // ISO date (YYYY-MM-DD) of newest event/send seen
}
export interface CampaignStats {
  campaigns: CampaignRow[];  // lastSentAt desc
  ownAvgOpenPct: number | null;
  strongest: string | null;  // deterministic plain-language line
}
export function campaignStats(input: {
  blasts: { deliverable_id: string; sent_at: string | null }[];        // status=sent only
  deliverables: { id: string; project_id: string; campaign_key: string | null; instruction: string | null }[];
  events: { did: string | null; event: string; created_at: string }[]; // this user's rows
  scheduledSends: { sent_at: string; deliverable_id: string | null }[]; // email_sends joined to schedules
}): CampaignStats
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/campaign-stats.test.ts
import { describe, expect, test } from "bun:test";
import { campaignStats } from "./campaign-stats";

const D = (id: string, campaign_key: string | null, instruction = "Weekly Naples update") => ({
  id,
  project_id: "p1",
  campaign_key,
  instruction,
});
const E = (did: string, event: string, created_at: string) => ({ did, event, created_at });

describe("campaignStats", () => {
  test("rates are unique-count/delivered; solo deliverable keys as did:<id>", () => {
    const s = campaignStats({
      blasts: [{ deliverable_id: "d1", sent_at: "2026-07-10T14:00:00Z" }],
      deliverables: [D("d1", null)],
      events: [
        E("d1", "delivered", "2026-07-10T14:01:00Z"),
        E("d1", "delivered", "2026-07-10T14:01:10Z"),
        E("d1", "delivered", "2026-07-10T14:01:20Z"),
        E("d1", "delivered", "2026-07-10T14:01:30Z"),
        E("d1", "opened", "2026-07-10T15:00:00Z"),
        E("d1", "opened", "2026-07-10T20:00:00Z"),
        E("d1", "clicked", "2026-07-10T15:05:00Z"),
      ],
      scheduledSends: [],
    });
    const row = s.campaigns[0];
    expect(row.key).toBe("did:d1");
    expect(row.delivered).toBe(4);
    expect(row.openPct).toBe(50);
    expect(row.clickPct).toBe(25);
    expect(row.sendCount).toBe(1);
    expect(row.asOf).toBe("2026-07-10");
  });

  test("campaign_key groups dids; sendOverSend is chronological per did", () => {
    const s = campaignStats({
      blasts: [
        { deliverable_id: "d1", sent_at: "2026-07-01T14:00:00Z" },
        { deliverable_id: "d2", sent_at: "2026-07-08T14:00:00Z" },
      ],
      deliverables: [D("d1", "market-update"), D("d2", "market-update")],
      events: [
        E("d1", "delivered", "2026-07-01T14:01:00Z"),
        E("d1", "opened", "2026-07-01T15:00:00Z"),
        E("d2", "delivered", "2026-07-08T14:01:00Z"),
        E("d2", "delivered", "2026-07-08T14:01:05Z"),
        E("d2", "opened", "2026-07-08T15:00:00Z"),
      ],
      scheduledSends: [],
    });
    expect(s.campaigns).toHaveLength(1);
    const row = s.campaigns[0];
    expect(row.key).toBe("market-update");
    expect(row.dids).toEqual(["d1", "d2"]);
    expect(row.sendOverSend.map((x) => x.openPct)).toEqual([100, 50]);
    expect(row.delivered).toBe(3);
  });

  test("hourBuckets: 6×4h unique opens/clicks after the LATEST blast; empty events → null buckets", () => {
    const s = campaignStats({
      blasts: [{ deliverable_id: "d1", sent_at: "2026-07-10T00:00:00Z" }],
      deliverables: [D("d1", null)],
      events: [
        E("d1", "delivered", "2026-07-10T00:01:00Z"),
        E("d1", "opened", "2026-07-10T01:00:00Z"), // bucket 0 (0–4h)
        E("d1", "opened", "2026-07-10T13:00:00Z"), // bucket 3 (12–16h)
        E("d1", "clicked", "2026-07-10T05:00:00Z"), // bucket 1
        E("d1", "opened", "2026-07-12T09:00:00Z"), // >24h — excluded
      ],
      scheduledSends: [],
    });
    const b = s.campaigns[0].hourBuckets!;
    expect(b).toHaveLength(6);
    expect(b[0]).toEqual({ label: "0–4h", opens: 1, clicks: 0 });
    expect(b[1].clicks).toBe(1);
    expect(b[3].opens).toBe(1);
    const empty = campaignStats({
      blasts: [{ deliverable_id: "d9", sent_at: "2026-07-10T00:00:00Z" }],
      deliverables: [D("d9", null)],
      events: [],
      scheduledSends: [],
    });
    expect(empty.campaigns[0].hourBuckets).toBeNull();
  });

  test("scheduled sends count as occurrences without inventing stats", () => {
    const s = campaignStats({
      blasts: [],
      deliverables: [D("d1", null)],
      events: [],
      scheduledSends: [{ sent_at: "2026-07-14T12:00:00Z", deliverable_id: "d1" }],
    });
    const row = s.campaigns[0];
    expect(row.sendCount).toBe(1);
    expect(row.lastSentAt).toBe("2026-07-14T12:00:00Z");
    expect(row.openPct).toBeNull(); // delivered 0 → null, never 0/0 invented
  });

  test("strongest needs ≥2 sends and ≥5 delivered; deltaOpenVsAvg is points vs own average", () => {
    const mk = (did: string, key: string, opens: number, sentDay: number) => ({
      blasts: [{ deliverable_id: did, sent_at: `2026-07-0${sentDay}T14:00:00Z` }],
      deliverables: [D(did, key, key)],
      events: [
        ...Array.from({ length: 10 }, (_, i) =>
          E(did, "delivered", `2026-07-0${sentDay}T14:01:0${i > 8 ? 9 : i}.${i}00Z`),
        ),
        ...Array.from({ length: opens }, (_, i) => E(did, "opened", `2026-07-0${sentDay}T15:0${i}:00Z`)),
      ],
      scheduledSends: [],
    });
    const a = mk("d1", "newsletter", 6, 1);
    const b = mk("d2", "newsletter", 6, 2);
    const c = mk("d3", "just-sold", 2, 3);
    const s = campaignStats({
      blasts: [...a.blasts, ...b.blasts, ...c.blasts],
      deliverables: [...a.deliverables, ...b.deliverables, ...c.deliverables],
      events: [...a.events, ...b.events, ...c.events],
      scheduledSends: [],
    });
    // newsletter: 12/20 = 60% over 2 sends; just-sold: 2/10 = 20% over 1 send (below floor)
    expect(s.strongest).toBe('"newsletter" is your strongest open rate (60% over 2 sends)');
    expect(s.ownAvgOpenPct).toBeCloseTo(46.7, 1); // 14/30
    const news = s.campaigns.find((r) => r.key === "newsletter")!;
    expect(news.deltaOpenVsAvg).toBeCloseTo(13.3, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/campaign-stats.test.ts`
Expected: FAIL — `Cannot find module './campaign-stats'`.

- [ ] **Step 3: Implement**

```ts
// lib/email/campaign-stats.ts
/**
 * Pure aggregation of STORED send/engagement rows into the hub Campaigns card.
 * Every number is a count over email_events rows (unique per recipient message
 * by the DB dedupe index) or a ratio of two such counts — nothing modeled,
 * nothing external. Campaign identity: deliverables.campaign_key groups the
 * artifacts a quick-start campaign saved together; a keyless deliverable is
 * its own campaign. Scheduled broadcast occurrences (email_sends) carry send
 * dates but no per-recipient events (probe 07/16/2026) — they add sendCount,
 * never invented rates. Pure; no Supabase, no Date.now().
 */

export interface CampaignRow {
  key: string;
  label: string;
  projectId: string | null;
  dids: string[];
  lastSentAt: string | null;
  sendCount: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openPct: number | null;
  clickPct: number | null;
  deltaOpenVsAvg: number | null;
  hourBuckets: { label: string; opens: number; clicks: number }[] | null;
  sendOverSend: { label: string; openPct: number }[];
  asOf: string | null;
}

export interface CampaignStats {
  campaigns: CampaignRow[];
  ownAvgOpenPct: number | null;
  strongest: string | null;
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

const BUCKET_LABELS = ["0–4h", "4–8h", "8–12h", "12–16h", "16–20h", "20–24h"];
/** strongest-line floors — deterministic, documented: a 1-send or tiny-list
 *  campaign can't be crowned on noise. */
const STRONGEST_MIN_SENDS = 2;
const STRONGEST_MIN_DELIVERED = 5;

export function campaignStats(input: {
  blasts: { deliverable_id: string; sent_at: string | null }[];
  deliverables: { id: string; project_id: string; campaign_key: string | null; instruction: string | null }[];
  events: { did: string | null; event: string; created_at: string }[];
  scheduledSends: { sent_at: string; deliverable_id: string | null }[];
}): CampaignStats {
  const delivById = new Map(input.deliverables.map((d) => [d.id, d]));

  // Per-did event tallies + raw open/click timestamps (for buckets).
  const tally = new Map<
    string,
    { counts: Record<string, number>; opens: string[]; clicks: string[] }
  >();
  for (const e of input.events) {
    if (!e.did || !delivById.has(e.did)) continue;
    const t = tally.get(e.did) ?? { counts: {}, opens: [], clicks: [] };
    t.counts[e.event] = (t.counts[e.event] ?? 0) + 1;
    if (e.event === "opened") t.opens.push(e.created_at);
    if (e.event === "clicked") t.clicks.push(e.created_at);
    tally.set(e.did, t);
  }

  // Group dids into campaigns.
  const groups = new Map<string, string[]>();
  for (const d of input.deliverables) {
    const key = d.campaign_key ?? `did:${d.id}`;
    const list = groups.get(key) ?? [];
    list.push(d.id);
    groups.set(key, list);
  }

  // Send occurrences per did.
  const sendsByDid = new Map<string, string[]>();
  const addSend = (did: string | null, at: string | null) => {
    if (!did || !at || !delivById.has(did)) return;
    const list = sendsByDid.get(did) ?? [];
    list.push(at);
    sendsByDid.set(did, list);
  };
  for (const b of input.blasts) addSend(b.deliverable_id, b.sent_at);
  for (const s of input.scheduledSends) addSend(s.deliverable_id, s.sent_at);

  const campaigns: CampaignRow[] = [];
  let totalOpened = 0;
  let totalDelivered = 0;

  for (const [key, dids] of groups) {
    const sends = dids.flatMap((did) => sendsByDid.get(did) ?? []).sort();
    if (sends.length === 0 && dids.every((did) => !tally.has(did))) continue; // never sent → not a campaign row
    const count = (ev: string) =>
      dids.reduce((n, did) => n + (tally.get(did)?.counts[ev] ?? 0), 0);
    const delivered = count("delivered");
    const opened = count("opened");
    totalOpened += opened;
    totalDelivered += delivered;

    // 24h buckets after the LATEST blast occurrence of the campaign's latest did.
    const latestBlast = input.blasts
      .filter((b) => dids.includes(b.deliverable_id) && b.sent_at)
      .map((b) => b.sent_at as string)
      .sort()
      .at(-1);
    let hourBuckets: CampaignRow["hourBuckets"] = null;
    if (latestBlast) {
      const t0 = Date.parse(latestBlast);
      const buckets = BUCKET_LABELS.map((label) => ({ label, opens: 0, clicks: 0 }));
      let any = false;
      for (const did of dids) {
        const t = tally.get(did);
        for (const [list, field] of [
          [t?.opens ?? [], "opens"],
          [t?.clicks ?? [], "clicks"],
        ] as const) {
          for (const at of list) {
            const h = (Date.parse(at) - t0) / 3_600_000;
            if (h >= 0 && h < 24) {
              buckets[Math.floor(h / 4)][field] += 1;
              any = true;
            }
          }
        }
      }
      hourBuckets = any ? buckets : null;
    }

    // Send-over-send: one point per did that has deliveries, in first-send order.
    const sendOverSend = dids
      .map((did) => {
        const c = tally.get(did)?.counts ?? {};
        const p = pct(c["opened"] ?? 0, c["delivered"] ?? 0);
        const at = (sendsByDid.get(did) ?? []).sort()[0] ?? "";
        return p === null ? null : { at, label: at.slice(5, 10).replace("-", "/"), openPct: p };
      })
      .filter((x): x is { at: string; label: string; openPct: number } => x !== null)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .map(({ label, openPct }) => ({ label, openPct }));

    const newest = [...sends, ...dids.flatMap((d) => tally.get(d)?.opens ?? [])].sort().at(-1);
    const first = delivById.get(dids[0]);
    campaigns.push({
      key,
      label: (first?.instruction ?? "").trim().slice(0, 60) || key.replace(/^did:/, "Campaign "),
      projectId: first?.project_id ?? null,
      dids,
      lastSentAt: sends.at(-1) ?? null,
      sendCount: sends.length,
      delivered,
      opened,
      clicked: count("clicked"),
      bounced: count("bounced"),
      unsubscribed: count("unsubscribed"),
      openPct: pct(opened, delivered),
      clickPct: pct(count("clicked"), delivered),
      deltaOpenVsAvg: null, // filled after ownAvg below
      hourBuckets,
      sendOverSend,
      asOf: newest ? newest.slice(0, 10) : null,
    });
  }

  const ownAvgOpenPct = pct(totalOpened, totalDelivered);
  for (const row of campaigns) {
    row.deltaOpenVsAvg =
      row.openPct !== null && ownAvgOpenPct !== null
        ? Math.round((row.openPct - ownAvgOpenPct) * 10) / 10
        : null;
  }
  campaigns.sort((a, b) => ((a.lastSentAt ?? "") < (b.lastSentAt ?? "") ? 1 : -1));

  const eligible = campaigns.filter(
    (r) =>
      r.sendCount >= STRONGEST_MIN_SENDS &&
      r.delivered >= STRONGEST_MIN_DELIVERED &&
      r.openPct !== null,
  );
  const top = eligible.sort((a, b) => (b.openPct ?? 0) - (a.openPct ?? 0))[0];
  const strongest = top
    ? `"${top.label}" is your strongest open rate (${Math.round(top.openPct ?? 0)}% over ${top.sendCount} sends)`
    : null;

  return { campaigns, ownAvgOpenPct, strongest };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/campaign-stats.test.ts`
Expected: PASS (5 tests). If the strongest-line or rounding assertions fail, fix the implementation (the test values are hand-computed: 12/20=60%, 14/30=46.7%).

- [ ] **Step 5: Commit**

```bash
git add lib/email/campaign-stats.ts lib/email/campaign-stats.test.ts
git commit -m "feat(hub): pure campaign aggregation over stored email events"
```

---

### Task 3: export `deriveDocBuildArgs` from `emaildoc-occurrence.ts`

The Update route (Task 4) needs the SAME scope/prompt derivation the cron lane uses. Extract it — one authority, no copy.

**Files:**
- Modify: `lib/email/emaildoc-occurrence.ts:86-97` (the scope/prompt block inside `buildEmailDocOccurrence`)
- Test: `lib/email/emaildoc-occurrence.test.ts` (append)

**Interfaces:**
- Produces: `deriveDocBuildArgs(deliv: Pick<EmailDocDeliverable, "instruction" | "scope_kind" | "scope_value" | "subject_address">): { prompt: string; scope?: BuildScope }` — exported alongside the existing `refreshPrompt`.
- `buildEmailDocOccurrence` behavior unchanged (its tests keep passing).

- [ ] **Step 1: Write the failing test (append to `lib/email/emaildoc-occurrence.test.ts`)**

```ts
import { deriveDocBuildArgs } from "./emaildoc-occurrence";

describe("deriveDocBuildArgs", () => {
  test("stored instruction + scope + address ride through", () => {
    const args = deriveDocBuildArgs({
      instruction: "  Weekly Naples update  ",
      scope_kind: "zip",
      scope_value: "34102",
      subject_address: " 123 Gulf Shore Blvd ",
    });
    expect(args.prompt).toBe("Weekly Naples update");
    expect(args.scope).toEqual({ kind: "zip", value: "34102", address: "123 Gulf Shore Blvd" });
  });

  test("no instruction → neutral refresh prompt; no scope_value → undefined scope", () => {
    const args = deriveDocBuildArgs({
      instruction: null,
      scope_kind: null,
      scope_value: null,
      subject_address: null,
    });
    expect(args.scope).toBeUndefined();
    expect(args.prompt).toBe(
      "Refresh this email with the latest Southwest Florida market data.",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/emaildoc-occurrence.test.ts`
Expected: FAIL — `deriveDocBuildArgs` is not exported.

- [ ] **Step 3: Implement the extraction**

Add to `lib/email/emaildoc-occurrence.ts` (below `refreshPrompt`), and replace the inline block in `buildEmailDocOccurrence` (currently the `address`/`scope`/`stored`/`prompt` consts) with a call to it:

```ts
/** Scope + prompt off the DELIVERABLE row — the ONE derivation the cron lane
 *  and the hub Update route share. A whole-region design has undefined scope;
 *  a stored instruction is the build prompt, else a neutral refresh. */
export function deriveDocBuildArgs(
  deliv: Pick<EmailDocDeliverable, "instruction" | "scope_kind" | "scope_value" | "subject_address">,
): { prompt: string; scope?: BuildScope } {
  const address =
    typeof deliv.subject_address === "string" && deliv.subject_address.trim()
      ? deliv.subject_address.trim()
      : undefined;
  const scope: BuildScope | undefined =
    typeof deliv.scope_kind === "string" &&
    typeof deliv.scope_value === "string" &&
    deliv.scope_value
      ? { kind: deliv.scope_kind, value: deliv.scope_value, ...(address ? { address } : {}) }
      : undefined;
  const stored = typeof deliv.instruction === "string" ? deliv.instruction.trim() : "";
  return { prompt: stored || refreshPrompt(scope), scope };
}
```

In `buildEmailDocOccurrence`, the block becomes:

```ts
  const { prompt, scope } = deriveDocBuildArgs(deliv);
```

- [ ] **Step 4: Run the whole file's tests**

Run: `bun test lib/email/emaildoc-occurrence.test.ts`
Expected: PASS — new tests AND all pre-existing occurrence tests (behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/email/emaildoc-occurrence.ts lib/email/emaildoc-occurrence.test.ts
git commit -m "refactor(email): extract deriveDocBuildArgs - one scope/prompt authority for cron + update"
```

---

### Task 4: `POST /api/deliverables/[id]/update-doc` — the Update fork

**Files:**
- Create: `app/api/deliverables/[id]/update-doc/route.ts`

**Interfaces:**
- Consumes: `deriveDocBuildArgs` (Task 3), `buildContentDoc` (`@/lib/email/build-doc`), `EmailDocSchema` (`@/lib/email/doc/schema`).
- Produces: `POST → { id: string }` (the NEW superseding deliverable id) — Task 10's Update button calls this. Errors: 401/403/404/409 (deleted)/422 (not block-canvas or invalid doc).

- [ ] **Step 1: Implement the route**

```ts
// app/api/deliverables/[id]/update-doc/route.ts
//
// POST — the hub Selected-project widget's UPDATE verb: re-run the ONE Email
// Lab build root (buildContentDoc) against this saved block-canvas doc with
// TODAY's data, and fork the result as a NEW row (supersedes_id = [id]) for
// review. This route NEVER sends, never schedules, never touches an active
// schedule (the schedule keeps its own deliverable_id and re-fills fresh at
// each occurrence anyway) — the automation-trust boundary is structural.
// The generic /refresh route can't serve this lane: assembleDeliverable never
// carries `doc` (check deliverable_refresh_drops_blockcanvas_doc).
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { buildContentDoc } from "@/lib/email/build-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { deriveDocBuildArgs } from "@/lib/email/emaildoc-occurrence";
import type { EmailDoc } from "@/lib/email/doc/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: src } = await supabase
    .from("deliverables")
    .select(
      "user_id, project_id, template, instruction, narrative, items_snapshot, branding, scope_kind, scope_value, campaign_key, doc, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (src.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (src.deleted_at) return NextResponse.json({ error: "deleted" }, { status: 409 });
  if (src.template !== "block-canvas")
    return NextResponse.json({ error: "not a lab email" }, { status: 422 });

  const parsed = EmailDocSchema.safeParse(src.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 422 });

  // Address spine, read FRESH like the cron lane (run-schedules.mts) does.
  const { data: proj } = await supabase
    .from("projects")
    .select("subject_address")
    .eq("id", src.project_id)
    .maybeSingle();

  const { prompt, scope } = deriveDocBuildArgs({
    instruction: src.instruction,
    scope_kind: src.scope_kind,
    scope_value: src.scope_value,
    subject_address: (proj?.subject_address as string | null) ?? null,
  });
  // Same mode the scheduler uses: content fill only, never a restyle; a fill
  // that doesn't apply ships the saved doc unchanged, never a blank.
  const result = await buildContentDoc({ prompt, rawDoc: parsed.data, scope, mode: "quality" });
  const freshDoc = (result.payload?.doc as EmailDoc | undefined) ?? parsed.data;

  const db = createServiceRoleClient();
  const newId = crypto.randomUUID();
  const { error: insErr } = await db.from("deliverables").insert({
    id: newId,
    project_id: src.project_id,
    user_id: user.id,
    template: "block-canvas",
    instruction: src.instruction,
    narrative: src.narrative,
    items_snapshot: src.items_snapshot,
    branding: src.branding,
    status: "ready",
    scope_kind: src.scope_kind,
    scope_value: src.scope_value,
    campaign_key: src.campaign_key,
    supersedes_id: id,
    doc: freshDoc,
    data_as_of: new Date().toISOString(),
  });
  if (insErr) return NextResponse.json({ error: "write failed" }, { status: 500 });
  return NextResponse.json({ id: newId });
}
```

- [ ] **Step 2: Typecheck via build**

Run: `bunx next build`
Expected: compiles. (If `buildContentDoc`'s `mode` arg rejects `"quality"`, read `BuildArgs` in `lib/email/build-doc.ts` and use its exact literal — the cron runner passes `"quality"` at `scripts/email/run-schedules.mts:79`, so this should already conform.)

- [ ] **Step 3: Commit**

```bash
git add "app/api/deliverables/[id]/update-doc/route.ts"
git commit -m "feat(hub): update-doc route - doc-lane supersedes fork, review-only, never sends"
```

---

### Task 5: `GET /api/deliverables/[id]/preview-html` — frozen preview on selection change

**Files:**
- Create: `app/api/deliverables/[id]/preview-html/route.ts`

**Interfaces:**
- Consumes: `renderEmailDocHtml` (`@/lib/email/render-email-doc`), `EmailDocSchema`.
- Produces: `GET → { html: string }` — Task 10 fetches this when the selection (or the Update fork) changes. Errors: 401/403/404/422.

- [ ] **Step 1: Implement**

```ts
// app/api/deliverables/[id]/preview-html/route.ts
//
// Owner-gated EmailDoc→HTML for the hub's Selected-project frozen preview.
// Renders through the ONE EmailDoc→HTML root (renderEmailDocHtml) — the same
// bytes /p/[id] and the blast path produce. Read-only; no writes.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("deliverables")
    .select("user_id, template, doc, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (data.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (data.deleted_at || data.template !== "block-canvas")
    return NextResponse.json({ error: "no preview" }, { status: 422 });

  const parsed = EmailDocSchema.safeParse(data.doc);
  if (!parsed.success) return NextResponse.json({ error: "invalid doc" }, { status: 422 });
  const html = await renderEmailDocHtml(parsed.data);
  return NextResponse.json({ html });
}
```

- [ ] **Step 2: Typecheck via build** — `bunx next build`, expected green.

- [ ] **Step 3: Commit**

```bash
git add "app/api/deliverables/[id]/preview-html/route.ts"
git commit -m "feat(hub): owner-gated preview-html route through the one EmailDoc render root"
```

---

### Task 6: `lib/email/load-campaign-stats.ts` — server loader

**Files:**
- Create: `lib/email/load-campaign-stats.ts`

**Interfaces:**
- Consumes: `campaignStats`, `type CampaignStats` (Task 2).
- Produces: `loadCampaignStats(userClient: SupabaseClient<Database>, userId: string): Promise<CampaignStats>` — Task 11's page calls it. Ownership grammar mirrors `blast-results/route.ts`: user-scoped cookie client proves ownership of blasts/deliverables/schedules; ONLY the `email_events`/`email_sends` reads escalate to service-role, filtered `.eq("user_id", userId)`.

- [ ] **Step 1: Implement**

```ts
// lib/email/load-campaign-stats.ts
//
// Thin server loader for the hub Campaigns card: fetch the user's stored
// send/engagement rows and hand them to the pure aggregator. email_events RLS
// (migrations/20260628_email_events.sql) grants SELECT to service_role ONLY —
// ownership is proven by the cookie-scoped queries first, the escalated reads
// stay .eq(user_id) — the exact blast-results/route.ts grammar.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { campaignStats, type CampaignStats } from "@/lib/email/campaign-stats";

export async function loadCampaignStats(
  userClient: SupabaseClient<Database>,
  userId: string,
): Promise<CampaignStats> {
  const [{ data: blasts }, { data: schedules }] = await Promise.all([
    userClient
      .from("email_blasts")
      .select("deliverable_id, sent_at")
      .eq("user_id", userId)
      .eq("status", "sent"),
    userClient.from("email_schedules").select("id, deliverable_id").eq("user_id", userId),
  ]);

  const db = createServiceRoleClient();
  const [{ data: events }, { data: sends }] = await Promise.all([
    db
      .from("email_events")
      .select("did, event, created_at")
      .eq("user_id", userId)
      .not("did", "is", null),
    db.from("email_sends").select("schedule_id, sent_at").eq("user_id", userId),
  ]);

  const didBySchedule = new Map(
    (schedules ?? []).map((s) => [s.id as number, (s.deliverable_id as string | null) ?? null]),
  );
  const scheduledSends = (sends ?? []).flatMap((s) =>
    s.schedule_id != null && didBySchedule.get(s.schedule_id as number)
      ? [{ sent_at: s.sent_at as string, deliverable_id: didBySchedule.get(s.schedule_id as number)! }]
      : [],
  );

  const dids = [
    ...new Set([
      ...(blasts ?? []).map((b) => b.deliverable_id as string),
      ...scheduledSends.map((s) => s.deliverable_id!),
    ]),
  ];
  const { data: deliverables } = dids.length
    ? await userClient
        .from("deliverables")
        .select("id, project_id, campaign_key, instruction")
        .in("id", dids)
    : { data: [] as never[] };

  return campaignStats({
    blasts: (blasts ?? []) as { deliverable_id: string; sent_at: string | null }[],
    deliverables: (deliverables ?? []) as {
      id: string;
      project_id: string;
      campaign_key: string | null;
      instruction: string | null;
    }[],
    events: (events ?? []) as { did: string | null; event: string; created_at: string }[],
    scheduledSends,
  });
}
```

- [ ] **Step 2: Typecheck via build** — `bunx next build`, expected green. If `email_blasts` or `email_sends` are missing from `Database` types, regenerate (`scripts/gen-supabase-types.ts`) or fall back to `createServiceRoleClientUntyped` with a `KNOWN-DEBT` comment matching the webhook's existing pattern.

- [ ] **Step 3: Commit**

```bash
git add lib/email/load-campaign-stats.ts
git commit -m "feat(hub): campaign-stats server loader, blast-results escalation grammar"
```

---

### Task 7: selection root — context + rail select-in-place on the hub

**Files:**
- Create: `app/project/SelectedProjectContext.tsx`
- Modify: `app/project/layout.tsx` (wrap provider), `app/project/ProjectsRail.tsx` (hub select behavior)

**Interfaces:**
- Produces: `SelectedProjectProvider({ initialId, children })`, `useSelectedProject(): { selectedId: string | null; setSelectedId: (id: string) => void } | null` (null off-provider) — Tasks 10/11 consume.
- Rail behavior: on `/project` (the hub) at ≥1024px, a row click SELECTS (preventDefault) — the exact behavior the deleted center rows had; clicking the already-selected row navigates via its normal href. Every other page/viewport: unchanged navigation.

- [ ] **Step 1: Create the context**

```tsx
// app/project/SelectedProjectContext.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * The hub's selected-project state (mission-control build 07/16/2026). Lives in
 * the AREA LAYOUT so the rail (layout) and the hub dashboard (page) share one
 * selection — the center project list that used to own it is gone. Plain state,
 * no URL round-trip: selection is a view concern, exactly like the old
 * center-row behavior it replaces.
 */
const Ctx = createContext<{
  selectedId: string | null;
  setSelectedId: (id: string) => void;
} | null>(null);

export function SelectedProjectProvider({
  initialId,
  children,
}: {
  initialId: string | null;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  return <Ctx.Provider value={{ selectedId, setSelectedId }}>{children}</Ctx.Provider>;
}

export function useSelectedProject() {
  return useContext(Ctx);
}
```

- [ ] **Step 2: Wrap the layout**

In `app/project/layout.tsx`, import the provider and wrap the existing flex row (rows are already ordered `updated_at` desc, so `rows[0]` is the most-recent project — the same default the cockpit used):

```tsx
import { SelectedProjectProvider } from "./SelectedProjectContext";
// ...existing data fetching unchanged...
  const initialSelectedId = ((data as ProjectRowInput[] | null) ?? [])[0]?.id ?? null;
  return (
    <SelectedProjectProvider initialId={initialSelectedId}>
      <div className="flex w-full">
        <ProjectsRail sections={sections} />
        <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col">
          <div className="flex-1">{children}</div>
          <ProjectSearch entries={searchIndex} />
        </div>
      </div>
    </SelectedProjectProvider>
  );
```

- [ ] **Step 3: Rail select-in-place on the hub**

In `app/project/ProjectsRail.tsx`: import `useSelectedProject`; inside the component read `const sel = useSelectedProject();` and `const onHub = pathname === "/project";`. On each row `<Link>` add an `onClick` and extend the active style:

```tsx
const active = onHub && sel ? p.id === sel.selectedId : pathname.startsWith(`/project/${p.id}`);
// ...
<Link
  href={href}
  prefetch
  onClick={(e) => {
    // Hub + desktop: first click selects (the dashboard's widgets retarget);
    // clicking the already-selected row falls through to navigation. Mobile
    // (no split view) always navigates — the old center-row contract.
    if (
      onHub &&
      sel &&
      p.id !== sel.selectedId &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      e.preventDefault();
      sel.setSelectedId(p.id);
    }
  }}
  aria-current={active ? "page" : undefined}
  /* className unchanged — `active` already drives it */
>
```

- [ ] **Step 4: Build check** — `bunx next build`, expected green (context is client-only; layout stays a server component rendering a client provider).

- [ ] **Step 5: Commit**

```bash
git add app/project/SelectedProjectContext.tsx app/project/layout.tsx app/project/ProjectsRail.tsx
git commit -m "feat(hub): selection context in area layout - rail drives selection on the hub"
```

---

### Task 8: `CalendarCard.tsx` — compact, real, clickable

**Files:**
- Create: `app/project/_cockpit/CalendarCard.tsx`

**Interfaces:**
- Consumes: `expandScheduleMonth`, `etDateISO` (Task 1); `type ScheduleChip`, `chipTime` from `@/lib/project/schedule-chips`; raw rows `EmailScheduleRow[]`/`SocialScheduleRow[]` passed down from the page (Task 11).
- Produces: `<CalendarCard emailSch socialSch chips scheduleHref />` — `scheduleHref` is the empty-state pathway (the selected project's email tool).

- [ ] **Step 1: Implement**

```tsx
// app/project/_cockpit/CalendarCard.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  expandScheduleMonth,
  etDateISO,
  type MonthSendMark,
} from "@/lib/project/schedule-calendar";
import {
  chipTime,
  type ScheduleChip,
  type EmailScheduleRow,
  type SocialScheduleRow,
} from "@/lib/project/schedule-chips";

/**
 * Compact month grid (spec: "not the center of attention") — teal dot on any
 * ET day with a scheduled send, today outlined, paused excluded (the expansion
 * util filters them). Under the grid: the next 3 upcoming sends as the existing
 * chips; clicking a dotted day FILTERS that list to the day (no popovers —
 * clipped-popover lesson, 07/16/2026). ‹ › month nav only; nothing fancier.
 */
export function CalendarCard({
  emailSch,
  socialSch,
  chips,
  scheduleHref,
}: {
  emailSch: EmailScheduleRow[];
  socialSch: SocialScheduleRow[];
  chips: ScheduleChip[];
  scheduleHref: string;
}) {
  const todayISO = etDateISO(new Date());
  const [y0, m0] = [Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)) - 1];
  const [view, setView] = useState({ year: y0, month0: m0 });
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const days = useMemo(
    () => expandScheduleMonth(emailSch, socialSch, view),
    [emailSch, socialSch, view],
  );
  const chipByKey = useMemo(() => new Map(chips.map((c) => [c.key, c])), [chips]);

  const first = new Date(Date.UTC(view.year, view.month0, 1));
  const daysInMonth = new Date(Date.UTC(view.year, view.month0 + 1, 0)).getUTCDate();
  const lead = first.getUTCDay(); // weekday of the 1st (0=Sun) — calendar-shape only
  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const upcoming = chips
    .filter((c) => c.status === "active" && c.nextAt)
    .sort((a, b) => (a.nextAt! < b.nextAt! ? -1 : 1));
  const listed = dayFilter
    ? (days.get(dayFilter) ?? [])
        .map((m: MonthSendMark) => chipByKey.get(m.chipKey))
        .filter((c): c is ScheduleChip => !!c)
    : upcoming.slice(0, 3);

  const nav = (delta: number) => {
    setDayFilter(null);
    setView(({ year, month0 }) => {
      const m = month0 + delta;
      return { year: year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
    });
  };

  const empty = days.size === 0 && upcoming.length === 0;

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
          Calendar
        </p>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <button type="button" aria-label="Previous month" onClick={() => nav(-1)} className="rounded px-1 hover:bg-white/10 hover:text-white">‹</button>
          <span>{monthLabel}</span>
          <button type="button" aria-label="Next month" onClick={() => nav(1)} className="rounded px-1 hover:bg-white/10 hover:text-white">›</button>
        </div>
      </div>

      {empty ? (
        <p className="py-3 text-xs text-white/45">
          Schedule a send and it lands here —{" "}
          <Link href={scheduleHref} className="text-gulf-teal hover:underline">
            Schedule →
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={`${d}${i}`} className="text-white/30">{d}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${view.year}-${String(view.month0 + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
              const marks = days.get(date);
              const isToday = date === todayISO;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!marks}
                  onClick={() => setDayFilter(dayFilter === date ? null : date)}
                  aria-label={marks ? `Sends on ${date}` : undefined}
                  className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                    isToday ? "outline outline-1 outline-gulf-teal/70" : ""
                  } ${dayFilter === date ? "bg-gulf-teal/20" : ""} ${
                    marks ? "text-white hover:bg-white/10" : "text-white/35"
                  }`}
                >
                  {i + 1}
                  {marks && (
                    <span className="absolute bottom-0 h-1 w-1 rounded-full bg-gulf-teal" />
                  )}
                </button>
              );
            })}
          </div>

          <ul className="mt-3 flex flex-col gap-1 border-t border-white/8 pt-2">
            {listed.length === 0 && (
              <li className="text-[11px] text-white/40">No upcoming sends{dayFilter ? " that day" : ""}.</li>
            )}
            {listed.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className="text-xs text-white/60 transition-colors hover:text-gulf-teal">
                  {c.kind === "email" ? "✉" : "📣"} {c.line}
                  {!dayFilter && chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Build check** — `bunx next build`, expected green.

- [ ] **Step 3: Commit**

```bash
git add app/project/_cockpit/CalendarCard.tsx
git commit -m "feat(hub): compact calendar card - real month grid, day-click filters, no popovers"
```

---

### Task 9: `CampaignsCard.tsx` + `CampaignDrawer.tsx`

**Files:**
- Create: `app/project/_cockpit/CampaignsCard.tsx`
- Create: `app/project/_cockpit/CampaignDrawer.tsx`

**Interfaces:**
- Consumes: `type CampaignStats, CampaignRow` (Task 2); `ChartBlockView` (`@/components/charts/ChartBlockView`); `type ChartBlock` (`@/refinery/validate/chart-block-lint.mts`).
- Produces: `<CampaignsCard stats />` (drawer state internal).

- [ ] **Step 1: Implement the card**

```tsx
// app/project/_cockpit/CampaignsCard.tsx
"use client";

import { useState } from "react";
import type { CampaignStats, CampaignRow } from "@/lib/email/campaign-stats";
import { CampaignDrawer } from "./CampaignDrawer";

const pctText = (v: number | null) => (v === null ? "—" : `${v}%`);
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    : "—";

/** One row per campaign, real stored numbers only; row click → drawer.
 *  Delta arrow compares against the user's OWN average — never external. */
export function CampaignsCard({ stats }: { stats: CampaignStats }) {
  const [open, setOpen] = useState<CampaignRow | null>(null);

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Campaigns
      </p>

      {stats.campaigns.length === 0 ? (
        <p className="py-3 text-xs text-white/45">
          Send your first campaign and opens/clicks appear here — the campaign starters in the
          panel are the fastest door.
        </p>
      ) : (
        <>
          {stats.strongest && <p className="mb-2 text-xs text-white/70">{stats.strongest}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/8 text-[10px] uppercase tracking-wide text-white/40">
                  <th className="py-1.5 pr-3 font-medium">Campaign</th>
                  <th className="py-1.5 pr-3 font-medium">Last send</th>
                  <th className="py-1.5 pr-3 font-medium">Delivered</th>
                  <th className="py-1.5 pr-3 font-medium">Open</th>
                  <th className="py-1.5 pr-3 font-medium">Click</th>
                  <th className="py-1.5 font-medium">vs your avg</th>
                </tr>
              </thead>
              <tbody>
                {stats.campaigns.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setOpen(row)}
                    className="cursor-pointer border-b border-white/5 text-white/75 transition-colors hover:bg-white/5"
                  >
                    <td className="max-w-[220px] truncate py-2 pr-3 text-white/90">{row.label}</td>
                    <td className="py-2 pr-3">{dateText(row.lastSentAt)}</td>
                    <td className="py-2 pr-3">{row.delivered}</td>
                    <td className="py-2 pr-3">{pctText(row.openPct)}</td>
                    <td className="py-2 pr-3">{pctText(row.clickPct)}</td>
                    <td className="py-2">
                      {row.deltaOpenVsAvg === null ? (
                        "—"
                      ) : row.deltaOpenVsAvg >= 0 ? (
                        <span className="text-gulf-teal">▲ {row.deltaOpenVsAvg}</span>
                      ) : (
                        <span className="text-amber-300/80">▼ {Math.abs(row.deltaOpenVsAvg)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && <CampaignDrawer row={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
```

- [ ] **Step 2: Implement the drawer**

```tsx
// app/project/_cockpit/CampaignDrawer.tsx
"use client";

import { useEffect } from "react";
import type { CampaignRow } from "@/lib/email/campaign-stats";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { ChartBlockView } from "@/components/charts/ChartBlockView";

/**
 * Right slide-over (pencilandpaper drawer pattern — drill in without leaving
 * context), aside-tone chrome per spec. Charts render ONLY when the stored
 * event timestamps support the shape (hourBuckets/sendOverSend non-empty);
 * the KPI counts table always renders — a missing shape degrades to counts,
 * never an invented curve. Every block carries its as-of + citation.
 */
export function CampaignDrawer({ row, onClose }: { row: CampaignRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const asOf = row.asOf ?? new Date().toISOString().slice(0, 10);
  const src = { citation: "SWFL Data Gulf" };

  const opens24: ChartBlock | null = row.hourBuckets
    ? {
        title: "Unique opens after the last send",
        columns: ["Hours after send", "Opens"],
        rows: row.hourBuckets.map((b) => [b.label, b.opens]),
        chart_type: "bar",
        value_format: "count",
        asOf,
        source: src,
      }
    : null;
  const clicks24: ChartBlock | null =
    row.hourBuckets && row.hourBuckets.some((b) => b.clicks > 0)
      ? {
          title: "Unique clicks after the last send",
          columns: ["Hours after send", "Clicks"],
          rows: row.hourBuckets.map((b) => [b.label, b.clicks]),
          chart_type: "bar",
          value_format: "count",
          asOf,
          source: src,
        }
      : null;
  const trend: ChartBlock | null =
    row.sendOverSend.length >= 2
      ? {
          title: "Open rate, send over send",
          columns: ["Send", "Open rate"],
          rows: row.sendOverSend.map((s) => [s.label, s.openPct]),
          chart_type: "bar",
          value_format: "percent",
          asOf,
          source: src,
        }
      : null;

  const kpis: [string, number][] = [
    ["Delivered", row.delivered],
    ["Opened", row.opened],
    ["Clicked", row.clicked],
    ["Bounced", row.bounced],
    ["Unsubscribed", row.unsubscribed],
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close campaign details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />
      <aside
        role="dialog"
        aria-label={`Campaign: ${row.label}`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#0a141a] bg-[#0f1d24] p-4"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
              Campaign
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">{row.label}</h3>
            <p className="mt-0.5 text-[11px] text-white/45">
              {row.sendCount} {row.sendCount === 1 ? "send" : "sends"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 text-sm text-white/50 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/8 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
              <p className="text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        {opens24 && (
          <div className="mb-4">
            <ChartBlockView block={opens24} compact />
          </div>
        )}
        {clicks24 && (
          <div className="mb-4">
            <ChartBlockView block={clicks24} compact />
          </div>
        )}
        {trend && (
          <div className="mb-4">
            <ChartBlockView block={trend} compact />
          </div>
        )}
        {!opens24 && !trend && (
          <p className="text-[11px] text-white/40">
            Timing charts appear once opens with timestamps are recorded for this campaign.
          </p>
        )}
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Build check** — `bunx next build`, expected green. If `ChartBlockView`'s bar path (`adaptToHBar`) rejects a two-column block, check `refinery/lib/chart-adapter.mts` `pickRenderer` and set `chart_type: "table"` on the failing block — the table shape is the guaranteed degrade (FOCUS rule 4).

- [ ] **Step 4: Commit**

```bash
git add app/project/_cockpit/CampaignsCard.tsx app/project/_cockpit/CampaignDrawer.tsx
git commit -m "feat(hub): campaigns card + slide-over drawer - stored numbers, own-average deltas"
```

---

### Task 10: `SelectedProjectCard.tsx` — See it / Edit / Update

**Files:**
- Create: `app/project/_cockpit/SelectedProjectCard.tsx`

**Interfaces:**
- Consumes: `EmailPreviewFrame` (`@/app/p/[id]/EmailPreviewFrame`), `projectEntry` (`@/lib/project/tool-tabs`), routes from Tasks 4–5.
- Produces: `<SelectedProjectCard project={{id,title,lastDid} | null} initialPreview={{did, html} | null} />` — Task 11 mounts it.

- [ ] **Step 1: Implement**

```tsx
// app/project/_cockpit/SelectedProjectCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmailPreviewFrame } from "@/app/p/[id]/EmailPreviewFrame";
import { projectEntry } from "@/lib/project/tool-tabs";

interface Preview {
  did: string;
  html: string;
}

/**
 * The spec's three verbs, one card: SEE IT = the frozen /p page · EDIT = the
 * doc in the lab (projectEntry) · UPDATE = POST update-doc (a superseded fork
 * with today's figures) then re-preview with a "review before you send"
 * banner. Update NEVER sends/schedules — the trust boundary is the route's,
 * this card only calls it.
 */
export function SelectedProjectCard({
  project,
  initialPreview,
}: {
  project: { id: string; title: string; lastDid: string | null } | null;
  initialPreview: Preview | null;
}) {
  const [preview, setPreview] = useState<Preview | null>(initialPreview);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection changed → the server-rendered initial preview no longer matches.
  useEffect(() => {
    setUpdated(false);
    setError(null);
    if (!project?.lastDid) {
      setPreview(null);
      return;
    }
    if (initialPreview?.did === project.lastDid) {
      setPreview(initialPreview);
      return;
    }
    let alive = true;
    fetch(`/api/deliverables/${project.lastDid}/preview-html`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { html: string }) => alive && setPreview({ did: project.lastDid!, html: j.html }))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
  }, [project?.id, project?.lastDid, initialPreview]);

  async function update() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${preview.did}/update-doc`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const { id: newDid } = (await res.json()) as { id: string };
      const pv = await fetch(`/api/deliverables/${newDid}/preview-html`);
      if (!pv.ok) throw new Error(String(pv.status));
      const { html } = (await pv.json()) as { html: string };
      setPreview({ did: newDid, html });
      setUpdated(true);
    } catch {
      setError("Couldn't refresh the figures — the saved version is untouched.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Selected project
      </p>

      {!project ? (
        <p className="py-3 text-xs text-white/45">Pick a project in the rail and it shows here.</p>
      ) : !preview ? (
        <p className="py-3 text-xs text-white/45">
          {project.title} has no built email yet —{" "}
          <Link href={projectEntry(project.id, null)} className="text-gulf-teal hover:underline">
            Build the first email →
          </Link>
        </p>
      ) : (
        <>
          <p className="mb-2 truncate text-sm font-semibold text-white">{project.title}</p>
          {updated && (
            <p className="mb-2 rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-[11px] text-gulf-teal">
              Refreshed with today's data — review before you send. Nothing was sent.
            </p>
          )}
          {error && <p className="mb-2 text-[11px] text-amber-300/80">{error}</p>}
          <EmailPreviewFrame srcDoc={preview.html} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a
              href={`/p/${preview.did}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-gulf-teal/40 px-3 py-1.5 font-medium text-gulf-teal transition-colors hover:bg-gulf-teal/10"
            >
              See it
            </a>
            <Link
              href={projectEntry(project.id, preview.did)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-white/75 transition-colors hover:border-white/40 hover:text-white"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => void update()}
              disabled={busy}
              className="rounded-full border border-white/15 px-3 py-1.5 text-white/75 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40"
            >
              {busy ? "Updating…" : "Update"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Build check** — `bunx next build`, expected green.

- [ ] **Step 3: Commit**

```bash
git add app/project/_cockpit/SelectedProjectCard.tsx
git commit -m "feat(hub): selected-project card - see/edit/update over the frozen preview"
```

---

### Task 11: assemble the dashboard — cockpit center swap + page data + deletions

**Files:**
- Modify: `app/project/_cockpit/ProjectsCockpit.tsx` (center becomes the dashboard; aside "Running now" section removed; selection from context)
- Modify: `app/project/page.tsx` (fetch stats + default preview; new props; strip title "Mission control")

**Interfaces:**
- Consumes: everything above. `ProjectsCockpit` new props:

```ts
{
  projects: CockpitProject[];            // flat, updated_at desc (for selected meta)
  activeCount: number;
  chips: ScheduleChip[];                 // allChips from buildScheduleChips
  emailSch: EmailScheduleRow[];
  socialSch: SocialScheduleRow[];
  contactsCount: number;
  stats: CampaignStats;
  initialPreview: { did: string; html: string } | null;
  actions?: ReactNode;
}
```

- [ ] **Step 1: Rework `app/project/page.tsx`**

Keep the existing project/schedule/deliverable/contact queries. Changes:
1. `buildScheduleChips` destructure gains `allChips` (`const { chipsByProject, activeCount, upcoming, allChips } = ...` — note `upcoming` is no longer passed to the cockpit; the calendar card derives it from `chips`).
2. Add stats + default preview after the existing fetches:

```tsx
import { loadCampaignStats } from "@/lib/email/load-campaign-stats";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";

  const stats = await loadCampaignStats(supabase, user.id);

  // Default selection = most recent project (rows[0], same as the layout's
  // provider initialId). Server-render its latest doc so the card paints
  // without a fetch; selection changes re-fetch via preview-html.
  let initialPreview: { did: string; html: string } | null = null;
  const defaultDid = rows[0] ? (lastDidByProject.get(rows[0].id) ?? null) : null;
  if (defaultDid) {
    const { data: doc } = await supabase
      .from("deliverables")
      .select("doc")
      .eq("id", defaultDid)
      .maybeSingle();
    const parsed = EmailDocSchema.safeParse(doc?.doc);
    if (parsed.success) {
      initialPreview = { did: defaultDid, html: await renderEmailDocHtml(parsed.data) };
    }
  }
```

3. Render with the new props (`projects` = `toCockpitProjects(...)` output flat; `groupProjects` is no longer needed in the PAGE — the layout still uses it for the rail):

```tsx
      <ProjectsCockpit
        projects={projects}
        activeCount={activeCount}
        chips={allChips}
        emailSch={(emailSch ?? []) as EmailScheduleRow[]}
        socialSch={(socialSch ?? []) as SocialScheduleRow[]}
        contactsCount={contactsCount}
        stats={stats}
        initialPreview={initialPreview}
        actions={/* unchanged NewListing/ShowingPrep/NewProject */}
      />
```

If `buildScheduleChips` does not currently return `allChips` in its summary destructure at this call site, it does export it on `ScheduleChipSummary` — just destructure it.

- [ ] **Step 2: Rework `ProjectsCockpit.tsx` center + aside**

Keep: `ToolSwitcher` bar, the aside (docked `BriefcasePanel`/`BriefcaseChat`, selected-project dossier + per-project chips, `CampaignQuickStart`, Contacts section), `ConfirmDeleteProject` wiring, `EmptyLaunchpad` for the zero-project state.
Delete: the grouped center list (sections/subgroups markup), the **"Running now" aside section** (spec: next-send facts live in the calendar card now), and the `sections`/`upcoming`/`defaultSelectedId` props.
Change: selection comes from `useSelectedProject()` (fallback to `projects[0]`); center becomes:

```tsx
import { useSelectedProject } from "../SelectedProjectContext";
import { CalendarCard } from "./CalendarCard";
import { CampaignsCard } from "./CampaignsCard";
import { SelectedProjectCard } from "./SelectedProjectCard";
import { projectEntry } from "@/lib/project/tool-tabs";
// ...
  const sel = useSelectedProject();
  const selected = projects.find((p) => p.id === sel?.selectedId) ?? projects[0] ?? null;
  const empty = projects.length === 0;
// ... center column:
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/8 px-4 py-2.5">
            <h1 className="text-sm font-semibold text-white/80">Mission control</h1>
            <p className="text-[11px] text-white/45">
              {activeCount === 0
                ? "Nothing scheduled yet."
                : `${activeCount} active ${activeCount === 1 ? "send" : "sends"}`}
            </p>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
            {empty ? (
              <EmptyLaunchpad contactsCount={contactsCount} />
            ) : (
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
                  <CalendarCard
                    emailSch={emailSch}
                    socialSch={socialSch}
                    chips={chips}
                    scheduleHref={selected ? projectEntry(selected.id, selected.lastDid) : "/project"}
                  />
                  <SelectedProjectCard
                    project={
                      selected
                        ? { id: selected.id, title: selected.displayTitle, lastDid: selected.lastDid }
                        : null
                    }
                    initialPreview={initialPreview}
                  />
                </div>
                <CampaignsCard stats={stats} />
              </div>
            )}
          </div>
        </main>
```

The aside keeps its existing markup minus the `upcoming.length > 0 && ... Running now` block (delete it and the now-unused `upcoming` references). The delete-confirm fallback (`selected` recompute after delete) already works because `projects.find(...) ?? projects[0]` re-evaluates on `router.refresh()`.

F-pattern check (spec): calendar top-left (compact), selected project top-right (action verbs), campaigns full-width below carrying the visual weight — matches the layout sketch.

- [ ] **Step 3: Run the affected suites + build**

Run: `bun test lib/project lib/email && bunx next build`
Expected: PASS + green build. Fix type fallout only (no behavior edits outside the listed files).

- [ ] **Step 4: Commit**

```bash
git add app/project/page.tsx app/project/_cockpit/ProjectsCockpit.tsx
git commit -m "feat(hub): mission-control center - calendar + selected project + campaigns; center list and Running now retire"
```

---

### Task 12 (OPERATOR-GATED — confirm before executing): record scheduled-broadcast events into `email_events`

**Why:** probe result — scheduled sends produce NO did-tagged events, so campaign rows for scheduled campaigns show send dates but `—` rates forever. The webhook ALREADY receives per-recipient `email.*` events for broadcasts (the campaign-click branch keys off `data.broadcast_id`); this task stores them in the SAME table the blast branch uses, resolved `broadcast_id → email_sends.schedule_id → email_schedules.deliverable_id`. Same webhook, same table, forward-only — but it IS a new write on the live Resend webhook, hence the gate. Skipping this task leaves everything else fully functional (honest degrade).

**Files:**
- Modify: `lib/email/blast-events.ts` (add `extractBroadcastEvent`)
- Test: `lib/email/blast-events.test.ts` (append; create if absent)
- Modify: `app/api/webhooks/resend/route.ts` (new no-early-return branch after the blast branch)

**Interfaces:**
- Produces: `extractBroadcastEvent(payload): { broadcastId: string; emailId: string; event: "sent"|"delivered"|"opened"|"clicked"|"bounced"|"unsubscribed" } | null` — null unless the payload is an `email.*` engagement event carrying `data.broadcast_id` and NO did/rid/wid tag (those route to their existing branches).

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/email/blast-events.test.ts (mirror the file's existing payload builders)
import { extractBroadcastEvent } from "./blast-events";

describe("extractBroadcastEvent", () => {
  const base = (over: Record<string, unknown>) => ({
    type: "email.opened",
    data: { email_id: "re_1", broadcast_id: "bc_1", tags: {}, ...over },
  });

  test("broadcast open maps through; complained maps to unsubscribed", () => {
    expect(extractBroadcastEvent(base({}))).toEqual({
      broadcastId: "bc_1",
      emailId: "re_1",
      event: "opened",
    });
    expect(extractBroadcastEvent({ ...base({}), type: "email.complained" })?.event).toBe(
      "unsubscribed",
    );
  });

  test("did/rid/wid-tagged events and non-broadcast events return null", () => {
    expect(extractBroadcastEvent(base({ tags: { did: "d1" } }))).toBeNull();
    expect(extractBroadcastEvent(base({ broadcast_id: undefined }))).toBeNull();
    expect(extractBroadcastEvent({ ...base({}), type: "email.received" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/blast-events.test.ts`, expected FAIL (not exported).

- [ ] **Step 3: Implement the extractor** (in `lib/email/blast-events.ts`, reusing its existing payload types; map `email.complained → unsubscribed`, pass through sent/delivered/opened/clicked/bounced, drop everything else):

```ts
const BROADCAST_EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "unsubscribed",
};

/** A broadcast-send engagement event (scheduled sends): carries broadcast_id,
 *  no did/rid/wid tag. Resolved to a deliverable by the webhook via
 *  email_sends.broadcast_id → email_schedules.deliverable_id. */
export function extractBroadcastEvent(payload: ResendWebhookPayload): {
  broadcastId: string;
  emailId: string;
  event: string;
} | null {
  const event = BROADCAST_EVENT_MAP[payload.type ?? ""];
  const data = payload.data;
  if (!event || !data?.email_id || !data?.broadcast_id) return null;
  const tags = (data.tags ?? {}) as Record<string, string | undefined>;
  if (tags.did || tags.rid || tags.wid) return null;
  return { broadcastId: String(data.broadcast_id), emailId: String(data.email_id), event };
}
```

(Adjust field access to the file's actual `ResendWebhookPayload` shape — tags may be an array of `{name,value}`; reuse whatever helper `extractBlastAction` already uses to read tags.)

- [ ] **Step 4: Wire the webhook branch** — in `app/api/webhooks/resend/route.ts`, directly AFTER the blast branch (and like the ma-engagement branch, with NO early return so `email.received` still falls through):

```ts
  // ── Scheduled-broadcast engagement → email_events (mission-control build) ──
  // Broadcast sends carry no did tag; resolve broadcast_id → email_sends →
  // email_schedules.deliverable_id so scheduled campaigns accrue the same
  // stored, deduped engagement rows manual blasts already get.
  const broadcastEvent = extractBroadcastEvent(event as unknown as BlastWebhookPayload);
  if (broadcastEvent) {
    try {
      const sdb = createServiceRoleClient();
      const { data: sendRow } = await sdb
        .from("email_sends")
        .select("user_id, schedule_id")
        .eq("broadcast_id", broadcastEvent.broadcastId)
        .maybeSingle();
      if (sendRow?.user_id && sendRow.schedule_id != null) {
        const { data: sch } = await sdb
          .from("email_schedules")
          .select("deliverable_id")
          .eq("id", sendRow.schedule_id)
          .maybeSingle();
        if (sch?.deliverable_id) {
          await sdb.from("email_events").upsert(
            {
              resend_email_id: broadcastEvent.emailId,
              did: sch.deliverable_id,
              user_id: sendRow.user_id,
              event: broadcastEvent.event,
            },
            { onConflict: "resend_email_id,event", ignoreDuplicates: true },
          );
        }
      }
    } catch (err) {
      console.error(
        `[resend-webhook] broadcast engagement failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
```

- [ ] **Step 5: Run tests + build** — `bun test lib/email/blast-events.test.ts && bunx next build`, expected PASS + green.

- [ ] **Step 6: Commit**

```bash
git add lib/email/blast-events.ts lib/email/blast-events.test.ts app/api/webhooks/resend/route.ts
git commit -m "feat(email): store scheduled-broadcast engagement in email_events via broadcast_id resolution"
```

---

### Task 13: verification + close-out

- [ ] **Step 1: Full affected suites** — `bun test lib/project lib/email lib/briefcase` → PASS.
- [ ] **Step 2: Production build** — `bunx next build` → green.
- [ ] **Step 3: Live verify per `.claude/skills/verify`** (prod build, clean port): hub ⇄ email-lab room constancy (rail/pills/aside never jump); rail click selects on the hub and the three cards retarget; calendar dots match real `next_run_at` schedules and a day click filters the list; campaigns row click opens/closes the drawer (Esc + backdrop); See it opens `/p/[did]`; Edit lands in the lab on that doc; **Update against a real saved doc** produces a superseded fork, the banner says "review before you send," and `email_schedules` rows are byte-identical before/after (SQL check: `select id, deliverable_id, next_run_at from email_schedules where user_id = '<test user>'`).
- [ ] **Step 4: SESSION_LOG entry + push** via `node scripts/safe-push.mjs` (staged explicit paths only), per RULE 1/2.
- [ ] **Step 5:** `hub_mission_control_live_verify` stays OPEN until the operator sees it live — do not close it from a session's own report.

---

## Self-review notes

- Spec coverage: layout §(strip/calendar/selected/campaigns) → Tasks 8/9/10/11; deletions § → Task 11; Update trust boundary → Task 4 (+ Task 13 SQL check); mandated re-send probe → answered in header + Tasks 2/6/12; testing § → Tasks 1/2/3/12 tests + Task 13.
- Spec deviations, both flagged in Global Constraints: (1) server loader instead of a client-hit API route for campaign stats; (2) Task 12 extends the webhook (operator-gated) because the probe showed scheduled sends otherwise have no rates at all.
- Type-consistency pass done: `MonthSendMark.chipKey` ↔ `buildScheduleChips` keys; `CampaignRow`/`CampaignStats` names identical across Tasks 2/6/9/11; `deriveDocBuildArgs` consumed with the exact Pick fields it declares.
