# Account Quick-Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 tasks, 28 files, keywords: migration, refactor, schema

**Goal:** Brand, Email Schedule, Alerts, and MLS Settings become reachable from the account dropdown; Brand and Email Schedule open as route-modals that never unmount the page underneath; on pages that already carry a brand editor, the Brand item reveals the local one (open + scroll + glow).

**Architecture:** A `@accountModal` parallel slot in the root layout plus `(.)account/*` intercepting routes render `/account/brand` and `/account/schedules` as modals on soft navigation and full pages on hard navigation. Brand reuses `BrandingBlock` against `GET/PATCH /api/user/brand` (account store extended to hold the full field set). Schedule edits reuse the existing validated write core — `writeAction` is extracted from the schedule-command route into `lib/email/schedule-write.ts`, gains a `resume` action, and a new structured `PATCH /api/email/schedules/[id]` drives it without the NL/nonce lane.

**Tech Stack:** Next.js App Router (parallel + intercepting routes), Supabase (RLS cookie client), bun:test, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-05-account-quick-access-design.md` · **Check:** `account_quick_access_live_verify`

## Global Constraints

- `bunx next build` is the type gate — never bare `npx tsc` / `tsc`.
- Layout heights: `h-full` / `dvh`, never `h-screen`.
- SQL migrations idempotent, run directly via Bun.SQL (psql is not installed), creds in `.dlt/secrets.toml`, verify after.
- Commit with explicit paths only (never `git add -A`); NO push without operator confirmation.
- Answers/UI copy carry no system nouns ("block-canvas" never shown to users — say "your saved email design").
- The account brand endpoint is `GET`/`PATCH /api/user/brand` (PATCH, not PUT).
- Social schedules (`social_schedules`) are OUT of scope — email only.
- Schedule creation from the account surface is OUT of scope.

---

### Task 1: `resume` action in the pure command core

**Files:**
- Modify: `lib/email/schedule-command.ts` (SCHEDULE_ACTIONS at :18, buildSystemPrompt action list at :150, validateToolInput switch at :232, summarizeCommand switch at :334)
- Test: `lib/email/__tests__/schedule-command.test.ts`

**Interfaces:**
- Produces: `"resume"` as a member of `ScheduleAction`; `validateToolInput({ action: "resume", schedule_id })` → ok; `summarizeCommand` handles it. Task 2's `writeAction` implements its DB effect.

- [ ] **Step 1: Write the failing tests** — append to `lib/email/__tests__/schedule-command.test.ts`:

```ts
describe("resume action", () => {
  it("validates a bare resume like pause/stop", () => {
    const v = validateToolInput({ action: "resume", schedule_id: 3 });
    expect(v.ok).toBe(true);
  });
  it("summarizes resume", () => {
    expect(summarizeCommand({ action: "resume", schedule_id: 3 })).toBe(
      "Resume schedule #3 (it will send again).",
    );
  });
});
```

(If the file doesn't already import `summarizeCommand`, add it to the existing import from `../schedule-command`.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/__tests__/schedule-command.test.ts`
Expected: FAIL — zod rejects `"resume"` (not in enum) and TS may error on the summarize case.

- [ ] **Step 3: Implement** in `lib/email/schedule-command.ts`:
  - Add `"resume"` to `SCHEDULE_ACTIONS` after `"pause"`.
  - In `buildSystemPrompt`, change the actions line to: `"Actions: create (a new schedule), pause, resume, stop, change-template, change-cadence, change-audience, clarify (ask the user a disambiguating question)."`
  - In `validateToolInput`, extend the no-param group: `case "pause": case "resume": case "stop":`.
  - In `summarizeCommand`, add:

```ts
    case "resume":
      return `Resume schedule #${c.schedule_id ?? "?"} (it will send again).`;
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/email/__tests__/schedule-command.test.ts && bun test lib/email/schedule-command.test.ts`
Expected: PASS (both suites — the second is a sibling suite over the same module; if it snapshots SCHEDULE_ACTIONS or the tool schema, update the expectation to include `"resume"` in the same commit).

- [ ] **Step 5: Commit**

```bash
git add lib/email/schedule-command.ts lib/email/__tests__/schedule-command.test.ts lib/email/schedule-command.test.ts
git commit -m "feat(email): resume action in schedule-command core"
```

---

### Task 2: Extract `writeAction` into `lib/email/schedule-write.ts` (+ resume + patchBodyToCommands)

**Files:**
- Create: `lib/email/schedule-write.ts`
- Create: `lib/email/schedule-write.test.ts`
- Modify: `app/api/email/schedule-command/route.ts` (delete its local `writeAction`, :337–429; import from the new module)

**Interfaces:**
- Consumes: `validateToolInput`, `ParsedCommand` from `lib/email/schedule-command.ts`; `computeNextRunAt` from `lib/email/schedule-cadence.ts`; `createOrTouchSchedule, ScheduleUpsertDb` from `lib/email/schedule-upsert.ts`.
- Produces:
  - `writeAction(supabase: Db, userId: string, projectId: string, command: ParsedCommand): Promise<NextResponse>` — moved verbatim, plus a `resume` case.
  - `patchBodyToCommands(scheduleId: number, body: unknown): { ok: true; commands: ParsedCommand[] } | { ok: false; error: string }` — pure, used by Task 3.
  - `type Db = ReturnType<typeof createClient>` (from `@/utils/supabase/server`) re-exported for the routes.

- [ ] **Step 1: Write the failing test** — `lib/email/schedule-write.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { patchBodyToCommands } from "./schedule-write";

