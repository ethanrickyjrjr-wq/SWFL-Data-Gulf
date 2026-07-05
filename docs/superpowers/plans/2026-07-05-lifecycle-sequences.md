# Listing Lifecycle Sequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 13 tasks, 30 files, keywords: migration, schema, architecture

**Goal:** One listing campaign becomes a milestone-fired arc (Coming Soon → New Listing → Market Comps → Under Contract → Sold): arm once with $0 layout previews, build any step on demand, fire each milestone manually with Send-now or a frozen scheduled send, and save the shaped arc as a reusable per-user setup.

**Architecture:** Two new owner-scoped tables (`email_sequence_setups`, `email_sequences`) hold arc state the cron worker never reads. A new `"once"` cadence rides the existing scheduler: `computeNextRunAt → null` parks a fired row, the runner flips it to `status='completed'`, and a stable idempotency key (`once:<scheduleId>`) makes every fire at-most-once forever. Send-now runs the identical `processSchedule` core in-request with the cron as crash fallback. `lib/email/scheduler.ts` is **not modified**.

**Tech Stack:** Next.js App Router, Supabase (typed client via `database.types.ts`), Bun tests (`bun:test`), zod, existing DI seams in `lib/email/`.

**Spec:** `docs/superpowers/specs/2026-07-05-lifecycle-sequences-design.md` (operator-approved 07/05/2026).

## Global Constraints

- **`lib/email/scheduler.ts` must not be modified.** All once-lane behavior lives in the runner deps, new lib files, and routes.
- **Never `git add -A`** — stage explicit paths only. Commit per task. **STOP after the final commit — pushing requires the operator's explicit approval.**
- `scripts/email/run-schedules.mts` and `lib/email/scheduler.ts` are frequently claimed by parallel sessions — run `git status` and heed repolith claim warnings before editing; coordinate, don't clobber.
- Verify with `bunx next build`, never bare `npx tsc`.
- UI copy never leads with "AI"; "every number sourced" framing. No subject-property value estimates anywhere.
- Layout classes: `h-full` / `dvh`, never `h-screen`.
- Freeze-warning copy verbatim (operator-locked): "Scheduling locks this email. It can't be edited or sent until {time} — unlock to change it."
- Typed Supabase client — after the migration, regenerate types with `bun run gen:types`; never reach for `*Untyped` hatches.
- All tests green after every task; existing scheduler/occurrence/upsert/signature tests must stay untouched-green.
- Suspect a flaky test first when CI reddens unrelated to your diff — loop it locally before blaming the commit.

---

### Task 1: `"once"` cadence in the cadence math

**Files:**
- Modify: `lib/email/schedule-cadence.ts` (type at line 14, `describeCadence` ~line 67, `computeNextRunAt` ~line 152)
- Test: `lib/email/__tests__/schedule-cadence.test.ts` (append a describe block)

**Interfaces:**
- Produces: `Cadence` union gains `"once"`. `computeNextRunAt({cadence:"once",...})` returns `null`. `describeCadence({cadence:"once", send_hour_et})` returns `` `one-time send at ${hourLabel} ET` ``.
- Consumed by: every later task; the scheduler core (`rowCadenceSpec`) already passes `row.cadence` through as `CadenceSpec["cadence"]`, so a fired once row parks itself with **zero scheduler.ts changes**.

- [ ] **Step 1: Write the failing tests** — append to `lib/email/__tests__/schedule-cadence.test.ts`:

```ts
describe('cadence "once" (lifecycle sequences)', () => {
  test("computeNextRunAt returns null — a fired one-shot parks itself", () => {
    expect(computeNextRunAt({ cadence: "once", send_hour_et: 9 }, new Date("2026-07-06T12:00:00Z"))).toBeNull();
  });
  test("describeCadence labels it a one-time send", () => {
    expect(describeCadence({ cadence: "once", send_hour_et: 9 })).toBe("one-time send at 9 AM ET");
  });
});
```

(Match the file's existing import style — `computeNextRunAt` / `describeCadence` are already imported there.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/__tests__/schedule-cadence.test.ts`
Expected: FAIL — TS error `"once"` not assignable to `Cadence`.

- [ ] **Step 3: Implement.** In `lib/email/schedule-cadence.ts`:

```ts
export type Cadence = "daily" | "weekly" | "monthly" | "once";
```

In `describeCadence`, before the `weekly` branch:

```ts
  if (spec.cadence === "once") return `one-time send ${at}`;
```

In `computeNextRunAt`, immediately after the destructure line (`const { cadence, send_hour_et } = spec;`):

```ts
  // "once" (lifecycle sequences): a one-shot has NO next occurrence. Returning
  // null makes the worker's re-arm park the row after its single fire — one-shot
  // semantics fall out of the existing machinery. next_run_at is set explicitly
  // by the milestone API at create time, never computed here.
  if (cadence === "once") return null;
```

- [ ] **Step 4: Run the whole email test dir**

Run: `bun test lib/email/`
Expected: ALL PASS (existing suites untouched-green).

- [ ] **Step 5: Commit**

```bash
git add lib/email/schedule-cadence.ts lib/email/__tests__/schedule-cadence.test.ts
git commit -m "feat(sequences): once cadence — computeNextRunAt null parks a fired one-shot"
```

---

### Task 2: validator + recipe bridge accept `"once"`

**Files:**
- Modify: `lib/email/schedule-command.ts` (`cadenceSchema` line ~168, `requireCadence` line ~222)
- Test: `lib/email/__tests__/schedule-command.test.ts` (append)

**Interfaces:**
- Produces: `validateToolInput({action:"create", cadence:"once", send_hour_et, template_id:"block-canvas", deliverable_id})` → `{ok:true}` with no day-field requirement.
- `lib/deliverable/schedule-recipe.ts` needs **no code change** — `ScheduleChoices.cadence` is typed `Cadence`, and its block-canvas lane already passes cadence through `validateToolInput`. The test proves it.

- [ ] **Step 1: Write the failing tests** — append to `lib/email/__tests__/schedule-command.test.ts`:

```ts
import { deliverableToScheduleRecipe } from "@/lib/deliverable/schedule-recipe";

describe('validateToolInput cadence "once"', () => {
  test("create with once needs no day fields", () => {
    const r = validateToolInput({
      action: "create", cadence: "once", send_hour_et: 14,
      template_id: "block-canvas", deliverable_id: "d-123",
    });
    expect(r.ok).toBe(true);
  });
  test("recipe bridge builds a once block-canvas command", () => {
    const r = deliverableToScheduleRecipe(
      { id: "d-123", template: "block-canvas", scope_kind: "zip", scope_value: "33904" },
      { cadence: "once", send_hour_et: 14 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.cadence).toBe("once");
      expect(r.command.deliverable_id).toBe("d-123");
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/__tests__/schedule-command.test.ts`
Expected: FAIL — zod rejects `"once"` (`cadence: Invalid enum value`).

- [ ] **Step 3: Implement.** In `lib/email/schedule-command.ts` line ~168:

```ts
const cadenceSchema = z.enum(["daily", "weekly", "monthly", "once"]);
```

`requireCadence` already only adds day requirements for `weekly`/`monthly` — `once` sails through. Update the error string for honesty:

```ts
      errors.push("cadence is required (daily | weekly | monthly | once)");
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/schedule-command.ts lib/email/__tests__/schedule-command.test.ts
git commit -m "feat(sequences): validator accepts once cadence; recipe bridge proven for one-shot block-canvas"
```

---

### Task 3: migration — `email_sequence_setups` + `email_sequences`

**Files:**
- Create: `docs/sql/20260705_email_sequences.sql`
- Modify: `database.types.ts` (regenerated by script — never hand-edit)

**Interfaces:**
- Produces: two tables with RLS owner policies; partial unique indexes `one_default` (setups) and `one_armed` (sequences). Later tasks read them through the typed client.

- [ ] **Step 1: Write the SQL** — `docs/sql/20260705_email_sequences.sql`:

```sql
-- Lifecycle sequences (spec 2026-07-05-lifecycle-sequences-design.md).
-- Idempotent. The cron worker NEVER reads these tables — UI + milestone API only.

CREATE TABLE IF NOT EXISTS public.email_sequence_setups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  steps       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- At most ONE default setup per user (it auto-applies to new listing projects).
CREATE UNIQUE INDEX IF NOT EXISTS email_sequence_setups_one_default
  ON public.email_sequence_setups (user_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.email_sequences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  project_id  text NOT NULL,                       -- soft-link to public.projects.id (no FK)
  setup_name  text,                                -- provenance label only, never a FK
  status      text NOT NULL DEFAULT 'armed',       -- armed | completed | stopped
  audience_slug text,
  send_hour_et  smallint,
  steps       jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One live arc per listing project.
CREATE UNIQUE INDEX IF NOT EXISTS email_sequences_one_armed
  ON public.email_sequences (project_id) WHERE status = 'armed';

ALTER TABLE public.email_sequence_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY email_sequence_setups_owner_all ON public.email_sequence_setups
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY email_sequences_owner_all ON public.email_sequences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.email_sequence_setups FROM anon;
REVOKE ALL ON public.email_sequences       FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequence_setups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sequences       TO authenticated;
GRANT ALL ON public.email_sequence_setups TO service_role;
GRANT ALL ON public.email_sequences       TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it**

Run: `bun scripts/run-migration.ts docs/sql/20260705_email_sequences.sql`
Expected: `✓ done` / `Migrations complete.`

- [ ] **Step 3: Verify tables exist** (row-count check per RULE 1):

Run: `bun scripts/run-migration.ts` is create-only, so verify via a one-liner — create `verify.sql` in the scratchpad with `SELECT count(*) FROM public.email_sequence_setups; SELECT count(*) FROM public.email_sequences;` and run it the same way, OR query through the lake MCP. Expected: `0` and `0`, no error.

- [ ] **Step 4: Regenerate the typed client**

Run: `bun run gen:types`
Expected: `database-generated.types.ts` gains `email_sequence_setups` + `email_sequences` blocks. Then `bunx next build` still compiles (run it if any type errors surface downstream).

- [ ] **Step 5: Commit**

```bash
git add docs/sql/20260705_email_sequences.sql database-generated.types.ts
git commit -m "feat(sequences): email_sequence_setups + email_sequences tables, RLS, one-default/one-armed indexes"
```

(If the generator writes `database.types.ts` instead, stage that path — stage exactly what changed, nothing else.)

---

### Task 4: sequence types + the platform arc

**Files:**
- Create: `lib/email/sequence/types.ts`
- Test: `lib/email/sequence/__tests__/types.test.ts`

**Interfaces:**
- Produces:
  - `STEP_KEYS`, `StepKey`, `StepState = "pending"|"built"|"scheduled"|"sent"|"skipped"`
  - `SetupStep { key, title, recipe_prompt, seed_doc_id }`, `SequenceStep extends SetupStep { state, deliverable_id?, schedule_id?, scheduled_for?, sent_at? }`
  - `SequenceStepsSchema` (zod, parses the jsonb `steps` column)
  - `PLATFORM_ARC: SetupStep[]` (the five listing-to-close recipes verbatim)
  - `stepSectionLabels(seedDocId): string[]` — human labels of the seed doc's blocks, for the $0 layout preview.

- [ ] **Step 1: Write the failing tests** — `lib/email/sequence/__tests__/types.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  PLATFORM_ARC, SequenceStepsSchema, STEP_KEYS, stepSectionLabels,
} from "@/lib/email/sequence/types";
import { seedById } from "@/lib/email/doc/default-docs";

