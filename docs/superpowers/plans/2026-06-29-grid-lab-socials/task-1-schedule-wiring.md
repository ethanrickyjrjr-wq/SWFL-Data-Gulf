## Task 1: Wire "Schedule this post" → persist `social_schedules` + freeze

**Goal:** From the paid lab's Social Calendar panel, let a user pick publishable platforms + cadence + time for a generated post and persist a `social_schedules` recipe with a frozen first post — the row the live cron worker already reads. No live post is ever fired here (DRY invariant).

**Why this is Task 1:** seam-independent (works for either C1 branch), highest value, and the one genuine product gap — the U2 "confirm → INSERT `social_schedules`" path is a spec (`SOCIAL BUILD/U2-ask-ai-schedule-and-compose.md`), not shipped code. The engine + cron already run.

**Files:**
- Create: `lib/social/persist-schedule.ts` — pure insert/freeze builders (no I/O, fully unit-testable).
- Test: `lib/social/__tests__/persist-schedule.test.ts`
- Create: `app/api/social/schedule/route.ts` — POST handler (auth → validate → INSERT).
- Create: `components/email-lab/ScheduleSocialModal.tsx` — platform picker (5 publishable) + cadence + ET hour, mirrors `components/email-lab/ScheduleSendModal.tsx`.
- Modify: `components/email-lab/SocialCalendarPanel.tsx` — add a third "Schedule" action + `onSchedule` prop.
- Modify: `components/email-lab/EmailLabGridShell.tsx` — schedule state + handler + render the modal (gated on `capabilitiesFor("paid").socialCalendar`).

**Interfaces:**
- Consumes: `computeNextRunAt`, `formatScheduleSendTime`, `type CadenceSpec` (`@/lib/email/schedule-cadence`); `parseDeliverableScope` (`@/lib/deliverable/parse-scope`); `type Platform`, `type FrozenPost`, `type SocialSchedule` (`@/lib/social/types`); `type SocialDraft`, `type WeeklyCalendar` (`@/lib/email/social-calendar/types`); `createClient` (`@/utils/supabase/server`).
- Produces:
  - `buildSocialScheduleInsert(input: SocialScheduleInput): SocialScheduleInsert` — pure.
  - `freezePost(draft: SocialDraft, nowIso: string): FrozenPost` — pure.
  - `POST /api/social/schedule` body `{ projectId, post: SocialDraft, platforms: Platform[], accountId, cadence, day_of_week?, day_of_month?, send_hour_et, scope?, mediaUrl? }` → `{ ok, scheduleIds: number[], next_run_at }`.

**Types defined by this task** (put in `lib/social/persist-schedule.ts`):

```ts
import type { CadenceSpec } from "@/lib/email/schedule-cadence";
import type { FrozenPost, Platform } from "@/lib/social/types";

export interface SocialScheduleInput {
  userId: string;
  projectId: string | null;
  socialAccountId: string;
  platform: Platform;
  cadence: CadenceSpec;            // cadence + day_of_week/day_of_month + send_hour_et
  scopeKind: string | null;
  scopeValue: string | null;
  hashtags: string[];
  mediaKind: string | null;        // "image" | "carousel" | null
  frozenPost: FrozenPost;
  signature: string | null;
  nextRunAtIso: string | null;
}

/** Exactly the columns of a `social_schedules` INSERT (status seeded "active"). */
export interface SocialScheduleInsert {
  user_id: string;
  project_id: string | null;
  social_account_id: string;
  platform: Platform;
  status: "active";
  cadence: CadenceSpec["cadence"];
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  scope_kind: string | null;
  scope_value: string | null;
  content_template: string | null;
  hashtags: string[];
  media_kind: string | null;
  freshness_gate: boolean;
  signature: string | null;
  frozen_post: FrozenPost;
  next_run_at: string | null;
}
```

- [ ] **Step 1: Write the failing test for the pure builder**

