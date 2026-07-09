# Subject-line / CTA AI variants + split-test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 14 tasks, 27 files, 3 conflict groups, keywords: migration, schema, architecture

**Goal:** Let the AUTHOR_TOOL generate 2-4 subject-line and CTA-label variants per email build, let a user pick one or opt into a real split-send (deterministic cohort hashing), and show a results panel gated by a minimum-sample size + a two-proportion z-test before ever declaring a winner.

**Architecture:** Extend the existing single AUTHOR_TOOL call (no second model call) to also emit `subject_variants` (doc-level) and `cta_variants` (on the button block). Assembly filters variants through the SAME no-invention anchor check the rest of authored content already uses, then a voice-tell strip. The picker lives in `ContactPickerModal` (the actual send surface — not the grid canvas). A "Split test this send" toggle threads `variant_test: {subjects?, ctas?}` into the blast route, which cohort-hashes `contact.id mod N`, tags each Resend send `variant:<i>`, and persists the real variant text in a new `email_blasts.variant_config` column. A new GET route aggregates `email_events` (grouped by the `variant` tag) into per-cohort stats and, only at ≥50 recipients/cohort, runs a two-proportion z-test on click rate before naming a leader.

**Tech Stack:** Next.js App Router route handlers, Zod 4 (`lib/email/doc/schema.ts`), Supabase/PostgREST (Bun.SQL for migrations), bun:test, Resend SDK (tags, batch.send), React client components (Tailwind).

## Global Constraints

- Scope: Email Lab block-canvas builds sent via `/api/deliverables/[id]/blast` only. Do NOT touch `lib/email/outreach/demo-subjects.ts` (outreach drip) or `lib/email/weekly-read/` (weekly digest) — both are intentionally deterministic/no-LLM.
- No second model call — variants ride the existing `author_email` tool invocation.
- Every variant string passes the SAME no-invention anchor check (`extractNumbers`/`anchorsExactly` from `lib/deliverable/narrative-lint.ts`) already gating authored prose, and the SAME voice-tell strip (`lib/email/voice-guard.ts`) — a subject line that names an unanchored number is exactly as dangerous as one in body prose.
- Resend tag values must stay `[A-Za-z0-9_-]` (existing `SAFE` regex in `lib/email/blast-tags.ts`) — a `variant:<index>` tag is trivially safe (an integer), no new validation needed.
- No live Resend send in tests — mirror the existing convention (mocked send / pure functions with plain-array fixtures, no DB mocking where avoidable).
- SQL migrations are idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), run directly via Bun.SQL (`.dlt/secrets.toml` creds — psql is not installed on this machine), followed by `bun run gen:types` to refresh `database-generated.types.ts` (never hand-edit that file).
- **Known limitation, not fixed here:** `blastTags()`'s `did` tag is the **deliverable id**, not the blast-row id — if the same deliverable is split-tested more than once, `email_events` rows from both sends share one `did` and the results route can't tell them apart. The results route reads the deliverable's MOST RECENT `email_blasts` row with a non-null `variant_config`; re-sending a fresh split test on the same deliverable makes the prior test's results unrecoverable from live events. Acceptable for v1 (an agent split-tests a build once); flag, don't silently ignore.

## Prerequisite — verify before starting (parallel-session note)

A different, concurrently-running session is building `docs/superpowers/specs/2026-07-08-deliverability-diagnostic-panel-design.md` (bounce/complaint monitoring), which happens to need the SAME `did`-tagged webhook ingestion this plan also depends on. As of this plan's writing it has (uncommitted, on disk):
- `lib/email/blast-events.ts` — `extractBlastAction(payload): BlastWebhookAction | null`, mapping a `did`-tagged Resend webhook event to `{ did, emailId, event }`.
- A new branch in `app/api/webhooks/resend/route.ts` that calls `extractBlastAction` and upserts into `public.email_events` (columns added: `user_id uuid`, `did text`).
- `docs/sql/20260709_email_events_blast_scope.sql` adding `user_id`/`did` to `email_events`.

**Task 1 below starts by checking whether these files still exist and in what shape** — if that other session's work has landed (or is still present on disk), extend it; if it's gone (reverted, or never merged), build the did-tag plumbing fresh. Either way, Task 1 only ever ADDS a `variant` column/field — it never conflicts with what that session owns (bounce/complaint aggregation).

## File Structure