describe("patchBodyToCommands", () => {
  it("maps pause/resume/stop ops to bare commands", () => {
    for (const op of ["pause", "resume", "stop"] as const) {
      const r = patchBodyToCommands(7, { op });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands).toEqual([{ action: op, schedule_id: 7 }]);
    }
  });
  it("maps an edit with cadence fields to change-cadence", () => {
    const r = patchBodyToCommands(7, {
      op: "edit", cadence: "weekly", day_of_week: 1, send_hour_et: 8,
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands).toEqual([
        { action: "change-cadence", schedule_id: 7, cadence: "weekly", day_of_week: 1, day_of_month: undefined, send_hour_et: 8 },
      ]);
  });
  it("emits one command per changed facet, cadence first", () => {
    const r = patchBodyToCommands(7, {
      op: "edit", cadence: "daily", send_hour_et: 9, audience_slug: "buyers", template_id: "weekly-digest",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.action)).toEqual(["change-cadence", "change-audience", "change-template"]);
  });
  it("rejects an unknown op and an empty edit", () => {
    expect(patchBodyToCommands(7, { op: "delete" }).ok).toBe(false);
    expect(patchBodyToCommands(7, { op: "edit" }).ok).toBe(false);
    expect(patchBodyToCommands(7, null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/schedule-write.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/email/schedule-write.ts`.** Move `writeAction` from `app/api/email/schedule-command/route.ts:337-429` VERBATIM (same imports: `NextResponse`, `computeNextRunAt`, `createOrTouchSchedule`/`ScheduleUpsertDb`, `Database`, `ParsedCommand`), with two additions — the `Db` type and the `resume` case inserted into its switch after `"pause"`:

```ts
import type { Database } from "@/database.types";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { computeNextRunAt } from "@/lib/email/schedule-cadence";
import type { Cadence } from "@/lib/email/schedule-cadence";
import type { ParsedCommand } from "@/lib/email/schedule-command";
import { createOrTouchSchedule, type ScheduleUpsertDb } from "@/lib/email/schedule-upsert";

export type Db = ReturnType<typeof createClient>;
```

The `resume` case (inside the moved switch, alongside `pause`/`stop`) — it must re-read the row's cadence to recompute `next_run_at`:

```ts
    case "resume": {
      const { data: row } = await supabase
        .from("email_schedules")
        .select("cadence, day_of_week, day_of_month, send_hour_et")
        .eq("id", command.schedule_id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const next = computeNextRunAt({
        cadence: row.cadence as Cadence,
        day_of_week: row.day_of_week,
        day_of_month: row.day_of_month,
        send_hour_et: row.send_hour_et,
      });
      patch = { status: "active", next_run_at: next ? next.toISOString() : null, updated_at: now };
      break;
    }
```

Then add the pure mapper:

```ts
/** Map a structured PATCH body onto ParsedCommand candidates. UNVALIDATED —
 *  the caller runs each through validateToolInput (defense-in-depth). */
export function patchBodyToCommands(
  scheduleId: number,
  body: unknown,
): { ok: true; commands: ParsedCommand[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid body" };
  }
  const b = body as Record<string, unknown>;
  if (b.op === "pause" || b.op === "resume" || b.op === "stop") {
    return { ok: true, commands: [{ action: b.op, schedule_id: scheduleId } as ParsedCommand] };
  }
  if (b.op !== "edit") return { ok: false, error: "op must be pause | resume | stop | edit" };
  const commands: ParsedCommand[] = [];
  if (b.cadence != null || b.send_hour_et != null || b.day_of_week != null || b.day_of_month != null) {
    commands.push({
      action: "change-cadence",
      schedule_id: scheduleId,
      cadence: b.cadence as Cadence | undefined,
      day_of_week: b.day_of_week as number | undefined,
      day_of_month: b.day_of_month as number | undefined,
      send_hour_et: b.send_hour_et as number | undefined,
    } as ParsedCommand);
  }
  if (typeof b.audience_slug === "string" && b.audience_slug) {
    commands.push({ action: "change-audience", schedule_id: scheduleId, audience_slug: b.audience_slug });
  }
  if (typeof b.template_id === "string" && b.template_id) {
    commands.push({ action: "change-template", schedule_id: scheduleId, template_id: b.template_id });
  }
  if (!commands.length) return { ok: false, error: "no changes" };
  return { ok: true, commands };
}
```

- [ ] **Step 4: Repoint the NL route.** In `app/api/email/schedule-command/route.ts`: delete the local `writeAction` function (:337–429) and its now-unused imports if any (`computeNextRunAt`, `createOrTouchSchedule` move out with it — check `computeNextRunAt` has no other use in the file first), and add `import { writeAction } from "@/lib/email/schedule-write";`. No call-site changes — same signature.

- [ ] **Step 5: Run to verify pass**

Run: `bun test lib/email/schedule-write.test.ts && bun test lib/email/__tests__/schedule-command.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/schedule-write.ts lib/email/schedule-write.test.ts app/api/email/schedule-command/route.ts
git commit -m "refactor(email): extract writeAction to schedule-write + resume case + patch mapper"
```

---

### Task 3: `PATCH /api/email/schedules/[id]` — structured edit endpoint

**Files:**
- Create: `app/api/email/schedules/[id]/route.ts`

**Interfaces:**
- Consumes: `patchBodyToCommands`, `writeAction`, `Db` (Task 2); `validateToolInput` (Task 1).
- Produces: `PATCH /api/email/schedules/:id` with JSON body `{ op: "pause" | "resume" | "stop" }` or `{ op: "edit", cadence?, day_of_week?, day_of_month?, send_hour_et?, audience_slug?, template_id? }` → `{ ok: true }` or `{ error, details? }`. Used by Task 10's ScheduleManager.

- [ ] **Step 1: Write the route**

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { validateToolInput } from "@/lib/email/schedule-command";
import { patchBodyToCommands, writeAction } from "@/lib/email/schedule-write";

export const runtime = "nodejs";

/**
 * PATCH /api/email/schedules/[id] — structured (form-driven) schedule mutation.
 * Reuses the SAME validated write core as the NL schedule-command lane, minus
 * the model parse and the proposal nonce: a direct form submit IS the user's
 * confirmation. Ownership: the row must belong to the signed-in user (explicit
 * eq + RLS). change-cadence merges missing day/hour fields from the row so a
 * partial edit (e.g. hour only) stays valid.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("email_schedules")
    .select("id, project_id, cadence, day_of_week, day_of_month, send_hour_et")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row || !row.project_id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const mapped = patchBodyToCommands(id, body);
  if (!mapped.ok) return NextResponse.json({ error: mapped.error }, { status: 422 });

  for (const candidate of mapped.commands) {
    // Partial cadence edits inherit the row's current values (same merge the NL
    // lane does from EXISTING SCHEDULES) so validateToolInput sees a full set.
    const merged =
      candidate.action === "change-cadence"
        ? {
            ...candidate,
            cadence: candidate.cadence ?? (row.cadence as typeof candidate.cadence),
            day_of_week: candidate.day_of_week ?? row.day_of_week ?? undefined,
            day_of_month: candidate.day_of_month ?? row.day_of_month ?? undefined,
            send_hour_et: candidate.send_hour_et ?? row.send_hour_et ?? undefined,
          }
        : candidate;
    const v = validateToolInput(merged);
    if (!v.ok) return NextResponse.json({ error: "invalid", details: v.errors }, { status: 422 });
    const res = await writeAction(supabase, user.id, row.project_id, v.command);
    if (res.status !== 200) return res;
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check via build**

Run: `bunx next build 2>&1 | tail -5`
Expected: build succeeds (or fails only on pre-existing unrelated issues — investigate anything new).

- [ ] **Step 3: Commit**

```bash
git add app/api/email/schedules/[id]/route.ts
git commit -m "feat(email): structured PATCH /api/email/schedules/[id] on the shared write core"
```

---

### Task 4: `ACCOUNT_MENU` in nav-config (+ test)

**Files:**
- Modify: `components/nav/nav-config.ts`
- Test: `components/nav/nav-config.test.ts`

**Interfaces:**
- Produces: `interface AccountMenuItem { label: string; href: string; reveal?: "brand" }` and `export const ACCOUNT_MENU: AccountMenuItem[]`. Task 6 renders it; the `reveal` field tells SiteShell to try the local brand panel first.

- [ ] **Step 1: Write the failing test** — append to `components/nav/nav-config.test.ts`:

```ts
import { ACCOUNT_MENU } from "./nav-config";

describe("ACCOUNT_MENU (account dropdown contract)", () => {
  it("carries the exact quick-access set, in order", () => {
    expect(ACCOUNT_MENU.map((i) => [i.label, i.href])).toEqual([
      ["My Projects", "/project"],
      ["Brand", "/account/brand"],
      ["Contacts", "/contacts"],
      ["Email Schedule", "/account/schedules"],
      ["Alerts", "/alerts"],
      ["MLS Settings", "/settings/mls"],
      ["Billing", "/billing"],
    ]);
  });
  it("marks ONLY Brand as reveal-capable", () => {
    expect(ACCOUNT_MENU.filter((i) => i.reveal).map((i) => i.label)).toEqual(["Brand"]);
    expect(ACCOUNT_MENU.find((i) => i.label === "Brand")?.reveal).toBe("brand");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test components/nav/nav-config.test.ts`
Expected: FAIL — `ACCOUNT_MENU` not exported.

- [ ] **Step 3: Implement** — in `components/nav/nav-config.ts`, after `NAV_GROUPS`:

```ts
/**
 * Account dropdown (top-right disclosure) — the signed-in user's quick-access set:
 * everything they may need to reach fast to update-and-save (operator ruling
 * 07/05/2026). Brand + Email Schedule open as route-modals over the current page
 * (@accountModal slot) so in-progress work is never unmounted; `reveal: "brand"`
 * tells the shell to first offer the click to a brand editor already on the page
 * (lib/brand/reveal-brand-panel.ts) before navigating. Sign out is not an item —
 * it stays a button in the shell. Pinned by nav-config.test.ts like NAV_GROUPS.
 */
export interface AccountMenuItem {
  label: string;
  href: string;
  /** Set on items a page can claim locally instead of navigating. */
  reveal?: "brand";
}

export const ACCOUNT_MENU: AccountMenuItem[] = [
  { label: "My Projects", href: "/project" },
  { label: "Brand", href: "/account/brand", reveal: "brand" },
  { label: "Contacts", href: "/contacts" },
  { label: "Email Schedule", href: "/account/schedules" },
  { label: "Alerts", href: "/alerts" },
  { label: "MLS Settings", href: "/settings/mls" },
  { label: "Billing", href: "/billing" },
];
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test components/nav/nav-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/nav/nav-config.ts components/nav/nav-config.test.ts
git commit -m "feat(nav): ACCOUNT_MENU quick-access contract"
```

---

### Task 5: Brand-reveal registry (+ pulse CSS)

**Files:**
- Create: `lib/brand/reveal-brand-panel.ts`
- Test: `lib/brand/reveal-brand-panel.test.ts`
- Modify: `app/globals.css` (append keyframes)

**Interfaces:**
- Produces:
  - `registerBrandPanel(handler: () => void): () => void` — pages with a brand editor register on mount; returns unregister for the effect cleanup.
  - `revealBrandPanel(): boolean` — invokes the NEWEST registered handler; false when none.
  - `pulseBrandPanel(el: HTMLElement | null): void` — adds `.brand-reveal-pulse` for 2.2s (shared so all three surfaces glow identically).
- Used by Task 6 (menu click) and Task 11 (registrations).

- [ ] **Step 1: Write the failing test** — `lib/brand/reveal-brand-panel.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { registerBrandPanel, revealBrandPanel } from "./reveal-brand-panel";

describe("brand-reveal registry", () => {
  it("returns false with no handler registered", () => {
    expect(revealBrandPanel()).toBe(false);
  });
  it("claims via the newest handler and unregisters cleanly", () => {
    const calls: string[] = [];
    const un1 = registerBrandPanel(() => calls.push("one"));
    const un2 = registerBrandPanel(() => calls.push("two"));
    expect(revealBrandPanel()).toBe(true);
    expect(calls).toEqual(["two"]); // newest wins (innermost surface)
    un2();
    expect(revealBrandPanel()).toBe(true);
    expect(calls).toEqual(["two", "one"]);
    un1();
    expect(revealBrandPanel()).toBe(false);
  });
  it("double-unregister is a no-op", () => {
    const un = registerBrandPanel(() => {});
    un();
    un();
    expect(revealBrandPanel()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/brand/reveal-brand-panel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/brand/reveal-brand-panel.ts`:

```ts
/**
 * Local-claim / global-fallback for the account menu's Brand item (spec
 * 2026-07-05-account-quick-access). A page that already renders a brand editor
 * (project workspace pill, email-lab accordions) registers a handler on mount;
 * the SiteShell menu calls revealBrandPanel() first and only navigates to the
 * /account/brand route-modal when nothing claims the click. Module-level state
 * is fine: one browser tab, one active surface; newest registration wins.
 */
const handlers: Array<() => void> = [];

export function registerBrandPanel(handler: () => void): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function revealBrandPanel(): boolean {
  const h = handlers[handlers.length - 1];
  if (!h) return false;
  h();
  return true;
}

/** Shared glow so every surface pulses identically (class in globals.css). */
export function pulseBrandPanel(el: HTMLElement | null): void {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("brand-reveal-pulse");
  setTimeout(() => el.classList.remove("brand-reveal-pulse"), 2200);
}
```

- [ ] **Step 4: Append the pulse to `app/globals.css`:**

```css
/* Brand-reveal glow — account menu's Brand item landing on an in-page editor
   (lib/brand/reveal-brand-panel.ts adds/removes the class). Teal = system color. */
@keyframes brand-reveal-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(61, 201, 192, 0.65);
  }
  100% {
    box-shadow: 0 0 0 14px rgba(61, 201, 192, 0);
  }
}
.brand-reveal-pulse {
  animation: brand-reveal-pulse 1s ease-out 2;
  border-radius: 12px;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `bun test lib/brand/reveal-brand-panel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/brand/reveal-brand-panel.ts lib/brand/reveal-brand-panel.test.ts app/globals.css
git commit -m "feat(brand): reveal registry (local claim, global fallback) + pulse"
```

---

### Task 6: SiteShell renders ACCOUNT_MENU (desktop + mobile), Brand reveal-first

**Files:**
- Modify: `components/nav/SiteShell.tsx` (desktop dropdown :446–474, mobile block :562–582, imports :11–19)

**Interfaces:**
- Consumes: `ACCOUNT_MENU`, `AccountMenuItem` (Task 4); `revealBrandPanel` (Task 5).

- [ ] **Step 1: Imports** — add `ACCOUNT_MENU, type AccountMenuItem` to the `./nav-config` import and `import { revealBrandPanel } from "@/lib/brand/reveal-brand-panel";`.

- [ ] **Step 2: Shared click handler** — inside `AppBar`, next to `closeAccount`:

```tsx
  // Brand's local claim: a page already showing a brand editor takes the click
  // (opens + scrolls + pulses its own panel); otherwise fall through to the
  // Link navigation → the /account/brand route-modal.
  const onAccountItem = useCallback((item: AccountMenuItem, e: React.MouseEvent) => {
    if (item.reveal === "brand" && revealBrandPanel()) e.preventDefault();
    setAccountOpen(false);
    setMobileOpen(false);
  }, []);
```

- [ ] **Step 3: Desktop dropdown** — replace the four hardcoded `<AccountLink>` entries (`My Projects` / `Contacts` / `Billing`) at :454–462 with:

```tsx
                  {ACCOUNT_MENU.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(e) => onAccountItem(item, e)}
                      className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
```

(The Sign out button below stays as-is. `AccountLink` loses its last callers — delete the helper component in the same edit.)

- [ ] **Step 4: Mobile block** — replace the two `<MobileLink>` entries (Contacts / Billing) at :566–571 with the same `ACCOUNT_MENU.map(...)` using the `MobileLink` styling (`text-gray-200` variant), `onClick={(e) => onAccountItem(item, e)}`. Keep the Sign out button. If `MobileLink` still has other callers keep it; otherwise inline and delete it too.

- [ ] **Step 5: Verify**

Run: `bun test components/nav/nav-config.test.ts && bunx next build 2>&1 | tail -5`
Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/nav/SiteShell.tsx
git commit -m "feat(nav): account dropdown renders ACCOUNT_MENU, Brand claims locally first"
```

---

### Task 7: Brand store carries the full BrandingBlock field set

**Files:**
- Create: `docs/sql/20260705_user_brand_full_fields.sql`
- Modify: `app/api/user/brand/route.ts` (field allowlists :10–44)
- Regenerate: `database-generated.types.ts` via `bun run gen:types`

**Interfaces:**
- Produces: `user_brand_profiles` gains `nickname, agent_title, contact_email, contact_phone, font_display, font_body, text_color, background_color, surface_color, surface_dark_color` (all `text null`); `GET/PATCH /api/user/brand` reads/writes them plus the pre-existing but un-allowlisted `website_url`. Task 9's editor round-trips every BrandingBlock field through this.

**Why:** BrandingBlock edits ~20 fields; the account route today persists only agent_name/photo_url/license/brokerage + colors + socials + business_address — the rest silently drop on a global save (this bug already bites the workspace's "Save globally"). The account editor makes it visible, so fix the store.

- [ ] **Step 1: Write the idempotent migration** — `docs/sql/20260705_user_brand_full_fields.sql`:

```sql
-- Account-level brand profile: full BrandingBlock field set (spec
-- 2026-07-05-account-quick-access). Idempotent.
ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS agent_title text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS font_display text,
  ADD COLUMN IF NOT EXISTS font_body text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS surface_color text,
  ADD COLUMN IF NOT EXISTS surface_dark_color text;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it** via Bun.SQL (creds in `.dlt/secrets.toml`, `sslmode=require` — see memory `reference_run-migrations-via-bun-sql.md`), then verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_brand_profiles' AND column_name IN
  ('nickname','agent_title','contact_email','contact_phone','font_display',
   'font_body','text_color','background_color','surface_color','surface_dark_color');
```

Expected: 10 rows.

- [ ] **Step 3: Regenerate types**

Run: `bun run gen:types`
Expected: `database-generated.types.ts` diff shows the 10 new columns on `user_brand_profiles`.

- [ ] **Step 4: Extend the route allowlists** in `app/api/user/brand/route.ts`:

```ts
const AGENT_FIELDS = ["agent_name", "nickname", "agent_title", "photo_url", "license", "brokerage"] as const;
// ...
const COLOR_FIELDS = [
  "primary_color", "accent_color", "text_color", "background_color",
  "surface_color", "surface_dark_color", "logo_url",
] as const;
// ...
const CONTACT_FIELDS = ["business_address", "contact_email", "contact_phone", "website_url"] as const;
// new, handled in the same `if (key in body)` loop pattern as the others:
const FONT_FIELDS = ["font_display", "font_body"] as const;
type FontField = (typeof FONT_FIELDS)[number];
```

Add a `for (const key of FONT_FIELDS)` loop in PATCH mirroring the existing ones, and add the new fields to `BASE_SELECT` (it is built from the field arrays plus a literal prefix — extend the literal prefix with the new agent/color names and append `FONT_FIELDS.join(", ")`).

- [ ] **Step 5: Verify**

Run: `bunx next build 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add docs/sql/20260705_user_brand_full_fields.sql app/api/user/brand/route.ts database-generated.types.ts
git commit -m "feat(brand): account store carries full BrandingBlock field set"
```

---

### Task 8: `@accountModal` slot + AccountModalShell

**Files:**
- Create: `app/@accountModal/default.tsx`
- Create: `components/account/AccountModalShell.tsx`
- Modify: `app/layout.tsx` (:42–46 signature, render next to `{children}`)

**Interfaces:**
- Produces: root layout accepts `accountModal: React.ReactNode`; `AccountModalShell({ title, children })` client component that closes via `router.back()`. Tasks 9–10 mount intercepted pages inside it.

- [ ] **Step 1: `app/@accountModal/default.tsx`** (renders for every URL that isn't an intercepted `/account/*` soft-nav, and on hard loads):

```tsx
/** Unmatched @accountModal slot → no modal. Required so every non-/account/*
 *  URL (and any hard navigation) resolves the slot instead of 404ing. */
export default function AccountModalDefault() {
  return null;
}
```

- [ ] **Step 2: `components/account/AccountModalShell.tsx`:**

```tsx
"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Overlay chrome for the account route-modals (/account/brand, /account/schedules
 * intercepted into the root @accountModal slot). Soft-nav opens it OVER the current
 * page — the page underneath stays mounted, so in-progress work survives. Close =
 * router.back() (returns to that page); hard refresh renders the real page instead.
 */
export function AccountModalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={close}
    >
      <div
        className="mx-auto mt-12 w-full max-w-2xl rounded-2xl border border-white/10 bg-navy-dark shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the slot in `app/layout.tsx`** — change the signature and render the slot INSIDE `<body>` after the shell (both flag branches see it; it must be outside the highlighter conditional so it renders in either):

```tsx
export default function RootLayout({
  children,
  accountModal,
}: Readonly<{
  children: React.ReactNode;
  accountModal: React.ReactNode;
}>) {
```

and render `{accountModal}` immediately after `<SiteShell />` (line 65).

- [ ] **Step 4: Verify**

Run: `bunx next build 2>&1 | tail -5`
Expected: build succeeds (slot + default resolve).

- [ ] **Step 5: Commit**

```bash
git add app/@accountModal/default.tsx components/account/AccountModalShell.tsx app/layout.tsx
git commit -m "feat(account): @accountModal parallel slot + modal shell"
```

---

### Task 9: Brand editor — `/account/brand` page + intercepted modal

**Files:**
- Create: `components/account/AccountBrandEditor.tsx`
- Create: `app/account/brand/page.tsx`
- Create: `app/@accountModal/(.)account/brand/page.tsx`

**Interfaces:**
- Consumes: `BrandingBlock` (`components/brand/BrandingBlock.tsx:100` — props `branding, onChange, palettes, onPalettesChange, onSaveGlobal, saving, savedMsg, onClose`; `onSaveProjectOnly` OMITTED = standalone mode); `GET/PATCH /api/user/brand`; `sanitizePalettes`-shaped `color_palettes` from the GET; `AccountModalShell` (Task 8).
- Produces: `<AccountBrandEditor variant="modal" | "page" />` client component.

- [ ] **Step 1: `components/account/AccountBrandEditor.tsx`:**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandingBlock } from "@/components/brand/BrandingBlock";
import type { BrandPalette } from "@/lib/brand/palette";

/**
 * Account-level brand editor (route-modal + full page /account/brand). Global
 * save ONLY — there is no project in scope, so no save-target ambiguity.
 * Propagation is structural: resolve-brand falls back project → account, so a
 * save here reaches every surface except projects carrying their own override.
 */
export function AccountBrandEditor({ variant }: { variant: "modal" | "page" }) {
  const router = useRouter();
  const [branding, setBranding] = useState<Record<string, string>>({});
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile: Record<string, unknown> | null) => {
        if (profile) {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(profile)) {
            if (typeof v === "string" && v) next[k] = v;
          }
          setBranding(next);
          if (Array.isArray(profile.color_palettes)) {
            setPalettes(profile.color_palettes as BrandPalette[]);
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function saveGlobal(): Promise<boolean> {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/user/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...branding, color_palettes: palettes }),
      });
      const ok = res.ok;
      setSavedMsg(ok ? "Saved — applies everywhere you haven't customized a project" : "Save failed");
      return ok;
    } finally {
      setSaving(false);
    }
  }

  function persistPalettes(next: BrandPalette[]) {
    setPalettes(next);
    void fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color_palettes: next }),
    });
  }

  if (!loaded) {
    return <p className="py-8 text-center text-sm text-gray-400">Loading your brand…</p>;
  }
  return (
    <BrandingBlock
      branding={branding}
      onChange={setBranding}
      palettes={palettes}
      onPalettesChange={persistPalettes}
      onSaveGlobal={saveGlobal}
      saving={saving}
      savedMsg={savedMsg}
      onClose={() => (variant === "modal" ? router.back() : router.push("/project"))}
    />
  );
}
```

- [ ] **Step 2: `app/account/brand/page.tsx`** (real page — hard nav / refresh / deep link):

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your brand — SWFL Data Gulf" };

export default async function AccountBrandPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/brand");
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-white">Your brand</h1>
      <AccountBrandEditor variant="page" />
    </main>
  );
}
```

- [ ] **Step 3: `app/@accountModal/(.)account/brand/page.tsx`** (intercepted — soft nav from anywhere):

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AccountModalShell } from "@/components/account/AccountModalShell";
import { AccountBrandEditor } from "@/components/account/AccountBrandEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountBrandModal() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/brand");
  return (
    <AccountModalShell title="Your brand">
      <AccountBrandEditor variant="modal" />
    </AccountModalShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `bunx next build 2>&1 | tail -5`
Expected: build succeeds; route list shows `/account/brand`.

- [ ] **Step 5: Commit**

```bash
git add components/account/AccountBrandEditor.tsx app/account/brand/page.tsx "app/@accountModal/(.)account/brand/page.tsx"
git commit -m "feat(account): brand route-modal + page on BrandingBlock"
```

---

### Task 10: Email Schedule surface — data loader, manager, page + modal

**Files:**
- Create: `lib/email/account-schedules.ts` (server data loader)
- Create: `components/account/ScheduleManager.tsx` (client)
- Create: `app/account/schedules/page.tsx`
- Create: `app/@accountModal/(.)account/schedules/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/email/schedules/:id` (Task 3); `describeCadence, formatScheduleSendTime` from `lib/email/schedule-cadence.ts` (already used by `app/project/page.tsx:11-14`); `EMAIL_TEMPLATES` from `lib/email/templates/template-registry.ts`; `AccountModalShell` (Task 8).
- Produces:

```ts
export interface AccountScheduleRow {
  id: number;
  project_id: string;
  project_title: string;
  status: string; // active | paused
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
  template_id: string | null;
  deliverable_id: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}
export async function loadAccountSchedules(
  supabase: ReturnType<typeof createClient>,
): Promise<{ schedules: AccountScheduleRow[]; audiences: string[] }>;
```

- [ ] **Step 1: `lib/email/account-schedules.ts`:**

```ts
import type { createClient } from "@/utils/supabase/server";

export interface AccountScheduleRow {
  id: number;
  project_id: string;
  project_title: string;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
  template_id: string | null;
  deliverable_id: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

/** Every non-stopped email schedule the signed-in user owns, with project names
 *  + their audience slugs for the edit form. RLS scopes both queries. */
export async function loadAccountSchedules(supabase: ReturnType<typeof createClient>) {
  const [{ data: rows }, { data: auds }] = await Promise.all([
    supabase
      .from("email_schedules")
      .select(
        "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, audience_slug, template_id, deliverable_id, next_run_at, last_run_at",
      )
      .neq("status", "stopped")
      .order("next_run_at", { ascending: true, nullsFirst: false }),
    supabase.from("email_audiences").select("audience_slug").order("audience_slug"),
  ]);
  const withProject = (rows ?? []).filter((r) => r.project_id != null);
  const projectIds = [...new Set(withProject.map((r) => r.project_id as string))];
  const titles = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await supabase.from("projects").select("id, title").in("id", projectIds);
    for (const p of projects ?? []) titles.set(p.id, p.title || "Untitled project");
  }
  const schedules: AccountScheduleRow[] = withProject.map((r) => ({
    ...(r as Omit<AccountScheduleRow, "project_id" | "project_title">),
    project_id: r.project_id as string,
    project_title: titles.get(r.project_id as string) ?? "Untitled project",
  }));
  return { schedules, audiences: (auds ?? []).map((a) => a.audience_slug) };
}
```

- [ ] **Step 2: `components/account/ScheduleManager.tsx`** — client component, grouped by project:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountScheduleRow } from "@/lib/email/account-schedules";
import { describeCadence, formatScheduleSendTime, type Cadence } from "@/lib/email/schedule-cadence";
import { EMAIL_TEMPLATES } from "@/lib/email/templates/template-registry";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"} ET`,
}));