Create `lib/social/__tests__/persist-schedule.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { buildSocialScheduleInsert, freezePost } from "../persist-schedule";
import type { SocialDraft } from "@/lib/email/social-calendar/types";

const draft = {
  day: "mon",
  theme: "Market pulse",
  caption: "Cape Coral median sale price held at $412K.\n\nWhat it means for sellers.",
  hashtags: ["capecoral", "swflrealestate"],
  card: { blocks: [] },
} as unknown as SocialDraft;

describe("freezePost", () => {
  it("captures caption + hashtags + media + freshness verbatim, no invention", () => {
    const f = freezePost(draft, "2026-06-29T12:00:00.000Z", {
      mediaUrl: "https://x/y.png",
      freshnessToken: "SWFL-LEE-20260628",
    });
    expect(f.caption).toBe(draft.caption);
    expect(f.hashtags).toEqual(["capecoral", "swflrealestate"]);
    expect(f.media_url).toBe("https://x/y.png");
    expect(f.freshness_token).toBe("SWFL-LEE-20260628");
    expect(f.composed_at).toBe("2026-06-29T12:00:00.000Z");
  });

  it("media_url is null (never empty string) when no asset", () => {
    const f = freezePost(draft, "2026-06-29T12:00:00.000Z", {});
    expect(f.media_url).toBeNull();
  });
});

describe("buildSocialScheduleInsert", () => {
  it("maps a weekly recipe to the social_schedules column shape, status active", () => {
    const row = buildSocialScheduleInsert({
      userId: "u1",
      projectId: "p1",
      socialAccountId: "acc1",
      platform: "instagram",
      cadence: { cadence: "weekly", day_of_week: 1, day_of_month: null, send_hour_et: 9 },
      scopeKind: "zip",
      scopeValue: "33904",
      hashtags: ["capecoral"],
      mediaKind: "image",
      frozenPost: freezePost(draft, "2026-06-29T12:00:00.000Z", {}),
      signature: "sig-abc",
      nextRunAtIso: "2026-06-30T13:00:00.000Z",
    });
    expect(row.status).toBe("active");
    expect(row.platform).toBe("instagram");
    expect(row.cadence).toBe("weekly");
    expect(row.day_of_week).toBe(1);
    expect(row.day_of_month).toBeNull();
    expect(row.send_hour_et).toBe(9);
    expect(row.scope_value).toBe("33904");
    expect(row.next_run_at).toBe("2026-06-30T13:00:00.000Z");
    expect(row.freshness_gate).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test lib/social/__tests__/persist-schedule.test.ts`
Expected: FAIL — `Cannot find module '../persist-schedule'`.

- [ ] **Step 3: Implement `lib/social/persist-schedule.ts`**

```ts
// lib/social/persist-schedule.ts
//
// Pure builders for the lab "Schedule this post" flow. NO I/O — the route handler
// does auth + the DB INSERT. Freezing mirrors the U2 spec
// (SOCIAL BUILD/U2-ask-ai-schedule-and-compose.md) and the FrozenPost contract in types.ts.

import type { CadenceSpec } from "@/lib/email/schedule-cadence";
import type { FrozenPost, Platform } from "@/lib/social/types";
import type { SocialDraft } from "@/lib/email/social-calendar/types";

// (SocialScheduleInput + SocialScheduleInsert interfaces above)

/** Freeze the artifact the FIRST fire posts verbatim. No invention: empty media → null. */
export function freezePost(
  draft: SocialDraft,
  nowIso: string,
  opts: { mediaUrl?: string | null; freshnessToken?: string | null },
): FrozenPost {
  return {
    caption: draft.caption,
    media_url: opts.mediaUrl && opts.mediaUrl.trim() ? opts.mediaUrl : null,
    hashtags: draft.hashtags ?? [],
    freshness_token: opts.freshnessToken && opts.freshnessToken.trim() ? opts.freshnessToken : null,
    composed_at: nowIso,
  };
}

export function buildSocialScheduleInsert(input: SocialScheduleInput): SocialScheduleInsert {
  return {
    user_id: input.userId,
    project_id: input.projectId,
    social_account_id: input.socialAccountId,
    platform: input.platform,
    status: "active",
    cadence: input.cadence.cadence,
    day_of_week: input.cadence.day_of_week ?? null,
    day_of_month: input.cadence.day_of_month ?? null,
    send_hour_et: input.cadence.send_hour_et,
    scope_kind: input.scopeKind,
    scope_value: input.scopeValue,
    content_template: "stat_card",
    hashtags: input.hashtags,
    media_kind: input.mediaKind,
    freshness_gate: true,
    signature: input.signature,
    frozen_post: input.frozenPost,
    next_run_at: input.nextRunAtIso,
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun test lib/social/__tests__/persist-schedule.test.ts`
Expected: PASS (4 assertions green).

- [ ] **Step 5: Confirm `social_schedules` is in the typed client**

Run: `grep -n "social_schedules" database.types.ts` (or `database-generated.types.ts`).
- If present: proceed.
- If absent: run `bun run gen:types`, then re-check. The route's `.from("social_schedules")` must typecheck.

- [ ] **Step 6: Write the route handler `app/api/social/schedule/route.ts`**

Mirror `app/api/email/schedule-command/route.ts`: cookie/RLS client (auth.uid() = user_id authorization — NEVER service-role), validate, gate platforms to the 5 publishable, compute `next_run_at`, INSERT one `social_schedules` row per platform. Confirm-only write (the panel sends the agreed action; no LLM parse here).

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { computeNextRunAt, type CadenceSpec } from "@/lib/email/schedule-cadence";
import { buildSocialScheduleInsert, freezePost } from "@/lib/social/persist-schedule";
import type { Platform } from "@/lib/social/types";
import type { SocialDraft } from "@/lib/email/social-calendar/types";

export const runtime = "nodejs";