- Modify `lib/email/doc/types.ts` — `EmailDoc` gains `subjectVariants?: string[]`, `ctaVariants?: string[]`.
- Modify `lib/email/doc/schema.ts` — `EmailDocSchema` top-level fields; `AuthorDocSchema` gains `subject_variants`; `AuthoredBlockSchema` gains `cta_variants`.
- Modify `lib/email/author-doc.ts` — `AUTHOR_TOOL` schema + description, `authorSystem` prompt paragraph, new `filterAnchoredVariants`, `assembleAuthoredDoc` wiring.
- Modify `lib/email/voice-guard.ts` — export the existing phrase-strip helper as `cleanTellText` for reuse outside full-doc walks.
- Modify `lib/email/build-doc.ts` — voice-clean `doc.subjectVariants`/`doc.ctaVariants` after the existing repair loop settles `doc`.
- Modify `lib/email/emaildoc-subject.ts` — `deriveEmailDocSubject` prefers `doc.subjectVariants?.[0]`.
- Create `lib/email/variant-cohort.ts` — `cohortIndex(contactId, variantCount)`.
- Create `lib/email/variant-results.ts` — `variantResults(...)` aggregation + two-proportion z-test.
- Modify (or create, per Task 1's check) `lib/email/blast-events.ts` — `BlastWebhookAction` gains `variant?: string`.
- Modify `app/api/webhooks/resend/route.ts` — thread the `variant` tag into the `email_events` upsert.
- Create `docs/sql/20260709_email_events_variant_column.sql` — idempotent `variant text` column + index.
- Create `docs/sql/20260709_email_blasts_variant_config.sql` — idempotent `variant_config jsonb` column.
- Modify `lib/email/blast-tags.ts` — `blastTags()` gains an optional `variant` param.
- Modify `app/api/deliverables/[id]/blast/route.ts` — `variant_test` body field, per-cohort subject/HTML, `variant_config` persistence.
- Create `app/api/deliverables/[id]/blast-results/route.ts` — GET aggregated variant results.
- Modify `components/contacts/ContactPickerModal.tsx` — subject/CTA pill pickers + split-test toggle.
- Modify `components/email-lab/EmailLabGridShell.tsx` — pass `doc.subjectVariants`/`doc.ctaVariants` to `ContactPickerModal`.
- Create `components/contacts/BlastResultsPanel.tsx` — renders `variantResults` output.
- Tests: `lib/email/author-doc.test.ts`, `lib/email/emaildoc-subject.test.ts`, `lib/email/voice-guard.test.ts`, `lib/email/blast-tags.test.ts`, `lib/email/blast-events.test.ts` (extend); `lib/email/variant-cohort.test.ts`, `lib/email/variant-results.test.ts` (new).

---

### Task 1: `did`-tag webhook plumbing gets a `variant` column (check-first, extend-not-duplicate)

**Files:**
- Check/Create: `lib/email/blast-events.ts`
- Check/Modify: `lib/email/blast-events.test.ts`
- Check/Modify: `app/api/webhooks/resend/route.ts`
- Create: `docs/sql/20260709_email_events_variant_column.sql`

**Interfaces:**
- Produces: `extractBlastAction(payload): BlastWebhookAction | null` where `BlastWebhookAction = { did: string; emailId: string | null; event: OutboundEvent; variant?: string }`.

- [ ] **Step 1: Check current state**

Run: `test -f lib/email/blast-events.ts && cat lib/email/blast-events.ts || echo "MISSING"`

If the file is missing, create it fresh (Step 2a). If present (as of this plan's writing it is — see Prerequisite section), extend it (Step 2b).

- [ ] **Step 2a (if missing): Create `lib/email/blast-events.ts` fresh**

```ts
// lib/email/blast-events.ts
//
// Pure mapping of an inbound Resend outbound-event payload tagged `did` (a
// deliverable blast send — app/api/deliverables/[id]/blast/route.ts, tags set
// by lib/email/blast-tags.ts) to the email_events row the webhook should
// upsert. Mirrors the SHAPE of outreach's extractOutreachAction / weekly-
// read's extractWeeklyReadAction, but a blast recipient has no drip/
// suppression ledger — this only extracts what to log, never a status flip.

import { mapResendOutbound } from "./outreach/lifecycle";

export interface BlastWebhookAction {
  did: string;
  emailId: string | null;
  event: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "unsubscribed" | "complained";
  /** The variant cohort index (0-based, as a string) from a split-test send's `variant` tag. */
  variant?: string;
}

export interface ResendWebhookPayload {
  type?: string;
  data?: { email_id?: string; tags?: Record<string, string> };
}

export function extractBlastAction(payload: ResendWebhookPayload): BlastWebhookAction | null {
  const did = payload.data?.tags?.["did"];
  if (!did) return null;
  const { event } = mapResendOutbound(payload.type ?? "");
  if (!event) return null;
  const variant = payload.data?.tags?.["variant"];
  return {
    did,
    emailId: payload.data?.email_id ?? null,
    event,
    ...(variant ? { variant } : {}),
  };
}
```

- [ ] **Step 2b (if present): Add `variant` to the existing file**

Add `variant?: string;` to `BlastWebhookAction`, and in `extractBlastAction`, after computing `did`/`event`:

```ts
  const variant = payload.data?.tags?.["variant"];
  return {
    did,
    emailId: payload.data?.email_id ?? null,
    event,
    ...(variant ? { variant } : {}),
  };
```

(replacing whatever the current `return { did, emailId, event }` line is).

- [ ] **Step 3: Write/extend the failing test**

Add to `lib/email/blast-events.test.ts`:

```ts
  it("carries the variant tag when present", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc", variant: "1" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked", variant: "1" });
  });

  it("omits variant when the tag is absent", () => {
    expect(
      extractBlastAction({ type: "email.clicked", data: { email_id: "re_1", tags: { did: "dlv-abc" } } }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked" });
  });
```

- [ ] **Step 4: Run the test, confirm it fails (or passes cleanly if Step 2b already applied)**

Run: `bun test lib/email/blast-events.test.ts`
Expected: both new cases FAIL until Step 2 lands, then PASS.

- [ ] **Step 5: Migration — add the `variant` column**

Write `docs/sql/20260709_email_events_variant_column.sql`:

```sql
-- 20260709_email_events_variant_column.sql — split-test cohort tag for email_events.
-- Idempotent: safe to re-run. Additive only — never conflicts with whatever
-- columns another concurrent migration (user_id/did) has already added.

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS variant text;

CREATE INDEX IF NOT EXISTS email_events_did_variant_idx
  ON public.email_events (did, variant);

NOTIFY pgrst, 'reload schema';
```

Run it via Bun.SQL (per `reference_run-migrations-via-bun-sql.md` convention — psql is not installed), then verify:

Run: `bun run gen:types`
Expected: `database-generated.types.ts`'s `email_events` row type gains `variant: string | null`.

- [ ] **Step 6: Wire `variant` into the webhook's upsert**

In `app/api/webhooks/resend/route.ts`, inside the `if (blastAction) { ... }` branch's `email_events.upsert(...)` call, add `variant: blastAction.variant ?? null,` to the row object.

- [ ] **Step 7: Run tests, commit**

Run: `bun test lib/email/blast-events.test.ts`
Expected: PASS.

```bash
git add lib/email/blast-events.ts lib/email/blast-events.test.ts app/api/webhooks/resend/route.ts docs/sql/20260709_email_events_variant_column.sql
git commit -m "feat(email): thread variant cohort tag through did webhook ingestion"
```

---

### Task 2: `EmailDoc` type + schema gain `subjectVariants`/`ctaVariants`

**Files:**
- Modify: `lib/email/doc/types.ts`
- 🔴 Modify: `lib/email/doc/schema.ts`
- Test: `lib/email/doc/schema.test.ts` (create if absent — check first: `test -f lib/email/doc/schema.test.ts`)

**Interfaces:**
- Produces: `EmailDoc.subjectVariants?: string[]`, `EmailDoc.ctaVariants?: string[]` — both optional, absent = today's behavior exactly.

- [ ] **Step 1: Add fields to the static type**

In `lib/email/doc/types.ts`, in `export interface EmailDoc { ... }`:

```ts
export interface EmailDoc {
  globalStyle: EmailGlobalStyle;
  blocks: EmailBlock[]; // ordered array — index = render order
  /** Up to 4 AI-authored subject-line alternatives; [0] is the default subject
   *  (deriveEmailDocSubject prefers it). Absent → today's block-derived subject. */
  subjectVariants?: string[];
  /** Up to 4 AI-authored CTA-label alternatives for the doc's button block.
   *  Absent → today's single button_label. */
  ctaVariants?: string[];
}
```

- [ ] **Step 2: Write the failing schema test**

If `lib/email/doc/schema.test.ts` doesn't exist, create it with this one case (else append):

```ts
import { describe, expect, it } from "bun:test";
import { EmailDocSchema } from "./schema";

describe("EmailDocSchema — subjectVariants/ctaVariants", () => {
  const baseDoc = {
    globalStyle: {
      primaryColor: "#000",
      accentColor: "#111",
      fontFamily: "MODERN_SANS",
      textColor: "#222",
      backdropColor: "#fff",
    },
    blocks: [{ type: "footer", props: {} }],
  };

  it("accepts and preserves subjectVariants/ctaVariants", () => {
    const parsed = EmailDocSchema.parse({
      ...baseDoc,
      subjectVariants: ["Subject A", "Subject B"],
      ctaVariants: ["View Report", "See the Numbers"],
    });
    expect(parsed.subjectVariants).toEqual(["Subject A", "Subject B"]);
    expect(parsed.ctaVariants).toEqual(["View Report", "See the Numbers"]);
  });

  it("omits both when absent — no regression", () => {
    const parsed = EmailDocSchema.parse(baseDoc);
    expect(parsed.subjectVariants).toBeUndefined();
    expect(parsed.ctaVariants).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test, confirm it fails**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: FAIL — `subjectVariants`/`ctaVariants` stripped (unknown keys, `z.object` default strip mode).

- [ ] **Step 4: Add the fields to `EmailDocSchema`**

In `lib/email/doc/schema.ts`:

```ts
export const EmailDocSchema = z.object({
  globalStyle: GlobalStyleSchema,
  blocks: z.array(BlockSchema).min(1).max(20),
  subjectVariants: z.array(z.string().max(90)).max(4).optional(),
  ctaVariants: z.array(z.string().max(40)).max(4).optional(),
});
```

- [ ] **Step 5: Run test, confirm it passes**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/schema.test.ts
git commit -m "feat(email): add subjectVariants/ctaVariants to EmailDoc"
```

---

### Task 3: Authored-doc schema gains `subject_variants` / `cta_variants`

**Files:**
- 🔴 Modify: `lib/email/doc/schema.ts` (`AuthorDocSchema`, `AuthoredBlockSchema`)

**Interfaces:**
- Consumes: `authoredText(n)` (existing helper, `lib/email/doc/schema.ts:407`).
- Produces: `AuthoredDoc.subject_variants?: string[]`, `AuthoredBlock.cta_variants?: string[]` (both `z.infer`red, consumed by Task 4).

- [ ] **Step 1: Write the failing test**

Append to `lib/email/doc/schema.test.ts`:

```ts
import { AuthorDocSchema } from "./schema";

describe("AuthorDocSchema — subject_variants / cta_variants", () => {
  it("accepts subject_variants at the doc level and cta_variants on a block", () => {
    const parsed = AuthorDocSchema.parse({
      blocks: [
        { type: "button", button_label: "View Report", cta_variants: ["View Report", "See the Numbers"] },
      ],
      subject_variants: ["Subject A", "Subject B", "Subject C"],
    });
    expect(parsed.subject_variants).toEqual(["Subject A", "Subject B", "Subject C"]);
    expect(parsed.blocks[0].cta_variants).toEqual(["View Report", "See the Numbers"]);
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: FAIL (unknown keys stripped).

- [ ] **Step 3: Extend the schemas**

In `AuthoredBlockSchema` (right after `button_label: authoredText(40),`):

```ts
  /** 2-4 alternate button labels for THIS block (only meaningful on `button`). */
  cta_variants: z
    .array(authoredText(40).transform((s) => s ?? ""))
    .min(2)
    .max(4)
    .optional(),
```

In `AuthorDocSchema`:

```ts
export const AuthorDocSchema = z.object({
  blocks: z.array(AuthoredBlockSchema).min(1).max(20),
  schedule_suggestion: ScheduleSuggestionSchema.optional(),
  /** 2-4 AI-authored subject-line alternatives. */
  subject_variants: z
    .array(authoredText(90).transform((s) => s ?? ""))
    .min(2)
    .max(4)
    .optional(),
});
```

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/doc/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/doc/schema.ts lib/email/doc/schema.test.ts
git commit -m "feat(email): AuthorDocSchema/AuthoredBlockSchema accept subject/cta variants"
```

---

### Task 4: `AUTHOR_TOOL` schema + prompt ask for variants

**Files:**
- 🟡 Modify: `lib/email/author-doc.ts`

**Interfaces:**
- Consumes: nothing new (pure schema/prompt edit).
- Produces: the model's tool-call output MAY carry `subject_variants: string[]` and, on a `button` block, `cta_variants: string[]`.

- [ ] **Step 1: Add `subject_variants` to `AUTHOR_TOOL.input_schema.properties`**

In `lib/email/author-doc.ts`, inside `AUTHOR_TOOL.input_schema.properties` (sibling of `blocks` and `schedule_suggestion`):

```ts
      subject_variants: {
        type: "array",
        description:
          "2-4 alternate subject lines for this email. Same rule as prose: quote a number " +
          "verbatim from the DATA MENU or omit it — never invent one.",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
```

- [ ] **Step 2: Add `cta_variants` to the block item schema**

In the `blocks.items.properties` object, right after `button_label: { type: "string" },`:

```ts
            cta_variants: {
              type: "array",
              description:
                "button blocks only: 2-4 alternate labels for THIS button (e.g. 'View Report', " +
                "'See the Numbers'). Omit on non-button blocks.",
              items: { type: "string" },
              minItems: 2,
              maxItems: 4,
            },
```

- [ ] **Step 3: Add one paragraph to `AUTHOR_TOOL.description`**

After the existing "ASSETS —" paragraph and before "SECTIONS —", insert:

```ts
    "VARIANTS — optionally set `subject_variants` (2-4 alternate subject lines for the whole " +
      "email) and, on a `button` block, `cta_variants` (2-4 alternate labels for THAT button). " +
      "Same hard rule applies: any number you quote must be verbatim from the DATA MENU. " +
      "These are picked from, not concatenated — write genuinely different angles, not " +
      "punctuation variants of one sentence.\n\n" +
```

- [ ] **Step 4: Add generation guidance to `authorSystem`**

In `authorSystem()`, after the `SCHEDULING —` line in the `parts` array, add:

```ts
    "SUBJECT + CTA VARIANTS — write 3 subject lines (genuinely different angles: a headline " +
      "figure, a question, an urgency framing) via `subject_variants`. If you place a `button` " +
      "block, also write 3 alternate labels via `cta_variants` on that block. Same DATA MENU-only " +
      "number rule as everywhere else.",
```

- [ ] **Step 5: No test for this step alone** — this is prompt/schema surface only; Task 3's schema tests plus Task 5's assembly tests cover it end to end. Verify the file still typechecks:

Run: `bunx tsc --noEmit -p . 2>&1 | grep author-doc.ts || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add lib/email/author-doc.ts
git commit -m "feat(email): AUTHOR_TOOL asks for subject/CTA variants"
```

---

### Task 5: `filterAnchoredVariants` + `assembleAuthoredDoc` wiring (the moat)

**Files:**
- 🟡 Modify: `lib/email/author-doc.ts`
- Test: `lib/email/author-doc.test.ts`

**Interfaces:**
- Produces: `filterAnchoredVariants(variants: readonly string[] | undefined, anchors: ReadonlySet<string>): string[]` — drops (never blanks) any variant whose numbers don't anchor. `assembleAuthoredDoc` now returns `EmailDoc` with `subjectVariants`/`ctaVariants` populated from `authored.subject_variants` / the first button block's `cta_variants`, both anchor-filtered and capped at 4.

- [ ] **Step 1: Write the failing tests**

Append to `lib/email/author-doc.test.ts` (mirror the file's existing `assembleAuthoredDoc` test fixtures for `figuresById`/`globalStyle`/`anchorNumbers` setup):

```ts
describe("filterAnchoredVariants", () => {
  const anchors = new Set(["485000", "42"]);

  it("keeps a variant with no numbers", () => {
    expect(filterAnchoredVariants(["A clean headline"], anchors)).toEqual(["A clean headline"]);
  });

  it("keeps a variant whose number anchors exactly", () => {
    expect(filterAnchoredVariants(["$485,000 median — see it"], anchors)).toEqual([
      "$485,000 median — see it",
    ]);
  });

  it("drops a variant with an unanchored number", () => {
    expect(filterAnchoredVariants(["$999,000 median — see it"], anchors)).toEqual([]);
  });

  it("drops empty/whitespace-only entries and returns [] for undefined", () => {
    expect(filterAnchoredVariants(["  ", ""], anchors)).toEqual([]);
    expect(filterAnchoredVariants(undefined, anchors)).toEqual([]);
  });
});

describe("assembleAuthoredDoc — subject/CTA variants", () => {
  it("populates subjectVariants from authored.subject_variants, anchor-filtered", () => {
    const doc = assembleAuthoredDoc({
      authored: {
        blocks: [{ type: "footer" }],
        subject_variants: ["$485,000 median in 34103", "$999,000 invented", "A clean headline"],
      } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: TEST_GLOBAL_STYLE,
      anchorNumbers: ["$485,000"],
    });
    expect(doc.subjectVariants).toEqual(["$485,000 median in 34103", "A clean headline"]);
  });

  it("populates ctaVariants from the first button block carrying cta_variants", () => {
    const doc = assembleAuthoredDoc({
      authored: {
        blocks: [
          { type: "button", button_label: "View Report", cta_variants: ["View Report", "See the Numbers"] },
        ],
      } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: TEST_GLOBAL_STYLE,
      anchorNumbers: [],
    });
    expect(doc.ctaVariants).toEqual(["View Report", "See the Numbers"]);
  });

  it("omits both fields when the model wrote no variants — no regression", () => {
    const doc = assembleAuthoredDoc({
      authored: { blocks: [{ type: "footer" }] } as AuthoredDoc,
      figuresById: new Map(),
      globalStyle: TEST_GLOBAL_STYLE,
      anchorNumbers: [],
    });
    expect(doc.subjectVariants).toBeUndefined();
    expect(doc.ctaVariants).toBeUndefined();
  });
});
```

(Use whatever `TEST_GLOBAL_STYLE` fixture the existing tests in this file already define — grep the file for `globalStyle:` in an existing `assembleAuthoredDoc` call to reuse it verbatim rather than inventing a second fixture.)

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/author-doc.test.ts`
Expected: FAIL — `filterAnchoredVariants` is not exported; `doc.subjectVariants`/`ctaVariants` undefined.

- [ ] **Step 3: Implement `filterAnchoredVariants`**

In `lib/email/author-doc.ts`, near `anchoredStatValue` (reuse the same `isBareYear`/`extractNumbers`/`anchorsExactly` imports already at the top of the file):

```ts
/** Drop (never blank) any variant string carrying a number that doesn't anchor
 *  verbatim to the data feed — the same moat as anchoredStatValue, applied to a
 *  whole candidate string rather than a single field. Empty/whitespace entries
 *  are dropped too (never ship a blank subject/CTA option). Exported for tests. */
export function filterAnchoredVariants(
  variants: readonly string[] | undefined,
  anchors: ReadonlySet<string>,
): string[] {
  if (!variants) return [];
  return variants
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v) => {
      const nums = extractNumbers(v).filter((t) => !isBareYear(t));
      return nums.every((t) => anchorsExactly(t, anchors));
    });
}
```

- [ ] **Step 4: Wire into `assembleAuthoredDoc`**

In `assembleAuthoredDoc`, after the existing entries/chart/photo/footer assembly (right before the final `return { globalStyle, blocks: ... }`):

```ts
  const subjectVariants = filterAnchoredVariants(authored.subject_variants, anchors).slice(0, 4);
  const ctaSource = authored.blocks.find(
    (b) => b.type === "button" && (b.cta_variants?.length ?? 0) > 0,
  );
  const ctaVariants = filterAnchoredVariants(ctaSource?.cta_variants, anchors).slice(0, 4);

  return {
    globalStyle,
    blocks: deriveLayout(capBlocks(entries)),
    ...(subjectVariants.length ? { subjectVariants } : {}),
    ...(ctaVariants.length ? { ctaVariants } : {}),
  };
```

Replace the prior bare `return { globalStyle, blocks: deriveLayout(capBlocks(entries)) };` with this block.

- [ ] **Step 5: Run, confirm it passes**

Run: `bun test lib/email/author-doc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/author-doc.ts lib/email/author-doc.test.ts
git commit -m "feat(email): filterAnchoredVariants + assembleAuthoredDoc variant wiring"
```

---

### Task 6: Voice-tell strip for variants (avoid the author-doc.ts ↔ voice-guard.ts import cycle)

**Files:**
- Modify: `lib/email/voice-guard.ts`
- Modify: `lib/email/build-doc.ts`
- Test: `lib/email/voice-guard.test.ts`, `lib/email/build-doc.test.ts`

**Interfaces:**
- Produces: `cleanTellText(text: string): string` — exported from `voice-guard.ts`.
- **Why not inside `author-doc.ts`:** `voice-guard.ts` already imports `PROSE_FIELDS`/`COLUMN_PROSE_FIELDS`/`ITEM_PROSE_FIELDS` FROM `author-doc.ts`. Importing `voice-guard.ts` back into `author-doc.ts` would create a circular import. `build-doc.ts` already imports both modules — that's where the wiring belongs, right next to the existing `voiceGuard(doc)` call in the repair loop.

- [ ] **Step 1: Write the failing test**

Append to `lib/email/voice-guard.test.ts`:

```ts
describe("cleanTellText", () => {
  it("strips a tell phrase from a standalone string (not just doc prose fields)", () => {
    expect(cleanTellText("Don't hesitate to reach out today")).toBe("Reach out today");
  });

  it("returns the input unchanged when clean", () => {
    expect(cleanTellText("A clean, direct subject line")).toBe("A clean, direct subject line");
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/voice-guard.test.ts`
Expected: FAIL — `cleanTellText` is not exported.

- [ ] **Step 3: Export the existing helper under a public name**

In `lib/email/voice-guard.ts`, find `function cleanField(text: string): string { ... }` and change it to `export function cleanTellText(text: string): string { ... }`. Update the two internal call sites (`cleanField(v)` in `stripVoiceTells`/`cleanNested`) to `cleanTellText(v)`.

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/voice-guard.test.ts`
Expected: PASS (also re-run the full file to confirm the rename didn't break `stripVoiceTells`'s existing tests: `bun test lib/email/voice-guard.test.ts`).

- [ ] **Step 5: Write the failing build-doc integration test**

In `lib/email/build-doc.test.ts`, find the existing test setup that drives `buildContentDoc`/the author path with a mocked `callAuthor` (grep the file for how it mocks the Anthropic call). Add a case where the mocked authored response includes a `subject_variants` entry containing a voice tell, e.g. `"Don't hesitate to see your new report"`, and assert the returned doc's `subjectVariants` has the tell stripped:

```ts
  it("voice-cleans subject/CTA variants the same way it cleans body prose", async () => {
    // Reuse this file's existing callAuthor mock plumbing; return an authored
    // payload whose subject_variants[0] contains a banned tell phrase.
    const result = await runAuthorFlow({
      // ...existing required args for this file's author-flow test helper...
      mockAuthored: {
        blocks: [{ type: "footer" }],
        subject_variants: ["Don't hesitate to see your new report", "Your market update"],
      },
    });
    expect(result.payload.doc.subjectVariants?.[0]).not.toMatch(/don.t hesitate/i);
  });
```

(Match this file's actual mock/helper names exactly — read the surrounding tests in `build-doc.test.ts` before writing this case; do not invent a `runAuthorFlow` helper that doesn't exist there.)

- [ ] **Step 6: Run, confirm it fails**

Run: `bun test lib/email/build-doc.test.ts`
Expected: FAIL — variants aren't voice-cleaned yet.

- [ ] **Step 7: Wire the clean pass into `build-doc.ts`**

In `lib/email/build-doc.ts`, right after the existing repair-loop settles `doc` (immediately after the `doc = candidate;` line inside the `if (!lint.ok || !voice.ok) { ... }` block, AND unconditionally after it — variants need cleaning even when the main prose loop never triggered), add, just before `const finalParse = EmailDocSchema.safeParse(doc);`:

```ts
  // Variants aren't walked by lintAuthoredProse/voiceGuard (they're top-level
  // EmailDoc fields, not block prose) — clean them here, once, unconditionally.
  if (doc.subjectVariants?.length || doc.ctaVariants?.length) {
    doc = {
      ...doc,
      ...(doc.subjectVariants ? { subjectVariants: doc.subjectVariants.map(cleanTellText) } : {}),
      ...(doc.ctaVariants ? { ctaVariants: doc.ctaVariants.map(cleanTellText) } : {}),
    };
  }
```

Add `cleanTellText` to the existing `import { voiceGuard } from "@/lib/email/voice-guard";` line: `import { voiceGuard, cleanTellText } from "@/lib/email/voice-guard";`.

- [ ] **Step 8: Run, confirm it passes**

Run: `bun test lib/email/build-doc.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/email/voice-guard.ts lib/email/voice-guard.test.ts lib/email/build-doc.ts lib/email/build-doc.test.ts
git commit -m "feat(email): voice-clean subject/CTA variants via exported cleanTellText"
```

---

### Task 7: `deriveEmailDocSubject` prefers `subjectVariants[0]`

**Files:**
- Modify: `lib/email/emaildoc-subject.ts`
- Test: `lib/email/emaildoc-subject.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/email/emaildoc-subject.test.ts`:

```ts
it("prefers subjectVariants[0] over block-derived text when present", () => {
  const doc = {
    globalStyle: {} as EmailDoc["globalStyle"],
    blocks: [{ id: "1", type: "signal", props: { title: "Block-derived headline" } }],
    subjectVariants: ["AI-chosen subject line"],
  } as EmailDoc;
  expect(deriveEmailDocSubject(doc)).toBe("AI-chosen subject line");
});

it("falls back to block-derived text when subjectVariants is absent — no regression", () => {
  const doc = {
    globalStyle: {} as EmailDoc["globalStyle"],
    blocks: [{ id: "1", type: "signal", props: { title: "Block-derived headline" } }],
  } as EmailDoc;
  expect(deriveEmailDocSubject(doc)).toBe("Block-derived headline");
});
```

- [ ] **Step 2: Run, confirm the first case fails**

Run: `bun test lib/email/emaildoc-subject.test.ts`
Expected: first new case FAILS (returns block-derived text, ignoring `subjectVariants`).

- [ ] **Step 3: Implement**

In `lib/email/emaildoc-subject.ts`:

```ts
export function deriveEmailDocSubject(doc: EmailDoc): string {
  const variant = doc.subjectVariants?.[0]?.trim();
  if (variant) return clean(variant);

  const b = doc.blocks;
  const headline =
    firstText(b, "signal", "title") ??
    firstText(b, "hero", "label") ??
    firstText(b, "hero", "kicker") ??
    firstText(b, "hero", "value") ??
    firstText(b, "header", "tagline");
  if (headline) return clean(headline);

  const company = firstText(b, "header", "companyName");
  if (company) return clean(`${company} — market update`);

  return "Your Southwest Florida market update";
}
```

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/emaildoc-subject.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/emaildoc-subject.ts lib/email/emaildoc-subject.test.ts
git commit -m "feat(email): deriveEmailDocSubject prefers AI subjectVariants[0]"
```

---

### Task 8: `cohortIndex` — deterministic contact→variant assignment

**Files:**
- Create: `lib/email/variant-cohort.ts`
- Create: `lib/email/variant-cohort.test.ts`

**Interfaces:**
- Produces: `cohortIndex(contactId: string, variantCount: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/variant-cohort.test.ts
import { describe, expect, it } from "bun:test";
import { cohortIndex } from "./variant-cohort";

describe("cohortIndex", () => {
  it("is stable for the same contact id and variant count", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(cohortIndex(id, 3)).toBe(cohortIndex(id, 3));
  });

  it("always returns 0 when variantCount <= 1", () => {
    expect(cohortIndex("abc", 1)).toBe(0);
    expect(cohortIndex("abc", 0)).toBe(0);
  });

  it("returns an index in [0, variantCount)", () => {
    for (const id of ["a", "bb", "ccc", "123e4567-e89b-12d3-a456-426614174000", "z".repeat(50)]) {
      const i = cohortIndex(id, 3);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(3);
    }
  });

  it("distributes a set of ids across all cohorts (not degenerate)", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `contact-${i}`);
    const buckets = new Set(ids.map((id) => cohortIndex(id, 2)));
    expect(buckets.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/variant-cohort.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// lib/email/variant-cohort.ts
//
// Deterministic contact→cohort assignment for a split-send. PURE: a stable
// FNV-1a 32-bit hash of the contact id, mod the variant count. Stable across
// calls (and across a retried/partial batch send) so a contact never flips
// cohorts mid-flight.

export function cohortIndex(contactId: string, variantCount: number): number {
  if (variantCount <= 1) return 0;
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < contactId.length; i += 1) {
    hash ^= contactId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0) % variantCount;
}
```

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/variant-cohort.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/variant-cohort.ts lib/email/variant-cohort.test.ts
git commit -m "feat(email): cohortIndex — deterministic contact-to-variant hash"
```

---

### Task 9: `email_blasts.variant_config` migration + `blastTags` variant param

**Files:**
- Create: `docs/sql/20260709_email_blasts_variant_config.sql`
- Modify: `lib/email/blast-tags.ts`
- Test: `lib/email/blast-tags.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/email/blast-tags.test.ts`:

```ts
it("adds a variant tag when a cohort index is given", () => {
  expect(blastTags("abc-123", "block-canvas", null, 1)).toContainEqual({
    name: "variant",
    value: "1",
  });
});

it("no variant tag when the cohort index is omitted", () => {
  expect(blastTags("abc-123", "block-canvas")).not.toContainEqual(
    expect.objectContaining({ name: "variant" }),
  );
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/blast-tags.test.ts`
Expected: FAIL — `blastTags` doesn't accept a 4th param.

- [ ] **Step 3: Implement**

```ts
export function blastTags(
  deliverableId: string,
  template: string,
  campaignKey?: string | null,
  variant?: number,
): { name: string; value: string }[] {
  const tags = [
    { name: "did", value: deliverableId.replace(SAFE, "") },
    { name: "tpl", value: template.replace(SAFE, "") },
  ];
  const campaign = (campaignKey ?? "").replace(SAFE, "");
  if (campaign) tags.push({ name: "campaign", value: campaign });
  if (variant !== undefined) tags.push({ name: "variant", value: String(variant) });
  return tags;
}
```

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/blast-tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Migration**

```sql
-- 20260709_email_blasts_variant_config.sql — store the real split-test text
-- (so results can label "Variant B: '...'" instead of a bare index).
-- Idempotent: safe to re-run.

ALTER TABLE public.email_blasts
  ADD COLUMN IF NOT EXISTS variant_config jsonb;

NOTIFY pgrst, 'reload schema';
```

Run via Bun.SQL, then:

Run: `bun run gen:types`
Expected: `email_blasts` row type gains `variant_config: Json | null`.

- [ ] **Step 6: Commit**

```bash
git add lib/email/blast-tags.ts lib/email/blast-tags.test.ts docs/sql/20260709_email_blasts_variant_config.sql
git commit -m "feat(email): variant blast tag + email_blasts.variant_config column"
```

---

### Task 10: `variantResults` — aggregation + minimum-sample gate + two-proportion z-test

**Files:**
- Create: `lib/email/variant-results.ts`
- Create: `lib/email/variant-results.test.ts`

**Interfaces:**
- Consumes: `cohortIndex` (Task 8).
- Produces: `variantResults(args): VariantResultsOutput` — pure, no DB access. Callers (Task 12) pass plain arrays.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/variant-results.test.ts
import { describe, expect, it } from "bun:test";
import { variantResults } from "./variant-results";

function contactsFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `contact-${i}`);
}

describe("variantResults", () => {
  it("computes sent/opened/clicked per cohort from contactIds + events", () => {
    const contactIds = contactsFor(10);
    const events = [
      { variant: "0", event: "opened" },
      { variant: "0", event: "clicked" },
      { variant: "1", event: "opened" },
    ];
    const out = variantResults({
      contactIds,
      variantCount: 2,
      labels: { subjects: ["Subject A", "Subject B"] },
      events,
    });
    expect(out.cohorts).toHaveLength(2);
    const total = out.cohorts.reduce((a, c) => a + c.sent, 0);
    expect(total).toBe(10);
    expect(out.cohorts[0].label).toBe("Subject A");
  });

  it("skips a zero-recipient cohort entirely — never a fake 0% result", () => {
    // variantCount=3 but only 2 real cohorts get any contact (tiny audience, high N).
    const out = variantResults({
      contactIds: ["contact-0", "contact-1"],
      variantCount: 3,
      labels: { subjects: ["A", "B", "C"] },
      events: [],
    });
    expect(out.cohorts.every((c) => c.sent > 0)).toBe(true);
    expect(out.cohorts.length).toBeLessThan(3);
  });

  it("below the minimum sample, readyToCallWinner is false and winner is null", () => {
    const out = variantResults({
      contactIds: contactsFor(20), // < 50/cohort at N=2
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(out.readyToCallWinner).toBe(false);
    expect(out.winner).toBeNull();
  });

  it("gates exactly at the 49 vs 50 recipients-per-cohort boundary", () => {
    // Build EXACT cohort sizes via cohortIndex itself (deterministic, not random)
    // rather than assuming a specific pool size lands evenly.
    const { cohortIndex } = require("./variant-cohort");
    const pool = Array.from({ length: 3000 }, (_, i) => `pool-${i}`);
    const forCohort = (want: number, n: number) =>
      pool.filter((id) => cohortIndex(id, 2) === want).slice(0, n);

    const at49 = variantResults({
      contactIds: [...forCohort(0, 49), ...forCohort(1, 49)],
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(at49.cohorts.every((c) => c.sent === 49)).toBe(true);
    expect(at49.readyToCallWinner).toBe(false); // below the 50 floor — gate OFF

    const at50 = variantResults({
      contactIds: [...forCohort(0, 50), ...forCohort(1, 50)],
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: [],
    });
    expect(at50.cohorts.every((c) => c.sent === 50)).toBe(true);
    expect(at50.readyToCallWinner).toBe(true); // at the 50 floor — gate ON
    expect(at50.winner).toBeNull(); // gate on ≠ a winner found — zero clicks here, different reason
  });

  it("at/above the minimum sample with a real click-rate gap, declares a significant winner", () => {
    // 60 recipients per cohort (>= MIN_SAMPLE); cohort 1 clicks at 40%, cohort 0 at 5%.
    const contactIds = contactsFor(120);
    const events: { variant: string; event: string }[] = [];
    for (const id of contactIds) {
      const v = require("./variant-cohort").cohortIndex(id, 2);
      const clickRate = v === 1 ? 0.4 : 0.05;
      if (Math.abs(hashFloat(id)) < clickRate) events.push({ variant: String(v), event: "clicked" });
    }
    // Deterministic alternative to a random draw: force an obvious, unambiguous gap.
    const forced = contactIds.map((id, i) => ({
      variant: String(require("./variant-cohort").cohortIndex(id, 2)),
      event: "clicked",
      i,
    }));
    const byVariant = { "0": forced.filter((f) => f.variant === "0"), "1": forced.filter((f) => f.variant === "1") };
    const clickedEvents = [
      ...byVariant["0"].slice(0, Math.floor(byVariant["0"].length * 0.05)),
      ...byVariant["1"].slice(0, Math.floor(byVariant["1"].length * 0.4)),
    ].map((f) => ({ variant: f.variant, event: "clicked" }));
    const out = variantResults({
      contactIds,
      variantCount: 2,
      labels: { subjects: ["A", "B"] },
      events: clickedEvents,
    });
    expect(out.readyToCallWinner).toBe(true);
    expect(out.winner).not.toBeNull();
    expect(out.winner?.variant).toBe(1);
  });

  it("a close race at the sample floor does NOT declare a winner", () => {
    const contactIds = contactsFor(120);
    const { cohortIndex } = require("./variant-cohort");
    const events = contactIds
      .filter((id) => cohortIndex(id, 2) !== undefined)
      .slice(0, 10) // a handful of clicks, evenly implied — not a real gap
      .map((id) => ({ variant: String(cohortIndex(id, 2)), event: "clicked" }));
    const out = variantResults({ contactIds, variantCount: 2, labels: { subjects: ["A", "B"] }, events });
    expect(out.winner).toBeNull();
  });
});

function hashFloat(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return h / 1000;
}
```

(This test intentionally builds its "obvious gap" fixture by construction — via `cohortIndex` itself — rather than assuming a specific hash output, so it stays correct regardless of the FNV-1a hash's exact distribution for these particular ids.)

- [ ] **Step 2: Run, confirm it fails**

Run: `bun test lib/email/variant-results.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// lib/email/variant-results.ts
//
// Pure aggregation of a split-send's cohort assignment (derived from
// contactIds + cohortIndex, NOT from a "sent" event — deterministic and
// reproducible) plus opened/clicked email_events rows (grouped by the
// `variant` tag) into per-cohort stats, gated by a real minimum-sample size
// and a two-proportion z-test before ever naming a leader. No invented
// confidence: a "winner" is a real statistical claim or it isn't claimed.

import { cohortIndex } from "./variant-cohort";

export const MIN_SAMPLE_PER_COHORT = 50;
const Z_95 = 1.96;

export interface VariantEventRow {
  variant: string | null;
  event: string;
}

export interface VariantStat {
  variant: number;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface VariantWinner {
  variant: number;
  liftPct: number;
  zScore: number;
}

export interface VariantResultsOutput {
  cohorts: VariantStat[];
  readyToCallWinner: boolean;
  minSample: number;
  winner: VariantWinner | null;
}

/** Two-proportion z-test on click rate, pooled-variance form. Returns 0 (never
 *  significant) when either cohort has zero sends. */
function twoProportionZ(clicksA: number, sentA: number, clicksB: number, sentB: number): number {
  if (sentA === 0 || sentB === 0) return 0;
  const pA = clicksA / sentA;
  const pB = clicksB / sentB;
  const pPool = (clicksA + clicksB) / (sentA + sentB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / sentA + 1 / sentB));
  if (se === 0) return 0;
  return (pB - pA) / se;
}

export function variantResults(args: {
  contactIds: string[];
  variantCount: number;
  labels: { subjects?: string[]; ctas?: string[] };
  events: VariantEventRow[];
}): VariantResultsOutput {
  const { contactIds, variantCount, events, labels } = args;

  const sentByVariant = new Array<number>(variantCount).fill(0);
  for (const id of contactIds) sentByVariant[cohortIndex(id, variantCount)] += 1;

  const openedByVariant = new Array<number>(variantCount).fill(0);
  const clickedByVariant = new Array<number>(variantCount).fill(0);
  for (const e of events) {
    if (e.variant === null) continue;
    const v = Number(e.variant);
    if (!Number.isInteger(v) || v < 0 || v >= variantCount) continue;
    if (e.event === "opened") openedByVariant[v] += 1;
    if (e.event === "clicked") clickedByVariant[v] += 1;
  }

  // A cohort with 0 recipients (small audience, high N) is SKIPPED, not shipped
  // as a fake 0% result — a real result needs at least one recipient to mean
  // anything; "0 sent, 0% clicked" would misrepresent absence as a real rate.
  const cohorts: VariantStat[] = Array.from({ length: variantCount }, (_, i) => {
    const sent = sentByVariant[i];
    const opened = openedByVariant[i];
    const clicked = clickedByVariant[i];
    return {
      variant: i,
      label: labels.subjects?.[i] ?? labels.ctas?.[i] ?? `Variant ${i + 1}`,
      sent,
      opened,
      clicked,
      openRate: sent > 0 ? opened / sent : 0,
      clickRate: sent > 0 ? clicked / sent : 0,
    };
  }).filter((c) => c.sent > 0);

  const readyToCallWinner = cohorts.length >= 2 && cohorts.every((c) => c.sent >= MIN_SAMPLE_PER_COHORT);

  let winner: VariantWinner | null = null;
  if (readyToCallWinner) {
    const sorted = [...cohorts].sort((a, b) => b.clickRate - a.clickRate);
    const [top, runnerUp] = sorted;
    const z = twoProportionZ(runnerUp.clicked, runnerUp.sent, top.clicked, top.sent);
    if (Math.abs(z) >= Z_95) {
      winner = {
        variant: top.variant,
        liftPct:
          runnerUp.clickRate > 0 ? ((top.clickRate - runnerUp.clickRate) / runnerUp.clickRate) * 100 : 0,
        zScore: z,
      };
    }
  }

  return { cohorts, readyToCallWinner, minSample: MIN_SAMPLE_PER_COHORT, winner };
}
```

- [ ] **Step 4: Run, confirm it passes**

Run: `bun test lib/email/variant-results.test.ts`
Expected: PASS. If the "obvious gap" case is flaky at the exact z=1.96 boundary, widen the forced gap (e.g. 3% vs 45%) rather than loosening the threshold.

- [ ] **Step 5: Commit**

```bash
git add lib/email/variant-results.ts lib/email/variant-results.test.ts
git commit -m "feat(email): variantResults — cohort aggregation + two-proportion z-test gate"
```

---

### Task 11: Blast route — `variant_test` split-send

**Files:**
- Modify: `app/api/deliverables/[id]/blast/route.ts`
- Test: `app/api/deliverables/[id]/blast/route.test.ts` (check first: `test -f "app/api/deliverables/[id]/blast/route.test.ts" && echo exists || echo missing` — if this route has no existing test file, add pure-logic tests to `lib/email/blast-tags.test.ts`-adjacent coverage is NOT enough; instead extract the new per-cohort logic into a small pure helper so it's unit-testable without mocking `NextRequest`/Supabase, per this file's existing untested-route convention — see Step 3)

**Interfaces:**
- Consumes: `cohortIndex` (Task 8), `blastTags` (Task 9, now variant-aware), `EmailDocSchema` (Task 2).
- Produces: request body gains optional `variant_test: { subjects?: string[]; ctas?: string[] }`; `email_blasts` insert gains `variant_config`.

- [ ] **Step 1: Extract a pure per-cohort resolver (testable without mocking the route)**

Create `lib/email/blast-variant-doc.ts`:

```ts
// lib/email/blast-variant-doc.ts
//
// Pure helpers for a split-send: validate a variant_test request against the
// authored doc's own variant arrays, and swap a button block's label for a
// given cohort's CTA text. No I/O — the blast route calls these, then renders.

import type { EmailDoc } from "./doc/types";

export interface VariantTestRequest {
  subjects?: string[];
  ctas?: string[];
}

export interface VariantTestValidation {
  ok: boolean;
  error?: string;
  variantCount: number;
}

/** A real split needs >=2 options on at least one axis, and if BOTH axes are
 *  given they must be the same length (one cohort = one subject + one CTA). */
export function validateVariantTest(req: VariantTestRequest): VariantTestValidation {
  const sCount = req.subjects?.length ?? 0;
  const cCount = req.ctas?.length ?? 0;
  if (sCount === 0 && cCount === 0) {
    return { ok: false, error: "variant_test requires subjects or ctas", variantCount: 0 };
  }
  if (sCount > 0 && cCount > 0 && sCount !== cCount) {
    return { ok: false, error: "subjects and ctas variant counts must match", variantCount: 0 };
  }
  const variantCount = Math.max(sCount, cCount);
  if (variantCount > 4) {
    return { ok: false, error: "max 4 variants per split-test", variantCount: 0 };
  }
  return { ok: true, variantCount };
}

/** Replace the FIRST button block's label — the doc model is "single centered
 *  CTA" (ButtonBlock.tsx), so there's exactly one to swap. A doc with no
 *  button block is returned unchanged (a CTA-only test with no button is a
 *  no-op, not an error — mirrors the spec's "CTA-only tests are valid" note
 *  degrading gracefully when there's nothing to swap). */
export function withCtaLabel(doc: EmailDoc, label: string): EmailDoc {
  const idx = doc.blocks.findIndex((b) => b.type === "button");
  if (idx === -1) return doc;
  const blocks = [...doc.blocks];
  const target = blocks[idx];
  blocks[idx] = { ...target, props: { ...target.props, label } } as EmailDoc["blocks"][number];
  return { ...doc, blocks };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/email/blast-variant-doc.test.ts
import { describe, expect, it } from "bun:test";
import { validateVariantTest, withCtaLabel } from "./blast-variant-doc";
import type { EmailDoc } from "./doc/types";

describe("validateVariantTest", () => {
  it("accepts subjects only", () => {
    expect(validateVariantTest({ subjects: ["A", "B"] })).toEqual({ ok: true, variantCount: 2 });
  });
  it("accepts ctas only", () => {
    expect(validateVariantTest({ ctas: ["A", "B", "C"] })).toEqual({ ok: true, variantCount: 3 });
  });
  it("rejects mismatched subject/cta counts", () => {
    expect(validateVariantTest({ subjects: ["A", "B"], ctas: ["X", "Y", "Z"] }).ok).toBe(false);
  });
  it("rejects neither axis given", () => {
    expect(validateVariantTest({}).ok).toBe(false);
  });
  it("rejects more than 4 variants", () => {
    expect(validateVariantTest({ subjects: ["A", "B", "C", "D", "E"] }).ok).toBe(false);
  });
});

describe("withCtaLabel", () => {
  const doc: EmailDoc = {
    globalStyle: {} as EmailDoc["globalStyle"],
    blocks: [
      { id: "1", type: "text", props: { body: "hi" } },
      { id: "2", type: "button", props: { label: "View Report", url: "https://x" } },
    ],
  };

  it("swaps the first button block's label", () => {
    const out = withCtaLabel(doc, "See the Numbers");
    expect((out.blocks[1].props as { label?: string }).label).toBe("See the Numbers");
    expect((out.blocks[1].props as { url?: string }).url).toBe("https://x"); // untouched
  });

  it("is a no-op when there's no button block", () => {
    const noButton: EmailDoc = { ...doc, blocks: [doc.blocks[0]] };
    expect(withCtaLabel(noButton, "X")).toEqual(noButton);
  });
});
```

- [ ] **Step 3: Run, confirm it fails**

Run: `bun test lib/email/blast-variant-doc.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Run, confirm it passes**

(The implementation in Step 1 already satisfies these — this step is the actual TDD checkpoint since Step 1 was written test-first in spirit; run it now.)

Run: `bun test lib/email/blast-variant-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `variant_test` into the blast route**

In `app/api/deliverables/[id]/blast/route.ts`:

Add imports:
```ts
import { cohortIndex } from "@/lib/email/variant-cohort";
import { validateVariantTest, withCtaLabel } from "@/lib/email/blast-variant-doc";
```

After parsing `body` (existing `const body = await req.json().catch(() => null);`), read the new field:

```ts
  const variantTestRaw = body?.variant_test as { subjects?: string[]; ctas?: string[] } | undefined;
  let variantCount = 1;
  if (variantTestRaw) {
    const v = validateVariantTest(variantTestRaw);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });
    variantCount = v.variantCount;
  }
```

Where `baseHtml` is currently rendered for `block-canvas` (the `if (deliverable.template === "block-canvas") { ... baseHtml = await renderEmailDocHtml(parsedDoc.data); ... }` block), replace the single `baseHtml` with an array of per-cohort HTML when `variantCount > 1` or `variantTestRaw?.ctas` is set:

```ts
  let htmlByVariant: string[] = [];
  if (deliverable.template === "block-canvas") {
    const parsedDoc = EmailDocSchema.safeParse(deliverable.doc);
    if (!parsedDoc.success) {
      return NextResponse.json({ error: "invalid email document" }, { status: 422 });
    }
    const docsToRender =
      variantTestRaw?.ctas && variantTestRaw.ctas.length > 1
        ? variantTestRaw.ctas.map((label) => withCtaLabel(parsedDoc.data, label))
        : variantTestRaw?.ctas?.length === 1
          ? [withCtaLabel(parsedDoc.data, variantTestRaw.ctas[0])]
          : [parsedDoc.data];
    htmlByVariant = await Promise.all(docsToRender.map((d) => renderEmailDocHtml(d)));
    if (includePdf) {
      pdfBuffer = await renderEmailDocToBuffer(parsedDoc.data);
    }
  } else {
    // ...unchanged legacy-template branch, but set htmlByVariant = [baseHtml] at its end...
  }
  const baseHtml = htmlByVariant[0]; // keep existing single-HTML call sites (url-lint) working
```

(Existing `lintCompiledHtml`/`collectAllowedUrls` calls stay against `baseHtml` — the lint is content-shape, not per-variant-text-specific, and every `htmlByVariant` entry is the SAME doc with only the button label swapped, so linting the first is sufficient; do not re-lint N times.)

Subject resolution: replace the existing single `subject` computation with a per-cohort array when `variantTestRaw?.subjects` is set:

```ts
  const subjectByVariant: string[] =
    variantTestRaw?.subjects && variantTestRaw.subjects.length > 0
      ? variantTestRaw.subjects
      : [
          typeof body?.subject === "string" && body.subject.trim()
            ? body.subject.trim()
            : deriveSubject(deliverable.narrative as { exec_summary?: string } | null),
        ];
```

(Remove the old single `const subject = ...` line — `subjectByVariant[0]` replaces every remaining plain `subject` reference outside `messageFor`, e.g. the activity-log `detail: { ..., subject }` — use `subjectByVariant[0]` there.)

Update `messageFor` to pick per-contact cohort:

```ts
  const isRealSplit = variantCount >= 2;
  const messageFor = (c: { id: string; email: string; name: string | null }) => {
    const cohort = isRealSplit ? cohortIndex(c.id, variantCount) : 0;
    const html = htmlByVariant[cohort] ?? htmlByVariant[0];
    const subject = subjectByVariant[cohort] ?? subjectByVariant[0];
    const unsubUrl = `${BASE_URL}/api/unsubscribe?id=${c.id}`;
    const finalHtml = withMergeTags(
      bindUnsubscribeHref(withFooter(html, webUrl, unsubUrl), unsubUrl),
      c,
    );
    return {
      from,
      to: [c.email],
      subject,
      html: finalHtml,
      ...(replyTo ? { replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: blastTags(
        id,
        deliverable.template,
        deliverable.campaign_key,
        isRealSplit ? cohort : undefined,
      ),
    };
  };
```

Persist `variant_config` only for a real split (`variantCount >= 2`), in the existing `email_blasts` insert:

```ts
  const { data: blast } = await supabase
    .from("email_blasts")
    .insert({
      user_id: user.id,
      deliverable_id: id,
      contact_ids: contacts.map((c) => c.id),
      status: "sending",
      ...(isRealSplit
        ? { variant_config: { subjects: variantTestRaw?.subjects ?? null, ctas: variantTestRaw?.ctas ?? null } }
        : {}),
    })
    .select("id")
    .single();
```

- [ ] **Step 6: Typecheck + existing tests still pass**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "blast/route.ts" || echo clean`
Expected: `clean`.

Run: `bun test lib/email/blast-tags.test.ts lib/email/blast-variant-doc.test.ts`
Expected: PASS (this route has no pre-existing test suite of its own to regress — verified by Step 0's existence check).

- [ ] **Step 7: Commit**

```bash
git add app/api/deliverables/\[id\]/blast/route.ts lib/email/blast-variant-doc.ts lib/email/blast-variant-doc.test.ts
git commit -m "feat(email): blast route split-send via variant_test (cohort-hashed)"
```

---

### Task 12: Results route — `GET /api/deliverables/[id]/blast-results`

**Files:**
- Create: `app/api/deliverables/[id]/blast-results/route.ts`

**Interfaces:**
- Consumes: `variantResults` (Task 10).
- Produces: `GET` returns `{ hasSplitTest: false }` or `{ hasSplitTest: true, results: VariantResultsOutput }`.

- [ ] **Step 1: Implement (no separate unit test — this route is a thin adapter over the already-tested pure `variantResults`; verify via the manual check in Step 2, matching this codebase's convention of not re-testing thin route glue)**

```ts
// app/api/deliverables/[id]/blast-results/route.ts
//
// GET the most recent split-test's aggregated results for a deliverable. Reads
// the latest email_blasts row carrying a non-null variant_config, then groups
// email_events (did-tagged, variant-tagged — Task 1's webhook branch) through
// the pure variantResults aggregator. Known limitation (see plan Global
// Constraints): did is the DELIVERABLE id, not the blast id — re-splitting the
// same deliverable blends prior events into the new read.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { variantResults } from "@/lib/email/variant-results";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: blast } = await supabase
    .from("email_blasts")
    .select("contact_ids, variant_config")
    .eq("deliverable_id", id)
    .eq("user_id", user.id)
    .not("variant_config", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!blast?.variant_config) {
    return NextResponse.json({ hasSplitTest: false });
  }

  const config = blast.variant_config as { subjects?: string[] | null; ctas?: string[] | null };
  const variantCount = config.subjects?.length ?? config.ctas?.length ?? 0;
  if (variantCount < 2) {
    return NextResponse.json({ hasSplitTest: false });
  }

  const { data: events } = await supabase
    .from("email_events")
    .select("variant, event")
    .eq("did", id)
    .in("event", ["opened", "clicked"]);

  const results = variantResults({
    contactIds: (blast.contact_ids as string[]) ?? [],
    variantCount,
    labels: {
      subjects: config.subjects ?? undefined,
      ctas: config.ctas ?? undefined,
    },
    events: (events ?? []) as { variant: string | null; event: string }[],
  });

  return NextResponse.json({ hasSplitTest: true, results });
}
```

- [ ] **Step 2: Manual verification (no live Resend send — per this route's own I/O-boundary convention)**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "blast-results/route.ts" || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add app/api/deliverables/\[id\]/blast-results/route.ts
git commit -m "feat(email): GET blast-results — variant aggregation endpoint"
```

---

### Task 13: `ContactPickerModal` — variant pickers + split-test toggle

**Files:**
- 🟢 Modify: `components/contacts/ContactPickerModal.tsx`
- Modify: `components/email-lab/EmailLabGridShell.tsx` (pass the two new props at the existing call site, `EmailLabGridShell.tsx:1689-1693`)

**Interfaces:**
- Consumes: `EmailDoc.subjectVariants`/`ctaVariants` (Task 2).
- Produces: the existing `handleSend()` POST body gains `variant_test` when the split toggle is on, or when a CTA pill is picked without splitting (N=1 override, reusing the same backend path from Task 11).

- [ ] **Step 1: Add props**

In `components/contacts/ContactPickerModal.tsx`:

```ts
interface Props {
  deliverableId: string;
  isBlockCanvas: boolean;
  onClose: () => void;
  /** AI-authored subject-line alternatives (Task 5) — absent/empty → no picker UI, unchanged today's behavior. */
  subjectVariants?: string[];
  /** AI-authored CTA-label alternatives (Task 5) — absent/empty → no picker UI, unchanged today's behavior. */
  ctaVariants?: string[];
}
```

- [ ] **Step 2: Add state for the picker + toggle**

```ts
export function ContactPickerModal({
  deliverableId,
  isBlockCanvas,
  onClose,
  subjectVariants,
  ctaVariants,
}: Props) {
  // ...existing state...
  const [splitTest, setSplitTest] = useState(false);
  const [ctaOverride, setCtaOverride] = useState<string | null>(null);
  const hasVariants = (subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2;
```

- [ ] **Step 3: Thread the picks into `handleSend`**

Replace the existing `body: JSON.stringify({...})` in `handleSend`:

```ts
      const variantTest =
        splitTest && hasVariants
          ? {
              ...((subjectVariants?.length ?? 0) >= 2 ? { subjects: subjectVariants } : {}),
              ...((ctaVariants?.length ?? 0) >= 2 ? { ctas: ctaVariants } : {}),
            }
          : ctaOverride
            ? { ctas: [ctaOverride] }
            : undefined;
      const res = await fetch(`/api/deliverables/${deliverableId}/blast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact_ids: Array.from(selected),
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          ...(attachPdf ? { include_pdf: true } : {}),
          ...(variantTest ? { variant_test: variantTest } : {}),
        }),
      });
```

- [ ] **Step 4: Render the pickers, right after the existing subject `<input>`**

```tsx
              {(subjectVariants?.length ?? 0) >= 2 && !splitTest && (
                <div className="flex flex-wrap gap-1.5">
                  {subjectVariants!.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSubject(v)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        subject === v
                          ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                          : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                      }`}
                    >
                      {v.length > 40 ? `${v.slice(0, 40)}…` : v}
                    </button>
                  ))}
                </div>
              )}
              {(ctaVariants?.length ?? 0) >= 2 && !splitTest && (
                <div className="flex flex-wrap gap-1.5">
                  {ctaVariants!.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCtaOverride(v)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        ctaOverride === v
                          ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                          : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                      }`}
                    >
                      CTA: {v}
                    </button>
                  ))}
                </div>
              )}
              {hasVariants && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={splitTest}
                    onChange={(e) => setSplitTest(e.target.checked)}
                    className="h-4 w-4 accent-gulf-teal"
                  />
                  Split test this send ({Math.max(subjectVariants?.length ?? 0, ctaVariants?.length ?? 0)}{" "}
                  variants, cohort-assigned)
                </label>
              )}
```

- [ ] **Step 5: Pass the new props from `EmailLabGridShell.tsx`**

At the existing call site (`EmailLabGridShell.tsx:1689-1693`):

```tsx
      {sendOpen && sendId && (
        <ContactPickerModal
          deliverableId={sendId}
          isBlockCanvas
          onClose={() => setSendOpen(false)}
          subjectVariants={doc.subjectVariants}
          ctaVariants={doc.ctaVariants}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "ContactPickerModal|EmailLabGridShell" || echo clean`
Expected: `clean`.

- [ ] **Step 7: Manual browser verification (per this component's UI-only nature — no existing test file for it)**

Start the dev server, open the Email Lab, author a doc whose AI response includes subject/CTA variants (or temporarily hardcode `subjectVariants`/`ctaVariants` on a seed doc for the check), open the send modal, confirm: pills render, clicking a subject pill updates the subject input, clicking a CTA pill highlights it, the split-test checkbox only appears when >=2 variants exist on either axis, and a real send's network request body carries `variant_test` in exactly the two cases described in Step 3.

- [ ] **Step 8: Commit**

```bash
git add components/contacts/ContactPickerModal.tsx components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(email): subject/CTA variant pickers + split-test toggle in send modal"
```

---

### Task 14: `BlastResultsPanel` — minimum-sample-gated results display

**Files:**
- Create: `components/contacts/BlastResultsPanel.tsx`
- 🟢 Modify: `components/contacts/ContactPickerModal.tsx` (render it in the post-send `result` state, when a split test was sent)

**Interfaces:**
- Consumes: `GET /api/deliverables/[id]/blast-results` (Task 12), shape `{ hasSplitTest: boolean; results?: VariantResultsOutput }`.

- [ ] **Step 1: Implement the panel**

```tsx
// components/contacts/BlastResultsPanel.tsx
"use client";
import { useEffect, useState } from "react";

interface VariantStat {
  variant: number;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}
interface Results {
  cohorts: VariantStat[];
  readyToCallWinner: boolean;
  minSample: number;
  winner: { variant: number; liftPct: number; zScore: number } | null;
}

export function BlastResultsPanel({ deliverableId }: { deliverableId: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deliverables/${deliverableId}/blast-results`)
      .then((r) => (r.ok ? r.json() : { hasSplitTest: false }))
      .then((data) => {
        if (!cancelled) setResults(data.hasSplitTest ? data.results : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deliverableId]);

  if (loading || !results) return null;

  return (
    <div className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Split test results
      </p>
      <div className="space-y-2">
        {results.cohorts.map((c) => (
          <div key={c.variant} className="flex items-center justify-between text-sm">
            <span className="truncate text-gray-300" title={c.label}>
              {results.winner?.variant === c.variant ? "★ " : ""}
              {c.label.length > 36 ? `${c.label.slice(0, 36)}…` : c.label}
            </span>
            <span className="shrink-0 text-gray-400">
              {c.sent} sent · {(c.clickRate * 100).toFixed(1)}% clicked
            </span>
          </div>
        ))}
      </div>
      {results.winner ? (
        <p className="mt-3 text-xs text-gulf-teal">
          Variant {results.winner.variant + 1} is leading — {results.winner.liftPct.toFixed(0)}% lift,
          statistically significant at 95% confidence.
        </p>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          {results.readyToCallWinner
            ? "No statistically significant leader yet."
            : `Not enough sends yet to call a winner (need ${results.minSample}/cohort).`}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the post-send state**

In `ContactPickerModal.tsx`, inside the `sentOk` branch of the post-`result` JSX (right after the existing "Sent to N contacts" `<p>`), add:

```tsx
                {(subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2 ? (
                  <BlastResultsPanel deliverableId={deliverableId} />
                ) : null}
```

Add the import: `import { BlastResultsPanel } from "./BlastResultsPanel";`.

(This shows the panel whenever the doc HAD variants available — even if this particular send wasn't a split test, in which case the panel's own `hasSplitTest: false` response makes it render nothing. Harmless: `BlastResultsPanel` returns `null` in that case.)

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "BlastResultsPanel|ContactPickerModal" || echo clean`
Expected: `clean`.

- [ ] **Step 4: Manual browser verification**

With a deliverable that has a real `variant_config` row (send a real split test to a couple of test contacts, or seed `email_blasts`/`email_events` rows directly in a dev DB), open the send modal's post-send state and confirm the panel renders per-cohort counts and either the "not enough sends yet" line or a winner line — never a bare "Variant B is leading" without the counts backing it.

- [ ] **Step 5: Commit**

```bash
git add components/contacts/BlastResultsPanel.tsx components/contacts/ContactPickerModal.tsx
git commit -m "feat(email): BlastResultsPanel — gated split-test results in the send modal"
```

---

## Post-plan checklist

- [ ] Full suite: `bun test` — confirm no regressions outside the files this plan touched.
- [ ] `bunx next build` (per this repo's verify convention — NOT `npx tsc`) — confirm the whole app compiles.
- [ ] `bun run gen:types` was run after BOTH migrations (Task 1 Step 5, Task 9 Step 5) and `database-generated.types.ts` is staged.
- [ ] SESSION_LOG.md entry appended before the final push (RULE 0), citing this plan's path.
- [ ] `node scripts/check.mjs close subject_cta_variants_live_verify` only after a REAL split-test send + a REAL webhook-driven results read have been observed live (per `feedback_checks-prod-evidence-not-dev-attestation` — dev-only testing does not close this check).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `lib/email/doc/schema.ts` |
| 🟡 | Task 4, Task 5 | `lib/email/author-doc.ts` |
| 🟢 | Task 13, Task 14 | `components/contacts/ContactPickerModal.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