describe("PLATFORM_ARC", () => {
  test("five steps, in lifecycle order", () => {
    expect(PLATFORM_ARC.map((s) => s.key)).toEqual([
      "coming-soon", "new-listing", "market-comps", "under-contract", "sold",
    ]);
    expect(STEP_KEYS.length).toBe(5);
  });
  test("every step's seed doc exists and prompt carries the address blank", () => {
    for (const s of PLATFORM_ARC) {
      expect(seedById(s.seed_doc_id)).toBeDefined();
      expect(s.recipe_prompt).toContain("[[your listing address]]");
    }
  });
  test("steps jsonb round-trips through the zod schema", () => {
    const steps = PLATFORM_ARC.map((s) => ({ ...s, state: "pending" as const }));
    const parsed = SequenceStepsSchema.safeParse(JSON.parse(JSON.stringify(steps)));
    expect(parsed.success).toBe(true);
  });
  test("stepSectionLabels returns a non-empty section list for each step", () => {
    for (const s of PLATFORM_ARC) expect(stepSectionLabels(s.seed_doc_id).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/sequence/`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/email/sequence/types.ts`:

```ts
/**
 * lib/email/sequence/types.ts — lifecycle-sequence step + setup shapes.
 * Spec: docs/superpowers/specs/2026-07-05-lifecycle-sequences-design.md.
 * The steps jsonb on email_sequences / email_sequence_setups parses through
 * these schemas at every boundary — never trust stored JSON blind.
 */
import { z } from "zod";
import { seedById } from "@/lib/email/doc/default-docs";

export const STEP_KEYS = [
  "coming-soon", "new-listing", "market-comps", "under-contract", "sold",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type StepState = "pending" | "built" | "scheduled" | "sent" | "skipped";

export const SetupStepSchema = z.object({
  key: z.enum(STEP_KEYS),
  title: z.string().min(1),
  recipe_prompt: z.string().min(1),
  seed_doc_id: z.string().min(1),
});
export type SetupStep = z.infer<typeof SetupStepSchema>;

export const SequenceStepSchema = SetupStepSchema.extend({
  state: z.enum(["pending", "built", "scheduled", "sent", "skipped"]),
  deliverable_id: z.string().nullish(),
  schedule_id: z.number().int().nullish(),
  scheduled_for: z.string().nullish(),
  sent_at: z.string().nullish(),
});
export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export const SequenceStepsSchema = z.array(SequenceStepSchema);
export const SetupStepsSchema = z.array(SetupStepSchema);

/** The platform arc — the five listing-to-close recipes VERBATIM from
 *  lib/showcase/registry.ts, each paired with an existing seed layout. Users
 *  without a saved default arm from this constant (it has no DB row). */
export const PLATFORM_ARC: SetupStep[] = [
  {
    key: "coming-soon",
    title: "Coming Soon",
    recipe_prompt:
      "Build a coming-soon teaser email for my listing at [[your listing address]] — hold the street address back, use real county inventory counts to show how scarce homes like it are, and one CTA to join a private preview list.",
    seed_doc_id: "listing-feature",
  },
  {
    key: "new-listing",
    title: "New Listing",
    recipe_prompt:
      "Build a new-listing announcement email for my listing at [[your listing address]] — key specs, price per square foot, a chart of the ZIP's home-value trend, and one honest line about where that market sits.",
    seed_doc_id: "new-listing",
  },
  {
    key: "market-comps",
    title: "Market Comps",
    recipe_prompt:
      "Build a market-comps email for my listing at [[your listing address]] — six live comparable listings nearby with each price and price per square foot, a price bar chart, and a straight case for my asking price.",
    seed_doc_id: "neighborhood-report",
  },
  {
    key: "under-contract",
    title: "Under Contract",
    recipe_prompt:
      "Build an under-contract announcement email for my listing at [[your listing address]] — lead with how fast it went pending compared to the ZIP's typical days on market, and invite backup offers.",
    seed_doc_id: "market-spotlight",
  },
  {
    key: "sold",
    title: "Sold",
    recipe_prompt:
      "Build a just-sold email for my listing at [[your listing address]] — set the close among the week's real sales nearby, and end with a private home-valuation offer for my readers.",
    seed_doc_id: "just-sold",
  },
];

const BLOCK_LABELS: Record<string, string> = {
  header: "Header", hero: "Hero", text: "Text", image: "Image", button: "Button",
  chart: "Live chart", stats: "Live stats", listing: "Listing card", divider: "Divider",
  social: "Social links", footer: "Footer", spacer: "Spacer",
};

/** Human section labels for the $0 layout preview ("all layouts with numbers and
 *  sections that will change" — operator, 07/05/2026). Unknown block types fall
 *  back to their raw type string rather than vanishing. */
export function stepSectionLabels(seedDocId: string): string[] {
  const seed = seedById(seedDocId);
  if (!seed) return [];
  return seed.build().blocks.map((b) => BLOCK_LABELS[b.type] ?? b.type);
}
```

NOTE: check the real `EmailDoc` block `type` strings in `lib/email/doc/types.ts` while implementing and adjust `BLOCK_LABELS` keys to the actual union members — the test only requires a non-empty list, but labels should be honest.

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/sequence/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/sequence/types.ts lib/email/sequence/__tests__/types.test.ts
git commit -m "feat(sequences): step/setup schemas + PLATFORM_ARC from the listing-to-close recipes"
```

---

### Task 5: pure step-state machine

**Files:**
- Create: `lib/email/sequence/state.ts`
- Test: `lib/email/sequence/__tests__/state.test.ts`

**Interfaces:**
- Produces (all pure, all return a NEW array, all throw `Error` with a `sequence:` message on an illegal transition — API routes catch → 409):
  - `applySetup(setup: SetupStep[]): SequenceStep[]` — every step `state:"pending"`.
  - `markBuilt(steps, key: StepKey, deliverableId: string): SequenceStep[]` — legal from `pending`/`built`; illegal from `scheduled` (frozen), `sent`, `skipped`.
  - `markScheduled(steps, key, scheduleId: number, scheduledForIso: string)` — legal from `built` only.
  - `markUnlocked(steps, key)` — legal from `scheduled` only; back to `built`, clears `schedule_id`/`scheduled_for`.
  - `markSkipped(steps, key)` — legal from `pending`/`built`.
  - `markSent(steps, key, sentAtIso)` — legal from `scheduled` only.
  - `reconcileSent(steps, rows: {id: number; status: string; last_run_at: string | null}[])` — any `scheduled` step whose schedule row is `status==='completed'` flips to `sent` with `sent_at = row.last_run_at`.

- [ ] **Step 1: Write the failing tests** — `lib/email/sequence/__tests__/state.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { PLATFORM_ARC } from "@/lib/email/sequence/types";
import {
  applySetup, markBuilt, markScheduled, markSent, markSkipped, markUnlocked, reconcileSent,
} from "@/lib/email/sequence/state";

const armed = () => applySetup(PLATFORM_ARC);

describe("sequence state machine", () => {
  test("applySetup arms five pending steps", () => {
    expect(armed().every((s) => s.state === "pending")).toBe(true);
  });
  test("build → schedule → sent happy path", () => {
    let s = markBuilt(armed(), "new-listing", "d-1");
    expect(s.find((x) => x.key === "new-listing")!.state).toBe("built");
    s = markScheduled(s, "new-listing", 42, "2026-07-07T13:00:00Z");
    const step = s.find((x) => x.key === "new-listing")!;
    expect(step.state).toBe("scheduled");
    expect(step.schedule_id).toBe(42);
    s = markSent(s, "new-listing", "2026-07-07T13:04:00Z");
    expect(s.find((x) => x.key === "new-listing")!.state).toBe("sent");
  });
  test("a scheduled (frozen) step refuses edits", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    expect(() => markBuilt(s, "sold", "d-3")).toThrow(/frozen|scheduled/);
  });
  test("unlock returns a scheduled step to built and clears the schedule", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    s = markUnlocked(s, "sold");
    const step = s.find((x) => x.key === "sold")!;
    expect(step.state).toBe("built");
    expect(step.schedule_id ?? null).toBeNull();
  });
  test("a sent step can never re-fire", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    s = markSent(s, "sold", "2026-07-08T13:02:00Z");
    expect(() => markScheduled(s, "sold", 8, "2026-07-09T13:00:00Z")).toThrow();
  });
  test("skip is legal from pending, illegal from sent", () => {
    const s = markSkipped(armed(), "coming-soon");
    expect(s.find((x) => x.key === "coming-soon")!.state).toBe("skipped");
  });
  test("reconcileSent flips scheduled→sent from a completed schedule row", () => {
    let s = markBuilt(armed(), "market-comps", "d-9");
    s = markScheduled(s, "market-comps", 99, "2026-07-08T13:00:00Z");
    const out = reconcileSent(s, [{ id: 99, status: "completed", last_run_at: "2026-07-08T13:05:00Z" }]);
    const step = out.find((x) => x.key === "market-comps")!;
    expect(step.state).toBe("sent");
    expect(step.sent_at).toBe("2026-07-08T13:05:00Z");
  });
  test("order is advisory — any pending step can build/fire regardless of neighbors", () => {
    const s = markBuilt(armed(), "sold", "d-last");
    expect(s.find((x) => x.key === "sold")!.state).toBe("built");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/sequence/` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/email/sequence/state.ts`:

```ts
/**
 * lib/email/sequence/state.ts — PURE step-state transitions for a listing arc.
 * No I/O, no Date. Every mutator returns a NEW array and throws on an illegal
 * transition (routes catch → 409). Order is advisory by operator decree
 * (07/05/2026): transitions gate on the STEP's own state, never its neighbors'.
 */
import type { SequenceStep, SetupStep, StepKey, StepState } from "./types";

function transition(
  steps: SequenceStep[],
  key: StepKey,
  legalFrom: StepState[],
  patch: Partial<SequenceStep>,
  verb: string,
): SequenceStep[] {
  const step = steps.find((s) => s.key === key);
  if (!step) throw new Error(`sequence: unknown step "${key}"`);
  if (!legalFrom.includes(step.state)) {
    const why = step.state === "scheduled" ? "it is scheduled (frozen)" : `it is ${step.state}`;
    throw new Error(`sequence: cannot ${verb} "${key}" — ${why}`);
  }
  return steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

export function applySetup(setup: SetupStep[]): SequenceStep[] {
  return setup.map((s) => ({ ...s, state: "pending" as const }));
}

export function markBuilt(steps: SequenceStep[], key: StepKey, deliverableId: string) {
  return transition(steps, key, ["pending", "built"], { state: "built", deliverable_id: deliverableId }, "build/edit");
}

export function markScheduled(
  steps: SequenceStep[], key: StepKey, scheduleId: number, scheduledForIso: string,
) {
  return transition(steps, key, ["built"], {
    state: "scheduled", schedule_id: scheduleId, scheduled_for: scheduledForIso,
  }, "schedule");
}

export function markUnlocked(steps: SequenceStep[], key: StepKey) {
  return transition(steps, key, ["scheduled"], {
    state: "built", schedule_id: null, scheduled_for: null,
  }, "unlock");
}

export function markSkipped(steps: SequenceStep[], key: StepKey) {
  return transition(steps, key, ["pending", "built"], { state: "skipped" }, "skip");
}

export function markSent(steps: SequenceStep[], key: StepKey, sentAtIso: string) {
  return transition(steps, key, ["scheduled"], { state: "sent", sent_at: sentAtIso }, "mark sent");
}

/** Truth for "sent" comes from the schedule row, never asserted blind: a
 *  completed once row means the worker fired it (status flip is Task 7). */
export function reconcileSent(
  steps: SequenceStep[],
  rows: { id: number; status: string; last_run_at: string | null }[],
): SequenceStep[] {
  const done = new Map(rows.filter((r) => r.status === "completed").map((r) => [r.id, r]));
  return steps.map((s) =>
    s.state === "scheduled" && s.schedule_id != null && done.has(s.schedule_id)
      ? { ...s, state: "sent" as const, sent_at: done.get(s.schedule_id)!.last_run_at }
      : s,
  );
}
```

- [ ] **Step 4: Run tests** — `bun test lib/email/sequence/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/sequence/state.ts lib/email/sequence/__tests__/state.test.ts
git commit -m "feat(sequences): pure step-state machine — frozen refuses edits, sent never re-fires"
```

---

### Task 6: setups — snapshot + arm resolution

**Files:**
- Create: `lib/email/sequence/setup.ts`
- Test: `lib/email/sequence/__tests__/setup.test.ts`

**Interfaces:**
- Produces:
  - `snapshotSetup(steps: SequenceStep[]): SetupStep[]` — strips ALL runtime state (deliverable/schedule ids, states, timestamps); keeps key/title/prompt/seed. Project data never leaks into a setup (operator rule).
  - `resolveArmSteps(setups: {name: string; is_default: boolean; steps: unknown}[]): {source: string; steps: SetupStep[]}` — the user's default (validated) if one exists, else `{source: "platform", steps: PLATFORM_ARC}`. An unparseable saved setup falls back to platform (never crashes arming).

- [ ] **Step 1: Failing tests** — `lib/email/sequence/__tests__/setup.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { PLATFORM_ARC } from "@/lib/email/sequence/types";
import { applySetup, markBuilt, markScheduled } from "@/lib/email/sequence/state";
import { resolveArmSteps, snapshotSetup } from "@/lib/email/sequence/setup";

describe("setups", () => {
  test("snapshotSetup strips runtime state, keeps the recipe", () => {
    let s = markBuilt(applySetup(PLATFORM_ARC), "sold", "d-1");
    s = markScheduled(s, "sold", 5, "2026-07-08T13:00:00Z");
    const snap = snapshotSetup(s);
    expect(snap).toHaveLength(5);
    for (const step of snap) {
      expect(step).not.toHaveProperty("state");
      expect(step).not.toHaveProperty("deliverable_id");
      expect(step).not.toHaveProperty("schedule_id");
      expect(step.recipe_prompt.length).toBeGreaterThan(0);
    }
  });
  test("resolveArmSteps prefers the user default", () => {
    const mine = PLATFORM_ARC.map((s) => ({ ...s, recipe_prompt: s.recipe_prompt + " In my voice." }));
    const r = resolveArmSteps([{ name: "Luxury arc", is_default: true, steps: mine }]);
    expect(r.source).toBe("Luxury arc");
    expect(r.steps[0].recipe_prompt).toContain("In my voice.");
  });
  test("no default → platform arc", () => {
    const r = resolveArmSteps([{ name: "Spare", is_default: false, steps: PLATFORM_ARC }]);
    expect(r.source).toBe("platform");
    expect(r.steps).toEqual(PLATFORM_ARC);
  });
  test("corrupt saved default falls back to platform, never throws", () => {
    const r = resolveArmSteps([{ name: "Broken", is_default: true, steps: { not: "an array" } }]);
    expect(r.source).toBe("platform");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/sequence/` → FAIL.

- [ ] **Step 3: Implement** — `lib/email/sequence/setup.ts`:

```ts
/** lib/email/sequence/setup.ts — pure setup snapshot + arm-time resolution. */
import { PLATFORM_ARC, SetupStepsSchema, type SequenceStep, type SetupStep } from "./types";

export function snapshotSetup(steps: SequenceStep[]): SetupStep[] {
  return steps.map(({ key, title, recipe_prompt, seed_doc_id }) => ({
    key, title, recipe_prompt, seed_doc_id,
  }));
}

export function resolveArmSteps(
  setups: { name: string; is_default: boolean; steps: unknown }[],
): { source: string; steps: SetupStep[] } {
  const def = setups.find((s) => s.is_default);
  if (def) {
    const parsed = SetupStepsSchema.safeParse(def.steps);
    if (parsed.success && parsed.data.length > 0) return { source: def.name, steps: parsed.data };
  }
  return { source: "platform", steps: PLATFORM_ARC };
}
```

- [ ] **Step 4: Run tests** — `bun test lib/email/sequence/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/sequence/setup.ts lib/email/sequence/__tests__/setup.test.ts
git commit -m "feat(sequences): setup snapshot (no project data) + default-first arm resolution"
```

---

### Task 7: frozen occurrence + once helpers + runner wiring

**Files:**
- Create: `lib/email/sequence/once.ts`
- Create: `lib/email/sequence/frozen-occurrence.ts`
- Modify: `scripts/email/run-schedules.mts` (buildContent ~line 385, claimSend/releaseSend ~line 531, rearm ~line 491, reaper ~line 213)
- Test: `lib/email/sequence/__tests__/once.test.ts`, `lib/email/sequence/__tests__/frozen-occurrence.test.ts`

**Interfaces:**
- Produces:
  - `isSequenceOnceRow(row: Pick<ScheduleRow,"cadence"|"template_id"|"deliverable_id">): boolean` — `cadence==="once" && template_id==="block-canvas" && !!deliverable_id`.
  - `onceClaimKey(row: Pick<ScheduleRow,"id">): string` — `` `once:${row.id}` ``. **Date-free**: a one-shot fires at most once EVER, so a crash-orphan healed days later still dedupes.
  - `buildFrozenOccurrence(deliverableId, deps: {loadDeliverable, renderDoc, log?}): Promise<EmailDocOccurrence | null>` — render the SAVED doc verbatim: no `buildDoc`, no AI refill (freeze semantics + send-now "what you see is what sends"). Reuses `EmailDocSchema`, `deriveEmailDocSubject`, `bindUnsubscribeHref`.
- Consumes: `EmailDocDeliverable`/`EmailDocOccurrence` from `lib/email/emaildoc-occurrence.ts`, `UNSUBSCRIBE_TOKEN` from scheduler.

- [ ] **Step 1: Failing tests.**

`lib/email/sequence/__tests__/once.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";

describe("once helpers", () => {
  test("identifies a sequence one-shot row", () => {
    expect(isSequenceOnceRow({ cadence: "once", template_id: "block-canvas", deliverable_id: "d-1" })).toBe(true);
    expect(isSequenceOnceRow({ cadence: "weekly", template_id: "block-canvas", deliverable_id: "d-1" })).toBe(false);
    expect(isSequenceOnceRow({ cadence: "once", template_id: "report", deliverable_id: null })).toBe(false);
  });
  test("claim key is stable and date-free", () => {
    expect(onceClaimKey({ id: 42 })).toBe("once:42");
  });
});
```

`lib/email/sequence/__tests__/frozen-occurrence.test.ts` (build a minimal valid `EmailDoc` the same way `lib/email/__tests__/scheduler.test.ts` or the emaildoc-occurrence tests do — copy their fixture helper; the assertions):

```ts
import { describe, expect, test } from "bun:test";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
import { defaultDoc } from "@/lib/email/doc/default-docs";

const doc = defaultDoc(); // a valid EmailDoc fixture

describe("buildFrozenOccurrence", () => {
  test("renders the saved doc verbatim — renderDoc receives the STORED doc", async () => {
    let rendered: unknown = null;
    const out = await buildFrozenOccurrence("d-1", {
      loadDeliverable: async () => ({
        doc, instruction: null, scope_kind: null, scope_value: null, template: "block-canvas",
      }),
      renderDoc: async (d) => { rendered = d; return "<html><body>frozen</body></html>"; },
    });
    expect(out).not.toBeNull();
    expect(rendered).toEqual(doc);           // NOT a rebuilt doc — frozen means frozen
    expect(out!.emailDocHtml).toContain("frozen");
    expect(out!.body).toBe("");
  });
  test("missing deliverable → null", async () => {
    const out = await buildFrozenOccurrence("gone", {
      loadDeliverable: async () => null,
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
  test("non-block-canvas → null", async () => {
    const out = await buildFrozenOccurrence("d-2", {
      loadDeliverable: async () => ({
        doc, instruction: null, scope_kind: null, scope_value: null, template: "pdf",
      }),
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
  test("invalid stored doc → null", async () => {
    const out = await buildFrozenOccurrence("d-3", {
      loadDeliverable: async () => ({
        doc: { junk: true }, instruction: null, scope_kind: null, scope_value: null, template: "block-canvas",
      }),
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/sequence/` → FAIL.

- [ ] **Step 3: Implement the two lib files.**

`lib/email/sequence/once.ts`:

```ts
/** lib/email/sequence/once.ts — identity + idempotency-key helpers for
 *  sequence one-shot rows. Shared by the cron runner and the send-now route so
 *  the two paths can never derive different keys. */

export function isSequenceOnceRow(row: {
  cadence?: string | null; template_id?: string | null; deliverable_id?: string | null;
}): boolean {
  return row.cadence === "once" && row.template_id === "block-canvas" && !!row.deliverable_id;
}

/** DATE-FREE by design: a one-shot fires at most once EVER. The digest lane's
 *  date-suffixed key would double-send a crash-orphan healed past midnight. */
export function onceClaimKey(row: { id: number }): string {
  return `once:${row.id}`;
}
```

`lib/email/sequence/frozen-occurrence.ts`:

```ts
/**
 * lib/email/sequence/frozen-occurrence.ts — ONE occurrence of a sequence
 * one-shot: render the SAVED doc verbatim. No buildDoc, no AI refill, no figure
 * swap — "what they saw when they scheduled is what goes out" (spec, operator-
 * locked 07/05/2026). Send-now uses it too: what you see is what sends.
 * DI mirror of emaildoc-occurrence.ts minus the rebuild.
 */
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";
import { deriveEmailDocSubject } from "@/lib/email/emaildoc-subject";
import type { EmailDocDeliverable, EmailDocOccurrence } from "@/lib/email/emaildoc-occurrence";
import { bindUnsubscribeHref } from "@/lib/email/bind-unsubscribe";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";

export interface FrozenOccurrenceDeps {
  loadDeliverable: (id: string) => Promise<EmailDocDeliverable | null>;
  renderDoc: (doc: EmailDoc) => Promise<string>;
  log?: (line: string) => void;
}

export async function buildFrozenOccurrence(
  deliverableId: string,
  deps: FrozenOccurrenceDeps,
): Promise<EmailDocOccurrence | null> {
  const log = deps.log ?? (() => {});
  const deliv = await deps.loadDeliverable(deliverableId);
  if (!deliv || deliv.template !== "block-canvas") {
    log(`[sequence] frozen skip — deliverable ${deliverableId} missing or not block-canvas.`);
    return null;
  }
  const parsed = EmailDocSchema.safeParse(deliv.doc);
  if (!parsed.success) {
    log(`[sequence] frozen skip — invalid doc for deliverable ${deliverableId}.`);
    return null;
  }
  const rendered = await deps.renderDoc(parsed.data);
  const emailDocHtml = bindUnsubscribeHref(rendered, UNSUBSCRIBE_TOKEN);
  return { subject: deriveEmailDocSubject(parsed.data), body: "", emailDocHtml };
}
```

- [ ] **Step 4: Run lib tests** — `bun test lib/email/sequence/` → PASS.

- [ ] **Step 5: Wire the runner.** In `scripts/email/run-schedules.mts` (CHECK `git status` / repolith claims first — this file is contested):

(a) Imports:

```ts
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
```

(b) In `buildContent`, as the FIRST branch (before the existing block-canvas lane):

```ts
      // Sequence one-shot (lifecycle arc): render the FROZEN saved doc verbatim —
      // no AI refill (freeze-at-schedule, operator-locked). A missing/invalid
      // deliverable THROWS (loud per-row error outcome): a listing-milestone email
      // must never fall back to the whole-region digest.
      if (isSequenceOnceRow(row)) {
        const frozen = await buildFrozenOccurrence(row.deliverable_id!, {
          loadDeliverable: async (id) => {
            const { data, error } = await db
              .from("deliverables")
              .select("doc, instruction, scope_kind, scope_value, template")
              .eq("id", id)
              .maybeSingle();
            if (error || !data) return null;
            return {
              doc: data.doc,
              instruction: (data.instruction as string | null) ?? null,
              scope_kind: (data.scope_kind as string | null) ?? null,
              scope_value: (data.scope_value as string | null) ?? null,
              template: data.template as string,
            };
          },
          renderDoc: renderEmailDocHtml,
          log: (line) => console.log(line),
        });
        if (frozen) return frozen;
        throw new Error(
          `sequence one-shot schedule=${row.id}: deliverable ${row.deliverable_id} missing/invalid — refusing digest fallback`,
        );
      }
```

(c) Claim keys — replace the bodies of `claimSend` / `releaseSend` so once rows use the stable key:

```ts
    async claimSend(row: ScheduleRow, fromUtc: Date): Promise<{ proceed: boolean }> {
      const key = isSequenceOnceRow(row)
        ? onceClaimKey(row)
        : `digest:${row.id}:${fromUtc.toISOString().slice(0, 10)}`;
      const won = await claimOnce(db, key, {
        userId: row.user_id,
        kind: isSequenceOnceRow(row) ? "sequence" : "digest",
        scheduleId: row.id,
      });
      return { proceed: won };
    },

    async releaseSend(row: ScheduleRow, fromUtc: Date): Promise<void> {
      const key = isSequenceOnceRow(row)
        ? onceClaimKey(row)
        : `digest:${row.id}:${fromUtc.toISOString().slice(0, 10)}`;
      await releaseClaim(db, key);
    },
```

(d) Once-aware re-arm. Just BEFORE `const deps: ProcessDeps = {`, add:

```ts
  // Once rows terminate on completion: computeNext("once") → null, and instead of
  // leaving them active+parked (reaper log-noise forever), the re-arm flips them
  // to status='completed'. Batch rows are in scope here; keyed by id.
  const claimedById = new Map(rows.map((r) => [r.id, r]));
```

Then replace the `rearm` dep body (keep the DRY_RUN early return):

```ts
    async rearm(scheduleId: number, nextRunAt: string | null): Promise<void> {
      if (DRY_RUN) return;
      const isOnceDone = nextRunAt === null && claimedById.get(scheduleId)?.cadence === "once";
      const patch = isOnceDone
        ? { status: "completed", next_run_at: null, updated_at: new Date().toISOString() }
        : { next_run_at: nextRunAt, updated_at: new Date().toISOString() };
      const { error } = await db.from("email_schedules").update(patch).eq("id", scheduleId);
      if (error) throw new Error(`re-arm schedule ${scheduleId}: ${error.message}`);
    },
```

NOTE: `claimedById` must be defined before `deps` but AFTER `rows` is assigned — move the `const rows = await claimDue();` block above the deps construction if it isn't already (it is, line ~249).

Also: a definitive send failure sets `retryAtMs` → non-null next → the once row re-arms at +30 min with status still `active` — the retry path is untouched and correct.

(e) Once-aware reaper. Inside `reapCrashOrphans`, after `const orphans = ...`, split:

```ts
    // A crash-orphaned once row (active+parked+stale: the worker died mid-flight)
    // re-arms to NOW — the date-free once claim key dedupes if the send actually
    // went out before the crash, so this can never double-send. computeNext("once")
    // is null, so reapOrphans would strand these as "invalid spec".
    const onceOrphans = orphans.filter((r) => r.cadence === "once");
    for (const o of onceOrphans) {
      const { error: onceErr } = await db
        .from("email_schedules")
        .update({ next_run_at: nowIso, updated_at: new Date().toISOString() })
        .eq("id", o.id);
      if (onceErr) console.error(`[run-schedules] once-orphan re-arm ${o.id}: ${onceErr.message}`);
      else console.log(`[run-schedules] once-orphan ${o.id} re-armed to now (claim key dedupes).`);
    }
    const rest = orphans.filter((r) => r.cadence !== "once");
    if (rest.length === 0) return;
```

…and pass `rest` (not `orphans`) into `reapOrphans`, updating the final count log to use `rest.length`.

- [ ] **Step 6: Full test pass + dry-run smoke**

Run: `bun test lib/email/` → ALL PASS (scheduler suite untouched-green).
Run: `DRY_RUN=true bun scripts/email/run-schedules.mts` (Bash tool: `DRY_RUN=true bun scripts/email/run-schedules.mts`)
Expected: runs clean — likely "claimed 0 due schedule(s) … exiting clean" (dry run never mutates).

- [ ] **Step 7: Commit**

```bash
git add lib/email/sequence/once.ts lib/email/sequence/frozen-occurrence.ts lib/email/sequence/__tests__/once.test.ts lib/email/sequence/__tests__/frozen-occurrence.test.ts scripts/email/run-schedules.mts
git commit -m "feat(sequences): frozen once-lane in the runner — verbatim render, stable claim key, completed-status flip, once-aware reaper"
```

---

### Task 8: freeze guard on the lab save path

**Files:**
- Create: `lib/email/sequence/freeze.ts`
- Modify: `app/api/projects/[id]/materials/route.ts` (PATCH handler, after the ownership check ~line 106)
- Test: `lib/email/sequence/__tests__/freeze.test.ts`

**Interfaces:**
- Produces: `findFreezingSchedule(db, deliverableId): Promise<{id: number; next_run_at: string} | null>` — the active, armed (`next_run_at IS NOT NULL`) once row referencing this deliverable. Frozen is DERIVED (spec): no flag column, nothing to drift.
- The PATCH returns `423` `{error: "frozen", scheduled_for}` when frozen — the lab client surfaces "unlock to change it".

- [ ] **Step 1: Failing test** — `lib/email/sequence/__tests__/freeze.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { findFreezingSchedule } from "@/lib/email/sequence/freeze";

function fakeDb(rows: { id: number; next_run_at: string }[]) {
  const q = {
    select: () => q, eq: () => q, not: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => q } as never;
}

describe("findFreezingSchedule", () => {
  test("armed once row → frozen", async () => {
    const hit = await findFreezingSchedule(fakeDb([{ id: 7, next_run_at: "2026-07-08T13:00:00Z" }]), "d-1");
    expect(hit?.id).toBe(7);
  });
  test("no armed row → not frozen", async () => {
    expect(await findFreezingSchedule(fakeDb([]), "d-1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/sequence/__tests__/freeze.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/email/sequence/freeze.ts`:

```ts
/**
 * lib/email/sequence/freeze.ts — "frozen" is DERIVED, never a column: a
 * deliverable is frozen iff an ACTIVE, ARMED (next_run_at set) once schedule
 * row references it. The lab's save PATCH refuses writes while frozen; unlock
 * (stop the row) thaws it with no flag to drift. Spec 2026-07-05.
 */

interface FreezeQueryDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        eq(col: string, v: string): {
          eq(col: string, v: string): {
            not(col: string, op: string, v: null): {
              limit(n: number): PromiseLike<{
                data: { id: number; next_run_at: string }[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
}

export async function findFreezingSchedule(
  db: FreezeQueryDb,
  deliverableId: string,
): Promise<{ id: number; next_run_at: string } | null> {
  const { data, error } = await db
    .from("email_schedules")
    .select("id, next_run_at")
    .eq("deliverable_id", deliverableId)
    .eq("cadence", "once")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .limit(1);
  if (error) throw new Error(`freeze lookup failed: ${error.message}`);
  return data?.[0] ?? null;
}
```

(Adjust the `fakeDb` chain in the test to match the exact call order — the interface above is structural, and the real `PostgrestFilterBuilder` satisfies it; if the chained-eq typing fights you, loosen the interface to `eq(...): unknown`-style chaining like `ScheduleQuery` in `schedule-upsert.ts` does.)

- [ ] **Step 4: Wire the PATCH.** In `app/api/projects/[id]/materials/route.ts`, after the `if (!owned) …404` check and before building `patch`:

```ts
  // Freeze guard (lifecycle sequences): a deliverable referenced by an armed
  // one-shot is LOCKED — "Scheduling locks this email. It can't be edited or
  // sent until [time] — unlock to change it." Unlock (stop the row) thaws it.
  const frozen = await findFreezingSchedule(createServiceRoleClient(), body.deliverable_id);
  if (frozen) {
    return NextResponse.json(
      { error: "frozen", scheduled_for: frozen.next_run_at },
      { status: 423 },
    );
  }
```

with the import `import { findFreezingSchedule } from "@/lib/email/sequence/freeze";`.

- [ ] **Step 5: Run tests + build** — `bun test lib/email/sequence/` → PASS; `bunx next build` → green.

- [ ] **Step 6: Commit**

```bash
git add lib/email/sequence/freeze.ts lib/email/sequence/__tests__/freeze.test.ts "app/api/projects/[id]/materials/route.ts"
git commit -m "feat(sequences): derived freeze guard — armed one-shot locks its deliverable (423 on lab save)"
```

---

### Task 9: send-now core

**Files:**
- Create: `lib/email/sequence/send-now.ts`
- Test: `lib/email/sequence/__tests__/send-now.test.ts`

**Interfaces:**
- Produces:
  - `sendOnceNow(scheduleId, deps: SendNowDeps, now: Date): Promise<SendNowResult>` where `SendNowResult = ScheduleOutcome | {kind: "queued"; scheduleId: number}`.
  - `SendNowDeps { claimRow: (scheduleId, nowIso) => Promise<ScheduleRow | null>; process: (row, fromUtc) => Promise<ScheduleOutcome>; log?: (line) => void }`.
- Semantics: `claimRow` is the atomic single-row park (`UPDATE … SET next_run_at=NULL, last_run_at=now WHERE id=? AND status='active' AND next_run_at IS NOT NULL RETURNING *`). `null` (already claimed — a cron tick beat us) → `{kind:"queued"}`: the send IS happening, just via the cron. Crash between park and process is healed by Task 7's once-aware reaper (re-arm to now, claim key dedupes).

- [ ] **Step 1: Failing tests** — `lib/email/sequence/__tests__/send-now.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sendOnceNow } from "@/lib/email/sequence/send-now";
import type { ScheduleRow } from "@/lib/email/scheduler";

const row = { id: 42, user_id: "u1", cadence: "once" } as ScheduleRow;
const NOW = new Date("2026-07-06T15:00:00Z");

describe("sendOnceNow", () => {
  test("claims then processes, returns the outcome", async () => {
    const out = await sendOnceNow(42, {
      claimRow: async (id, nowIso) => {
        expect(id).toBe(42);
        expect(nowIso).toBe(NOW.toISOString());
        return row;
      },
      process: async (r) => ({ kind: "sent", scheduleId: r.id, recipients: 3 }),
    }, NOW);
    expect(out.kind).toBe("sent");
  });
  test("lost claim → queued (cron owns the send), never processes", async () => {
    let processed = false;
    const out = await sendOnceNow(42, {
      claimRow: async () => null,
      process: async () => { processed = true; return { kind: "sent", scheduleId: 42, recipients: 1 }; },
    }, NOW);
    expect(out).toEqual({ kind: "queued", scheduleId: 42 });
    expect(processed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test lib/email/sequence/__tests__/send-now.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/email/sequence/send-now.ts`:

```ts
/**
 * lib/email/sequence/send-now.ts — the in-request half of "Send now": claim ONE
 * armed row atomically, run it through the SAME processSchedule core the cron
 * uses (identical gates, identical idempotency). Losing the claim is SUCCESS —
 * a concurrent cron tick owns the send ("queued"). A crash after the claim is
 * healed by the runner's once-aware reaper; the date-free once claim key makes
 * the heal at-most-once. The cron is the safety net, never the trigger.
 */
import type { ScheduleOutcome, ScheduleRow } from "@/lib/email/scheduler";

export interface SendNowDeps {
  /** Atomic single-row park: UPDATE … SET next_run_at=NULL, last_run_at=nowIso
   *  WHERE id=? AND status='active' AND next_run_at IS NOT NULL RETURNING *. */
  claimRow: (scheduleId: number, nowIso: string) => Promise<ScheduleRow | null>;
  /** processSchedule with real once-lane deps (built in the route). */
  process: (row: ScheduleRow, fromUtc: Date) => Promise<ScheduleOutcome>;
  log?: (line: string) => void;
}

export type SendNowResult = ScheduleOutcome | { kind: "queued"; scheduleId: number };

export async function sendOnceNow(
  scheduleId: number,
  deps: SendNowDeps,
  now: Date,
): Promise<SendNowResult> {
  const log = deps.log ?? (() => {});
  const row = await deps.claimRow(scheduleId, now.toISOString());
  if (!row) {
    log(`[sequence] send-now schedule=${scheduleId} — claim lost to a cron tick; queued.`);
    return { kind: "queued", scheduleId };
  }
  return deps.process(row, now);
}
```

- [ ] **Step 4: Run tests** — `bun test lib/email/sequence/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/sequence/send-now.ts lib/email/sequence/__tests__/send-now.test.ts
git commit -m "feat(sequences): send-now core — atomic single-row claim, lost claim = queued"
```

---

### Task 10: sequence + fire + setups API routes

**Files:**
- Create: `app/api/projects/[id]/sequence/route.ts` (GET arm-state · POST arm · PATCH step ops)
- Create: `app/api/projects/[id]/sequence/fire/route.ts` (POST milestone fire)
- Create: `app/api/email/sequence-setups/route.ts` (GET list · POST save)
- Create: `lib/email/sequence/et-hour.ts` (+ test `lib/email/sequence/__tests__/et-hour.test.ts`)

**Interfaces:**
- Consumes: everything from Tasks 4–9 plus `createOrTouchSchedule`, `deliverableToScheduleRecipe`, `processSchedule`, `resolveSender` chain via deps, `claimOnce`/`releaseClaim`, `checkUsageLimit`/`recordEmailSent`, `renderEmailDocHtml`.
- Produces (for the UI task):
  - `GET  /api/projects/:id/sequence` → `{sequence: {id, status, setup_name, audience_slug, send_hour_et, steps: SequenceStep[]} | null}` (steps sent-reconciled).
  - `POST /api/projects/:id/sequence` body `{audience_slug: string, send_hour_et: number}` → `201 {sequence}` | `409 already_armed`.
  - `PATCH /api/projects/:id/sequence` body `{step_key, op: "record-built"|"skip"|"unlock", deliverable_id?}` → `{sequence}`; `unlock` also stops the pending once row. Illegal transition → `409 {error}`.
  - `POST /api/projects/:id/sequence/fire` body `{step_key, mode: "now"|"at", at_iso?}` → `{result: "sent"|"queued"|"scheduled", scheduled_for?, recipients?}`; `409 not_built` when the step has no deliverable; `409` on sent/skipped.
  - `GET/POST /api/email/sequence-setups` → list / save `{name, steps: SetupStep[], is_default: boolean}` (saving default clears the previous default first).

- [ ] **Step 1: et-hour helper + failing test.** `lib/email/sequence/__tests__/et-hour.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { etHour } from "@/lib/email/sequence/et-hour";

describe("etHour", () => {
  test("UTC afternoon → ET morning (EDT, UTC-4)", () => {
    expect(etHour(new Date("2026-07-06T13:00:00Z"))).toBe(9);
  });
  test("EST winter (UTC-5)", () => {
    expect(etHour(new Date("2026-01-06T13:00:00Z"))).toBe(8);
  });
});
```

`lib/email/sequence/et-hour.ts`:

```ts
/** Eastern wall-clock hour of a UTC instant — display metadata for once rows
 *  (send_hour_et is informational there; firing time is next_run_at). */
export function etHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", hourCycle: "h23",
    }).format(d),
  );
}
```

Run: `bun test lib/email/sequence/__tests__/et-hour.test.ts` → PASS after implementing.

- [ ] **Step 2: sequence route.** `app/api/projects/[id]/sequence/route.ts` — follow the auth/ownership pattern of `app/api/projects/[id]/materials/route.ts` (cookie client, `projects` select, RLS):

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SequenceStepsSchema, type StepKey, STEP_KEYS } from "@/lib/email/sequence/types";
import { applySetup, markBuilt, markSkipped, markUnlocked, reconcileSent } from "@/lib/email/sequence/state";
import { resolveArmSteps } from "@/lib/email/sequence/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedProject(db: ReturnType<typeof createClient>, id: string) {
  const { data } = await db.from("projects").select("id, subject_address").eq("id", id).maybeSingle();
  return data;
}

async function loadSequence(db: ReturnType<typeof createClient>, projectId: string) {
  const { data } = await db
    .from("email_sequences")
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .eq("project_id", projectId)
    .eq("status", "armed")
    .maybeSingle();
  if (!data) return null;
  const steps = SequenceStepsSchema.safeParse(data.steps);
  if (!steps.success) return null;
  // Sent truth from the schedule rows (Task 5 reconcileSent).
  const ids = steps.data.map((s) => s.schedule_id).filter((n): n is number => n != null);
  let reconciled = steps.data;
  if (ids.length) {
    const { data: rows } = await db
      .from("email_schedules")
      .select("id, status, last_run_at")
      .in("id", ids);
    reconciled = reconcileSent(steps.data, rows ?? []);
  }
  return { ...data, steps: reconciled };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ sequence: await loadSequence(db, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const audience = typeof body?.audience_slug === "string" ? body.audience_slug.trim() : "";
  const hour = Number(body?.send_hour_et);
  if (!audience || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return NextResponse.json({ error: "audience_slug and send_hour_et (0-23) required" }, { status: 422 });
  }

  const { data: setups } = await db
    .from("email_sequence_setups")
    .select("name, is_default, steps")
    .eq("user_id", user.id);
  const { source, steps } = resolveArmSteps(setups ?? []);

  const { data: created, error } = await db
    .from("email_sequences")
    .insert({
      user_id: user.id, project_id: id, setup_name: source, status: "armed",
      audience_slug: audience, send_hour_et: hour, steps: applySetup(steps),
    })
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .single();
  if (error) {
    // one_armed partial unique index → duplicate arm attempt.
    if (error.code === "23505") return NextResponse.json({ error: "already_armed" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sequence: created }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const key = STEP_KEYS.find((k) => k === body?.step_key) as StepKey | undefined;
  const op = body?.op;
  if (!key || !["record-built", "skip", "unlock"].includes(op)) {
    return NextResponse.json({ error: "step_key and op (record-built|skip|unlock) required" }, { status: 422 });
  }

  const seq = await loadSequence(db, id);
  if (!seq) return NextResponse.json({ error: "no armed sequence" }, { status: 404 });

  try {
    let steps = seq.steps;
    if (op === "record-built") {
      const did = typeof body?.deliverable_id === "string" ? body.deliverable_id : "";
      if (!did) return NextResponse.json({ error: "deliverable_id required" }, { status: 422 });
      steps = markBuilt(steps, key, did);
    } else if (op === "skip") {
      steps = markSkipped(steps, key);
    } else {
      // unlock: stop the pending one-shot FIRST (nothing goes out), then thaw.
      const step = steps.find((s) => s.key === key);
      if (step?.schedule_id != null) {
        const { error: stopErr } = await db
          .from("email_schedules")
          .update({ status: "stopped", next_run_at: null, updated_at: new Date().toISOString() })
          .eq("id", step.schedule_id)
          .eq("user_id", user.id);
        if (stopErr) return NextResponse.json({ error: stopErr.message }, { status: 500 });
      }
      steps = markUnlocked(steps, key);
    }
    const { error: upErr } = await db
      .from("email_sequences")
      .update({ steps, updated_at: new Date().toISOString() })
      .eq("id", seq.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ sequence: { ...seq, steps } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "illegal transition" }, { status: 409 });
  }
}
```

- [ ] **Step 3: fire route.** `app/api/projects/[id]/sequence/fire/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { deliverableToScheduleRecipe } from "@/lib/deliverable/schedule-recipe";
import { createOrTouchSchedule, type ScheduleUpsertDb } from "@/lib/email/schedule-upsert";
import { computeNextRunAt } from "@/lib/email/schedule-cadence";
import {
  processSchedule, type ProcessDeps, type ScheduleRow, type BroadcastRequest, type BroadcastResult,
} from "@/lib/email/scheduler";
import { checkUsageLimit, recordEmailSent } from "@/lib/email/usage";
import { claimOnce, releaseClaim } from "@/lib/email/idempotency";
import { isSequenceOnceRow, onceClaimKey } from "@/lib/email/sequence/once";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
import { sendOnceNow } from "@/lib/email/sequence/send-now";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { etHour } from "@/lib/email/sequence/et-hour";
import { SequenceStepsSchema, STEP_KEYS, type StepKey } from "@/lib/email/sequence/types";
import { markScheduled, markSent } from "@/lib/email/sequence/state";
import type { SenderConfigRow } from "@/lib/email/sender-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // render + broadcast POST, no LLM — seconds, not minutes

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
const PLATFORM = {
  fromName: process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf",
  fromEmail: process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com",
};

/** Minimal once-lane deps: the FROZEN render only — a sequence fire never
 *  touches the digest/report lanes and never calls an LLM. */
function buildOnceDeps(admin: ReturnType<typeof createServiceRoleClient>): ProcessDeps {
  return {
    dryRun: false,
    platform: PLATFORM,
    checkUsage: checkUsageLimit,
    recordSent: recordEmailSent,
    async readSenderConfig(userId) {
      const { data, error } = await admin
        .from("email_sender_config")
        .select("domain, resend_domain_id, from_name, from_email, reply_to, domain_verified")
        .eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`read email_sender_config: ${error.message}`);
      return (data as SenderConfigRow | null) ?? null;
    },
    async readAudience(userId, slug) {
      const { data, error } = await admin
        .from("email_audiences")
        .select("resend_audience_id, contact_count")
        .eq("user_id", userId).eq("audience_slug", slug).maybeSingle();
      if (error) throw new Error(`read email_audiences: ${error.message}`);
      return data ?? null;
    },
    async buildContent(row) {
      if (!isSequenceOnceRow(row)) throw new Error(`send-now: schedule ${row.id} is not a sequence one-shot`);
      const frozen = await buildFrozenOccurrence(row.deliverable_id!, {
        loadDeliverable: async (id) => {
          const { data, error } = await admin
            .from("deliverables")
            .select("doc, instruction, scope_kind, scope_value, template")
            .eq("id", id).maybeSingle();
          if (error || !data) return null;
          return {
            doc: data.doc,
            instruction: (data.instruction as string | null) ?? null,
            scope_kind: (data.scope_kind as string | null) ?? null,
            scope_value: (data.scope_value as string | null) ?? null,
            template: data.template as string,
          };
        },
        renderDoc: renderEmailDocHtml,
        log: (l) => console.log(l),
      });
      if (!frozen) throw new Error(`send-now: deliverable ${row.deliverable_id} missing/invalid`);
      return frozen;
    },
    async renderHtml() {
      throw new Error("unreachable: the once lane always returns emailDocHtml");
    },
    async postBroadcast(req: BroadcastRequest): Promise<BroadcastResult> {
      if (!SITE_URL || !process.env.DIGEST_BROADCAST_SECRET) {
        // Definitive failure → claim released, row re-arms +30min → the CRON
        // (which has the env) carries the send. Never eaten, never doubled.
        return { ok: false, status: "500", error: "broadcast env missing in this runtime" };
      }
      try {
        const res = await fetch(`${SITE_URL}/api/email/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.DIGEST_BROADCAST_SECRET}`,
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return { ok: false, status: String(res.status) };
        return (await res.json()) as BroadcastResult;
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        return { ok: false, status: isTimeout ? "timeout" : "network_error" };
      }
    },
    async rearm(scheduleId, nextRunAt) {
      const patch = nextRunAt === null
        ? { status: "completed", next_run_at: null, updated_at: new Date().toISOString() }
        : { next_run_at: nextRunAt, updated_at: new Date().toISOString() };
      const { error } = await admin.from("email_schedules").update(patch).eq("id", scheduleId);
      if (error) throw new Error(`re-arm schedule ${scheduleId}: ${error.message}`);
    },
    async claimSend(row) {
      const won = await claimOnce(admin, onceClaimKey(row), {
        userId: row.user_id, kind: "sequence", scheduleId: row.id,
      });
      return { proceed: won };
    },
    async releaseSend(row) {
      await releaseClaim(admin, onceClaimKey(row));
    },
    computeNext: computeNextRunAt,
    log: (l) => console.log(l),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: project } = await db.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const key = STEP_KEYS.find((k) => k === body?.step_key) as StepKey | undefined;
  const mode = body?.mode === "at" ? "at" : body?.mode === "now" ? "now" : null;
  const atIso = typeof body?.at_iso === "string" ? body.at_iso : null;
  if (!key || !mode || (mode === "at" && (!atIso || Number.isNaN(Date.parse(atIso))))) {
    return NextResponse.json({ error: "step_key + mode (now|at, at needs at_iso) required" }, { status: 422 });
  }
  const now = new Date();
  const fireAt = mode === "now" ? now : new Date(atIso!);
  if (mode === "at" && fireAt.getTime() <= now.getTime()) {
    return NextResponse.json({ error: "at_iso must be in the future" }, { status: 422 });
  }

  // Load the armed sequence + the step; sending requires a BUILT piece.
  const { data: seqRow } = await db
    .from("email_sequences")
    .select("id, audience_slug, steps")
    .eq("project_id", id).eq("status", "armed").maybeSingle();
  if (!seqRow) return NextResponse.json({ error: "no armed sequence" }, { status: 404 });
  const parsed = SequenceStepsSchema.safeParse(seqRow.steps);
  if (!parsed.success) return NextResponse.json({ error: "corrupt sequence steps" }, { status: 500 });
  const step = parsed.data.find((s) => s.key === key)!;
  if (step.state === "sent") return NextResponse.json({ error: "already sent" }, { status: 409 });
  if (step.state !== "built" || !step.deliverable_id) {
    return NextResponse.json({ error: "not_built" }, { status: 409 });
  }
  if (!seqRow.audience_slug) return NextResponse.json({ error: "no audience on the arc" }, { status: 422 });

  // Deliverable → once command (existing bridge + validator).
  const { data: deliv } = await db
    .from("deliverables")
    .select("id, template, scope_kind, scope_value")
    .eq("id", step.deliverable_id).eq("project_id", id).maybeSingle();
  if (!deliv) return NextResponse.json({ error: "deliverable gone" }, { status: 409 });
  const recipe = deliverableToScheduleRecipe(deliv, {
    cadence: "once", send_hour_et: etHour(fireAt), audience_slug: seqRow.audience_slug,
  });
  if (!recipe.ok) return NextResponse.json({ error: recipe.error }, { status: 422 });

  // Idempotent create/reactivate, armed at the chosen instant (cookie client — RLS).
  const { id: scheduleId } = await createOrTouchSchedule(db as unknown as ScheduleUpsertDb, {
    userId: user.id, projectId: id, command: recipe.command,
    nowIso: now.toISOString(), nextRunAtIso: fireAt.toISOString(),
  });

  // Persist the step state BEFORE attempting the in-request send.
  let steps = markScheduled(parsed.data, key, scheduleId, fireAt.toISOString());
  await db.from("email_sequences")
    .update({ steps, updated_at: now.toISOString() })
    .eq("id", seqRow.id);

  if (mode === "at") {
    return NextResponse.json({ result: "scheduled", scheduled_for: fireAt.toISOString(), schedule_id: scheduleId });
  }

  // mode "now": run the cron's own core right here; cron is the crash net.
  const admin = createServiceRoleClient();
  const outcome = await sendOnceNow(scheduleId, {
    claimRow: async (sid, nowIso) => {
      const { data } = await admin
        .from("email_schedules")
        .update({ next_run_at: null, last_run_at: nowIso, updated_at: nowIso })
        .eq("id", sid).eq("status", "active").not("next_run_at", "is", null)
        .select("*").maybeSingle();
      return (data as ScheduleRow | null) ?? null;
    },
    process: (row, fromUtc) => processSchedule(row, buildOnceDeps(admin), fromUtc),
    log: (l) => console.log(l),
  }, now);

  if (outcome.kind === "sent") {
    steps = markSent(steps, key, now.toISOString());
    await db.from("email_sequences")
      .update({ steps, updated_at: new Date().toISOString() })
      .eq("id", seqRow.id);
    return NextResponse.json({ result: "sent", recipients: outcome.recipients });
  }
  // queued / skipped / error: the row is armed or retrying — the cron carries it.
  // GET's reconcileSent flips the step when the schedule row completes.
  return NextResponse.json({ result: "queued", detail: outcome.kind, schedule_id: scheduleId });
}
```

- [ ] **Step 4: setups route.** `app/api/email/sequence-setups/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { SetupStepsSchema } from "@/lib/email/sequence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await db
    .from("email_sequence_setups")
    .select("id, name, is_default, steps, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return NextResponse.json({ setups: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = createClient(await cookies());
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const steps = SetupStepsSchema.safeParse(body?.steps);
  const isDefault = body?.is_default === true;
  if (!name || !steps.success || steps.data.length === 0) {
    return NextResponse.json({ error: "name + steps required" }, { status: 422 });
  }
  if (isDefault) {
    // Clear the previous default first — the one_default partial unique index
    // would reject the insert otherwise. Two statements; RLS scopes both.
    await db.from("email_sequence_setups")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("is_default", true);
  }
  const { data, error } = await db
    .from("email_sequence_setups")
    .insert({ user_id: user.id, name, is_default: isDefault, steps: steps.data })
    .select("id, name, is_default")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setup: data }, { status: 201 });
}
```

- [ ] **Step 5: Build + full tests**

Run: `bun test lib/email/` → ALL PASS.
Run: `bunx next build` → green (this is the compile gate for all three routes).

- [ ] **Step 6: Commit**

```bash
git add lib/email/sequence/et-hour.ts lib/email/sequence/__tests__/et-hour.test.ts "app/api/projects/[id]/sequence/route.ts" "app/api/projects/[id]/sequence/fire/route.ts" app/api/email/sequence-setups/route.ts
git commit -m "feat(sequences): arm/step/fire/setups API — milestone fires send-now inline with the cron as safety net"
```

---

### Task 11: Arc strip UI + confirm card

**Files:**
- Create: `components/email-lab/ArcStrip.tsx`
- Create: `components/email-lab/MilestoneConfirmCard.tsx`

**Interfaces:**
- Consumes the Task-10 endpoints exactly as specified there.
- Produces: `<ArcStrip projectId sequence onChanged />` — `sequence` is the GET payload; `onChanged(sequence)` bubbles refreshed state up. `<MilestoneConfirmCard>` receives `{step, audienceSlug, onConfirm(mode, atIso?), onClose, busy}`.
- Copy rules: freeze warning **verbatim** ("Scheduling locks this email. It can't be edited or sent until {time} — unlock to change it."); milestone buttons read "It's under contract →" style; never "AI"; note "every number sourced" on the strip header.

- [ ] **Step 1: MilestoneConfirmCard** — `components/email-lab/MilestoneConfirmCard.tsx`:

```tsx
"use client";
// Milestone confirm card (lifecycle sequences). Send now = immediate, the cron
// is only the crash net. Schedule = FREEZE — the warning copy is operator-locked
// verbatim. Sending requires a built piece; layout-only steps route to the lab.

import { useState } from "react";
import type { SequenceStep } from "@/lib/email/sequence/types";

interface Props {
  step: SequenceStep;
  audienceSlug: string;
  busy: boolean;
  onConfirm: (mode: "now" | "at", atIso?: string) => void;
  onClose: () => void;
}

export function MilestoneConfirmCard({ step, audienceSlug, busy, onConfirm, onClose }: Props) {
  const [when, setWhen] = useState<"now" | "at">("now");
  const [at, setAt] = useState("");
  const atDate = at ? new Date(at) : null;
  const atLabel = atDate
    ? atDate.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"
    : "[time]";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-white">Send “{step.title}”</h2>
        <p className="mt-1 text-xs text-white/50">
          Goes to your <span className="text-white/80">{audienceSlug}</span> list — every number sourced.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />
            Send now
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="radio" checked={when === "at"} onChange={() => setWhen("at")} />
            Schedule for…
          </label>
          {when === "at" && (
            <>
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className="rounded-lg border border-white/15 bg-transparent px-2 py-1.5 text-sm text-white"
              />
              <p className="text-[11px] leading-snug text-amber-300/90">
                Scheduling locks this email. It can’t be edited or sent until {atLabel} — unlock to change it.
              </p>
              <p className="text-[10px] text-white/40">Sends within ~15 minutes of the chosen time.</p>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || (when === "at" && !at)}
            onClick={() => onConfirm(when, when === "at" && atDate ? atDate.toISOString() : undefined)}
            className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {busy ? "Sending…" : when === "now" ? "Confirm & send now" : "Confirm & schedule"}
          </button>
          <button type="button" onClick={onClose} className="py-1 text-xs text-white/40 hover:text-white/70">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ArcStrip** — `components/email-lab/ArcStrip.tsx`:

```tsx
"use client";
// The listing campaign arc strip (lifecycle sequences). Five step cards above
// the ONE lab surface (grid shell — never forked). $0 layout previews at arm;
// build-on-demand; manual milestones; save-as-my-setup. Order is advisory.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stepSectionLabels, type SequenceStep } from "@/lib/email/sequence/types";
import { snapshotSetup } from "@/lib/email/sequence/setup";
import { MilestoneConfirmCard } from "./MilestoneConfirmCard";

export interface ArcSequence {
  id: string;
  status: string;
  setup_name: string | null;
  audience_slug: string | null;
  send_hour_et: number | null;
  steps: SequenceStep[];
}

interface Props {
  projectId: string;
  sequence: ArcSequence;
  onChanged: (seq: ArcSequence) => void;
}

const MILESTONE_LABEL: Record<string, string> = {
  "coming-soon": "Tease it →", "new-listing": "It’s live →", "market-comps": "Send the comps →",
  "under-contract": "It’s under contract →", sold: "It sold →",
};

function chip(state: SequenceStep["state"], scheduledFor?: string | null): string {
  if (state === "sent") return "Sent";
  if (state === "scheduled")
    return `Locked · sends ${scheduledFor ? new Date(scheduledFor).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : "soon"}`;
  if (state === "built") return "Built";
  if (state === "skipped") return "Skipped";
  return "Layout ready";
}

export function ArcStrip({ projectId, sequence, onChanged }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<SequenceStep | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/sequence`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json();
    if (res.ok) onChanged(j.sequence);
    else setNote(j.error ?? "That didn’t work.");
  }

  async function fire(step: SequenceStep, mode: "now" | "at", atIso?: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequence/fire`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_key: step.key, mode, ...(atIso ? { at_iso: atIso } : {}) }),
      });
      const j = await res.json();
      if (!res.ok) { setNote(j.error === "not_built" ? "Build this piece first — nothing sends unseen." : (j.error ?? "Send failed.")); return; }
      setConfirming(null);
      if (j.result === "sent") setNote(`Sent to ${j.recipients ?? "your"} contacts.`);
      else if (j.result === "queued") setNote("Queued — sending within ~15 minutes.");
      else setNote("Scheduled.");
      const fresh = await fetch(`/api/projects/${projectId}/sequence`).then((r) => r.json());
      if (fresh.sequence) onChanged(fresh.sequence);
    } finally {
      setBusy(false);
    }
  }

  async function saveSetup() {
    const name = window.prompt("Name this setup (it saves the prompts + layouts, never this listing’s data):");
    if (!name) return;
    const makeDefault = window.confirm("Make it your default for new listing projects?");
    const res = await fetch("/api/email/sequence-setups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, is_default: makeDefault, steps: snapshotSetup(sequence.steps) }),
    });
    setNote(res.ok ? `Setup “${name}” saved${makeDefault ? " as your default" : ""}.` : "Save failed.");
  }

  return (
    <div className="border-b border-white/10 bg-[#081420] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-white/80">
          Listing campaign · {sequence.setup_name === "platform" ? "standard arc" : sequence.setup_name}
          <span className="ml-2 text-[10px] font-normal text-gulf-teal">every number sourced</span>
        </p>
        <button type="button" onClick={saveSetup} className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/50 hover:border-gulf-teal/50 hover:text-gulf-teal">
          Save as my setup
        </button>
      </div>
      {note && <p className="mb-2 text-[11px] text-gulf-teal">{note}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sequence.steps.map((step) => (
          <div key={step.key} className="min-w-[180px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white">{step.title}</p>
              <span className={`text-[9px] ${step.state === "sent" ? "text-gulf-teal" : step.state === "scheduled" ? "text-amber-300" : "text-white/40"}`}>
                {chip(step.state, step.scheduled_for)}
              </span>
            </div>
            {previewing === step.key && (
              <ul className="mt-1 text-[10px] text-white/50">
                {stepSectionLabels(step.seed_doc_id).map((l, i) => (
                  <li key={i}>· {l}{/(chart|stats|listing)/i.test(l) ? " — fills fresh at build" : ""}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setPreviewing(previewing === step.key ? null : step.key)} className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:text-white">
                Preview
              </button>
              {(step.state === "pending" || step.state === "built") && (
                <button
                  type="button"
                  onClick={() => router.push(
                    `/project/${projectId}/email-lab?arcStep=${step.key}&seed=${step.seed_doc_id}&recipe=${encodeURIComponent(step.recipe_prompt)}${step.deliverable_id ? `&did=${step.deliverable_id}` : ""}`,
                  )}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/50 hover:text-white"
                >
                  {step.state === "built" ? "Edit" : "Build"}
                </button>
              )}
              {step.state === "built" && (
                <button type="button" onClick={() => setConfirming(step)} className="rounded bg-gulf-teal/90 px-2 py-0.5 text-[10px] font-semibold text-[#070f14] hover:bg-gulf-teal">
                  {MILESTONE_LABEL[step.key]}
                </button>
              )}
              {step.state === "scheduled" && (
                <button type="button" onClick={() => void patch({ step_key: step.key, op: "unlock" })} className="rounded border border-amber-300/40 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-300/10">
                  Unlock
                </button>
              )}
              {step.state === "pending" && (
                <button type="button" onClick={() => void patch({ step_key: step.key, op: "skip" })} className="rounded px-2 py-0.5 text-[10px] text-white/30 hover:text-white/60">
                  Skip
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirming && (
        <MilestoneConfirmCard
          step={confirming}
          audienceSlug={sequence.audience_slug ?? "your"}
          busy={busy}
          onConfirm={(mode, atIso) => void fire(confirming, mode, atIso)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Compile check** — `bunx next build` → green (fix imports/types as needed; the `seed=` param already works via `seedById` in page.tsx).

- [ ] **Step 4: Commit**

```bash
git add components/email-lab/ArcStrip.tsx components/email-lab/MilestoneConfirmCard.tsx
git commit -m "feat(sequences): arc strip + milestone confirm card — verbatim freeze copy, unlock, save-as-my-setup"
```

---

### Task 12: wire the arc into the project Email tab

**Files:**
- Modify: `app/project/[id]/email-lab/page.tsx` (load sequence server-side; pass `arcStep`)
- Modify: `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` (render ArcStrip; record-built after save)

**Interfaces:**
- Consumes: `GET` payload shape from Task 10; `ArcStrip` from Task 11.
- Produces: props `initialSequence: ArcSequence | null`, `arcStep: string | null`, `subjectAddress: string | null` on `ProjectEmailLabClient`.

- [ ] **Step 1: page.tsx.** After the project fetch (~line 88), add:

```ts
  // Lifecycle arc: load the armed sequence (if any) for the strip. The arm
  // CTA shows only for listing projects (subject_address present).
  const { data: seqRow } = await supabase
    .from("email_sequences")
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .eq("project_id", id)
    .eq("status", "armed")
    .maybeSingle();
  const arcStep = typeof sp.arcStep === "string" ? sp.arcStep : null;
```

…and pass to the client component:

```tsx
      initialSequence={(seqRow as import("@/components/email-lab/ArcStrip").ArcSequence) ?? null}
      arcStep={arcStep}
      subjectAddress={project.subject_address ?? null}
```

(Also honor `?seed=` — it already routes through `seedById(seedId)` at line ~146, which is exactly what the ArcStrip Build button relies on. No change needed there.)

- [ ] **Step 2: ProjectEmailLabClient.** Add the three props to `Props` and the destructure:

```ts
  initialSequence?: import("@/components/email-lab/ArcStrip").ArcSequence | null;
  arcStep?: string | null;
  subjectAddress?: string | null;
```

State + arm CTA + strip, above the canvas block (inside the fragment, before `{showGallery ? …}`):

```tsx
  const [sequence, setSequence] = useState(initialSequence ?? null);
  const [arming, setArming] = useState(false);

  async function armArc() {
    // v1 arm defaults: the tenant picks/refines audience in the confirm card at
    // fire time too — but the arc stores one. Reuse the digest default slug.
    const audience = window.prompt("Which contact list should this campaign send to? (audience slug)", "all-contacts");
    if (!audience) return;
    setArming(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequence`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience_slug: audience, send_hour_et: 9 }),
      });
      const j = await res.json();
      if (res.ok) setSequence(j.sequence);
    } finally {
      setArming(false);
    }
  }
```

```tsx
      {sequence ? (
        <ArcStrip projectId={projectId} sequence={sequence} onChanged={setSequence} />
      ) : subjectAddress ? (
        <div className="border-b border-white/10 bg-[#081420] px-4 py-2.5">
          <button
            type="button"
            disabled={arming}
            onClick={() => void armArc()}
            className="rounded-full bg-gulf-teal px-3 py-1.5 text-xs font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {arming ? "Starting…" : "Start the listing campaign"}
          </button>
          <span className="ml-2 text-[10px] text-white/40">
            Five pieces, teaser to sold — you fire each milestone. Every number sourced.
          </span>
        </div>
      ) : null}
```

with `import { ArcStrip } from "@/components/email-lab/ArcStrip";`.

Record-built after save — extend `handleSave`: after BOTH the PATCH branch (`return savedId;`) and the POST branch (`return id;`), insert before the return:

```ts
        if (arcStep) {
          void fetch(`/api/projects/${projectId}/sequence`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ step_key: arcStep, op: "record-built", deliverable_id: savedId /* or id in the POST branch */ }),
          }).then(async (r) => { const j = await r.json(); if (r.ok) setSequence(j.sequence); });
        }
```

Also surface the freeze guard: in the PATCH branch, if the response status is `423`, show the operator copy — set a small state `frozenNote` and render it near the header slot:

```ts
        if (res423.status === 423) {
          const j = await res423.json();
          setFrozenNote(`Scheduling locks this email. It can't be edited or sent until ${new Date(j.scheduled_for).toLocaleString()} — unlock to change it.`);
          return;
        }
```

(The PATCH call currently ignores its response — capture it into a variable to check `.status`. Keep the note in a `useState<string | null>` rendered as a thin amber banner above the canvas.)

- [ ] **Step 3: Build + eslint**

Run: `bunx next build` → green. Watch for `react-hooks/set-state-in-effect` (hard error in this repo) — the pattern above sets state only in handlers, which is compliant.

- [ ] **Step 4: Commit**

```bash
git add "app/project/[id]/email-lab/page.tsx" "app/project/[id]/email-lab/ProjectEmailLabClient.tsx"
git commit -m "feat(sequences): arc strip on the project email tab — arm CTA, record-built on save, frozen banner"
```

---

### Task 13: verification sweep + session log (STOP before push)

**Files:**
- Modify: `SESSION_LOG.md` (top-of-file entry)

- [ ] **Step 1: Full test suite**

Run: `bun test lib/email/ lib/deliverable/`
Expected: ALL PASS — including every pre-existing scheduler/occurrence/upsert/signature test, untouched.

- [ ] **Step 2: Production build**

Run: `bunx next build`
Expected: green, zero type errors.

- [ ] **Step 3: Runner dry-run smoke**

Run: `DRY_RUN=true bun scripts/email/run-schedules.mts`
Expected: clean exit 0 (dry run mutates nothing; likely zero due rows).

- [ ] **Step 4: SESSION_LOG entry** — append at the TOP of `SESSION_LOG.md`, dated, listing: what shipped (tables, once cadence, frozen lane, send-now, arc UI), test counts, and that `lifecycle_sequences_live_verify` remains OPEN for the operator's prod check.

- [ ] **Step 5: Commit the log — then STOP.**

```bash
git add SESSION_LOG.md
git commit -m "docs(session): lifecycle sequences built — arc strip, once cadence, frozen sends, send-now"
```

**Do NOT push.** Show `git log --oneline origin/main..HEAD`, name any foreign commits, and wait for the operator's explicit push approval (then `node scripts/safe-push.mjs`).

---

## Plan self-review notes (already applied)

- **Spec coverage:** manual milestones (fire route is user-invoked only) ✓ · $0 layout previews (`stepSectionLabels`, no LLM at arm) ✓ · build-on-demand any order (state machine gates on own-state only) ✓ · send-now + cron safety net (Task 9/10) ✓ · freeze + verbatim copy + unlock (Tasks 8/10/11) ✓ · nothing sends unseen (fire 409 `not_built`; confirm card routes to Build) ✓ · saved setups + one default + per-project deviation (Tasks 3/6/10/11) ✓ · scheduler untouched (only runner deps changed) ✓ · exactly-one-send (stable `once:` key + park-claim + one_armed/one_default indexes) ✓ · overnight-window is a separate check, not built here ✓.
- **Deliberate refinement vs spec letter:** the spec said "reaper excludes cadence='once'"; the plan instead flips fired once rows to `status='completed'` (runner rearm dep) and re-arms crash-orphaned once rows to now (claim key dedupes). Same intent — fired one-shots never resurrect, orphans heal — with no permanent active+parked noise. Spec updated? No — noted here; fold into the spec if the operator prefers the letter.
- **Type consistency:** `SequenceStep`/`SetupStep`/`StepKey` defined once in Task 4 and imported everywhere; `onceClaimKey` used by both runner (Task 7) and fire route (Task 10); `EmailDocOccurrence`/`EmailDocDeliverable` reused from the existing occurrence module, not redefined.
- **Known judgment calls for the implementer:** `BLOCK_LABELS` keys must match the real `BlockType` union (check `lib/email/doc/types.ts`); the arm CTA's `window.prompt` audience picker is deliberately v1-minimal (the real audience picker lives in `SendWeeklyHandle` — swapping it in is a welcome inline upgrade if time allows, not a requirement); if `bun run gen:types` writes a different filename, stage that file.