export function ScheduleManager({
  schedules,
  audiences,
}: {
  schedules: AccountScheduleRow[];
  audiences: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/email/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error === "invalid" ? (j.details ?? []).join("; ") : "Update failed — try again.");
        return;
      }
      setEditing(null);
      router.refresh(); // server page re-reads rows → fresh next_run_at
    } finally {
      setBusy(null);
    }
  }

  const byProject = new Map<string, AccountScheduleRow[]>();
  for (const s of schedules) {
    const list = byProject.get(s.project_id) ?? [];
    list.push(s);
    byProject.set(s.project_id, list);
  }

  if (!schedules.length) {
    return (
      <p className="py-6 text-sm text-gray-400">
        Nothing scheduled yet. Open a project and build an email to schedule your first send —{" "}
        <Link href="/project" className="text-teal-primary hover:underline">
          your projects
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {[...byProject.entries()].map(([projectId, rows]) => (
        <section key={projectId}>
          <h3 className="mb-2 flex items-baseline justify-between text-sm font-medium text-white">
            {rows[0].project_title}
            <Link href={`/project/${projectId}`} className="text-xs text-teal-primary hover:underline">
              open project
            </Link>
          </h3>
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-200">
                    {describeCadence(s.cadence as Cadence, s.day_of_week, s.day_of_month, s.send_hour_et)}
                    {s.audience_slug && <span className="text-gray-400"> → {s.audience_slug}</span>}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        s.status === "active" ? "bg-teal-primary/15 text-teal-primary" : "bg-white/10 text-gray-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => setEditing((e) => (e === s.id ? null : s.id))}
                      className="rounded-lg border border-white/15 px-2 py-1 text-gray-300 hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => void patch(s.id, { op: s.status === "paused" ? "resume" : "pause" })}
                      className="rounded-lg border border-white/15 px-2 py-1 text-gray-300 hover:bg-white/10"
                    >
                      {s.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => {
                        if (window.confirm("Stop this schedule? It will no longer send.")) {
                          void patch(s.id, { op: "stop" });
                        }
                      }}
                      className="rounded-lg border border-red-400/30 px-2 py-1 text-red-300 hover:bg-red-500/10"
                    >
                      Stop
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {s.next_run_at ? `Next send ${formatScheduleSendTime(s.next_run_at)}` : "No next send"}
                  {s.deliverable_id ? " · sends your saved email design" : ""}
                </p>
                {editing === s.id && <EditForm row={s} audiences={audiences} busy={busy === s.id} onSubmit={patch} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EditForm({
  row,
  audiences,
  busy,
  onSubmit,
}: {
  row: AccountScheduleRow;
  audiences: string[];
  busy: boolean;
  onSubmit: (id: number, body: Record<string, unknown>) => Promise<void>;
}) {
  const [cadence, setCadence] = useState(row.cadence);
  const [dayOfWeek, setDayOfWeek] = useState(row.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(row.day_of_month ?? 1);
  const [hour, setHour] = useState(row.send_hour_et);
  const [audience, setAudience] = useState(row.audience_slug ?? "");
  const [template, setTemplate] = useState(row.template_id ?? "");
  const audienceOptions = [...new Set([...(row.audience_slug ? [row.audience_slug] : []), ...audiences])];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      op: "edit",
      cadence,
      send_hour_et: hour,
      ...(cadence === "weekly" ? { day_of_week: dayOfWeek } : {}),
      ...(cadence === "monthly" ? { day_of_month: dayOfMonth } : {}),
    };
    if (audience && audience !== (row.audience_slug ?? "")) body.audience_slug = audience;
    if (!row.deliverable_id && template && template !== (row.template_id ?? "")) body.template_id = template;
    void onSubmit(row.id, body);
  }

  const selectCls =
    "w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-primary [&>option]:text-black";
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-3">
      <label className="text-xs text-gray-400">
        Cadence
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={selectCls}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {cadence === "weekly" && (
        <label className="text-xs text-gray-400">
          Day
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={selectCls}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </label>
      )}
      {cadence === "monthly" && (
        <label className="text-xs text-gray-400">
          Day of month
          <input
            type="number" min={1} max={28} value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className={selectCls}
          />
        </label>
      )}
      <label className="text-xs text-gray-400">
        Send hour
        <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={selectCls}>
          {HOURS.map((h) => (
            <option key={h.value} value={h.value}>{h.label}</option>
          ))}
        </select>
      </label>
      {audienceOptions.length > 0 && (
        <label className="text-xs text-gray-400">
          Audience
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className={selectCls}>
            {audienceOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      )}
      {!row.deliverable_id && (
        <label className="text-xs text-gray-400">
          Template
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className={selectCls}>
            {template && !(template in EMAIL_TEMPLATES) && <option value={template}>{template}</option>}
            {Object.keys(EMAIL_TEMPLATES).map((slug) => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
        </label>
      )}
      <div className="col-span-2 flex items-end sm:col-span-3">
        <button
          type="submit" disabled={busy}
          className="rounded-lg bg-teal-primary/90 px-3 py-1.5 text-xs font-medium text-[#0a1419] hover:bg-teal-primary disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
```

Notes baked in: a schedule bound to a saved design (`deliverable_id` set) hides the template select and labels itself "sends your saved email design" — never expose the internal `block-canvas` id; the audience select shows only real audiences (current + the user's `email_audiences`), never free text.

- [ ] **Step 3: `app/account/schedules/page.tsx`:**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { loadAccountSchedules } from "@/lib/email/account-schedules";
import { ScheduleManager } from "@/components/account/ScheduleManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email schedule — SWFL Data Gulf" };

export default async function AccountSchedulesPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/schedules");
  const { schedules, audiences } = await loadAccountSchedules(supabase);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-white">Email schedule</h1>
      <ScheduleManager schedules={schedules} audiences={audiences} />
    </main>
  );
}
```

- [ ] **Step 4: `app/@accountModal/(.)account/schedules/page.tsx`** — same fetch, modal wrapper:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadAccountSchedules } from "@/lib/email/account-schedules";
import { AccountModalShell } from "@/components/account/AccountModalShell";
import { ScheduleManager } from "@/components/account/ScheduleManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountSchedulesModal() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/schedules");
  const { schedules, audiences } = await loadAccountSchedules(supabase);
  return (
    <AccountModalShell title="Email schedule">
      <ScheduleManager schedules={schedules} audiences={audiences} />
    </AccountModalShell>
  );
}
```

- [ ] **Step 5: Verify** — check `describeCadence`'s exact signature in `lib/email/schedule-cadence.ts` before building (if it differs from `(cadence, day_of_week, day_of_month, send_hour_et)`, adapt the ONE call in ScheduleManager to it), then:

Run: `bunx next build 2>&1 | tail -5`
Expected: build succeeds; routes `/account/schedules` present.

- [ ] **Step 6: Commit**

```bash
git add lib/email/account-schedules.ts components/account/ScheduleManager.tsx app/account/schedules/page.tsx "app/@accountModal/(.)account/schedules/page.tsx"
git commit -m "feat(account): cross-project email-schedule surface (full edit) on the shared write core"
```

---

### Task 11: Register the brand-reveal handlers on the three surfaces

**Files:**
- Modify: `app/project/[id]/ProjectWorkspace.tsx` (pill row container ~:533)
- Modify: `components/email-lab/EmailLabShell.tsx` (brand accordion, `showBrand` at :236, section ~:920)
- Modify: `components/email-lab/EmailLabGridShell.tsx` (brand accordion, `showBrand` at :284, section :1460)

**Interfaces:**
- Consumes: `registerBrandPanel`, `pulseBrandPanel` (Task 5).

- [ ] **Step 1: ProjectWorkspace** — add imports, a ref on the Brand-pill wrapper div (the container around the pill buttons + popover, ~:533), and a registration effect near the other effects:

```tsx
import { registerBrandPanel, pulseBrandPanel } from "@/lib/brand/reveal-brand-panel";
// ...
const brandRevealRef = useRef<HTMLDivElement>(null);
// Account-menu Brand click lands HERE when this workspace is on screen: open the
// pill popover, scroll to it, pulse (spec 2026-07-05-account-quick-access).
useEffect(
  () =>
    registerBrandPanel(() => {
      setActivePill("brand");
      requestAnimationFrame(() => pulseBrandPanel(brandRevealRef.current));
    }),
  [],
);
```

Attach `ref={brandRevealRef}` to the pill-row wrapper div.

- [ ] **Step 2: EmailLabShell** — same pattern: `ref` on the Brand accordion's outer `<div>` (the one containing the toggle button at ~:920–930), effect:

```tsx
useEffect(
  () =>
    registerBrandPanel(() => {
      setShowBrand(true);
      requestAnimationFrame(() => pulseBrandPanel(brandRevealRef.current));
    }),
  [],
);
```

- [ ] **Step 3: EmailLabGridShell** — identical registration on its Brand section `<div>` at :1460. Inert today (`/email-lab/grid` renders no SiteShell → no menu) but any future in-grid caller of `revealBrandPanel()` gets it free; costs one effect.

- [ ] **Step 4: Verify**

Run: `bunx next build 2>&1 | tail -5` and `bun test lib/brand/reveal-brand-panel.test.ts`
Expected: both pass. (Worktree/subagent note: if Edit is blocked, mutate via file-based Bash and grep-verify no U+FFFD — memory `feedback_subagent-dev-in-worktree-edit-friction`.)

- [ ] **Step 5: Commit**

```bash
git add "app/project/[id]/ProjectWorkspace.tsx" components/email-lab/EmailLabShell.tsx components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(brand): reveal registrations — workspace pill + lab accordions (open/scroll/pulse)"
```

---

### Task 12: Full verification + ledger

- [ ] **Step 1: Full test sweep**

Run: `bun test components/nav lib/brand lib/email 2>&1 | tail -15`
Expected: all pass, including the pre-existing email suites (audience-sync, schedule-upsert, schedule-signature).

- [ ] **Step 2: Build gate**

Run: `bunx next build 2>&1 | tail -10`
Expected: success.

- [ ] **Step 3: Manual smoke (dev)** — `bun dev`, then: signed-in on `/charts` → account menu → Brand → modal overlays `/charts`; Esc returns; hard-load `/account/brand` → full page; on `/project/<id>` → Brand → the PILL popover opens + pulses (no modal); `/account/schedules` lists rows; Pause→Resume round-trips and `next_run_at` repopulates.

- [ ] **Step 4: Ledger + queue** — append a SESSION_LOG.md entry (what shipped, spec + plan paths, what's next: operator live-verify); sync `_AUDIT_AND_ROADMAP/build-queue.md`. Commit those with explicit paths.

- [ ] **Step 5: STOP — no push.** Show `git log --oneline origin/main..HEAD` and ask the operator to confirm the push. The `account_quick_access_live_verify` check closes ONLY on the operator's live proof (rule: checks are prod evidence, not dev attestation).