const PUBLISHABLE: readonly Platform[] = ["x", "facebook", "instagram", "linkedin", "google_business"];
const isPublishable = (v: unknown): v is Platform => PUBLISHABLE.includes(v as Platform);

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const post = body?.post as SocialDraft | undefined;
  const platforms = Array.isArray(body?.platforms) ? body.platforms.filter(isPublishable) : [];
  const accountId = typeof body?.accountId === "string" ? body.accountId : null;
  const sendHourEt = typeof body?.send_hour_et === "number" ? body.send_hour_et : null;
  const cadence = body?.cadence as CadenceSpec["cadence"] | undefined;

  if (!post?.caption) return NextResponse.json({ error: "post required" }, { status: 400 });
  if (platforms.length === 0) return NextResponse.json({ error: "no publishable platform selected" }, { status: 400 });
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  if (!cadence || sendHourEt == null) return NextResponse.json({ error: "cadence + time required" }, { status: 400 });

  const spec: CadenceSpec = {
    cadence,
    day_of_week: typeof body?.day_of_week === "number" ? body.day_of_week : null,
    day_of_month: typeof body?.day_of_month === "number" ? body.day_of_month : null,
    send_hour_et: sendHourEt,
  };
  const next = computeNextRunAt(spec);
  const nextIso = next ? next.toISOString() : null;
  const nowIso = new Date().toISOString();
  const frozen = freezePost(post, nowIso, {
    mediaUrl: typeof body?.mediaUrl === "string" ? body.mediaUrl : null,
    freshnessToken: typeof body?.freshnessToken === "string" ? body.freshnessToken : null,
  });

  const rows = platforms.map((platform) =>
    buildSocialScheduleInsert({
      userId: user.id,
      projectId,
      socialAccountId: accountId,
      platform,
      cadence: spec,
      scopeKind: typeof body?.scope_kind === "string" ? body.scope_kind : null,
      scopeValue: typeof body?.scope_value === "string" ? body.scope_value : null,
      hashtags: post.hashtags ?? [],
      mediaKind: frozen.media_url ? "image" : null,
      frozenPost: frozen,
      signature: null,
      nextRunAtIso: nextIso,
    }),
  );

  const { data, error } = await supabase.from("social_schedules").insert(rows).select("id");
  if (error) {
    console.error("[social/schedule] insert failed:", error);
    return NextResponse.json({ error: "schedule_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, scheduleIds: (data ?? []).map((r) => r.id), next_run_at: nextIso });
}
```

- [ ] **Step 7: Add the Schedule action to `SocialCalendarPanel.tsx`**

Add `onSchedule: (draft: SocialDraft) => void;` to `SocialCalendarPanelProps`, and a third button in the `flex gap-1.5` action row (after "Load Card"):

```tsx
<button
  type="button"
  onClick={() => onSchedule(p)}
  className="flex-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-400/20"
>
  Schedule
</button>
```

- [ ] **Step 8: Build `ScheduleSocialModal.tsx`** (mirror `ScheduleSendModal.tsx`)

Platform multi-select restricted to `PUBLISHABLE` (read `lib/social/types.ts` `Platform`; label via `platformLabel` from `lib/social/channels/index.ts`), cadence radio (daily/weekly/monthly), ET hour select, and an account select sourced from `social_accounts` (status="connected"). On confirm, POST `/api/social/schedule` and show the `formatScheduleSendTime(next_run_at)` first-send line. Disable confirm until ≥1 platform + a connected account.

- [ ] **Step 9: Wire the modal into `EmailLabGridShell.tsx`**

Add `const [scheduleDraft, setScheduleDraft] = useState<SocialDraft | null>(null);`, pass `onSchedule={setScheduleDraft}` to `SocialCalendarPanel`, and render `{caps.socialCalendar && scheduleDraft && <ScheduleSocialModal draft={scheduleDraft} projectId={projectId} onClose={() => setScheduleDraft(null)} />}`. Read `caps` via the existing `capabilitiesFor("paid")` already in the shell — do not add a new tier check.

- [ ] **Step 10: Typecheck + tests**

Run: `bunx next build 2>&1 | tail -20` (TS clean on touched files) and `bun test lib/social/__tests__/persist-schedule.test.ts`.
Expected: build TS-clean; persist tests green.

- [ ] **Step 11: Commit**

```bash
git add lib/social/persist-schedule.ts lib/social/__tests__/persist-schedule.test.ts \
  app/api/social/schedule/route.ts components/email-lab/ScheduleSocialModal.tsx \
  components/email-lab/SocialCalendarPanel.tsx components/email-lab/EmailLabGridShell.tsx SESSION_LOG.md
git commit -m "feat(grid-lab-socials): schedule a generated post -> social_schedules recipe + frozen post (DRY, 5 publishable)"
```

**Live-verify (closes nothing yet — that's Task 6/full-flow):** a scheduled post writes one `social_schedules` row per selected publishable platform with `frozen_post` populated and `status="active"`, `next_run_at` set; no live post fires (`SOCIAL_PUBLISH_ENABLED` unchanged). Re-confirm against `public.social_schedules` after a real lab schedule.
