# Handoff — Agent Launch plan verification (second pass, 07/05/2026)

**Target plan:** `docs/superpowers/plans/2026-07-05-agent-launch-campaign.md` (commit `2b719e6b`)
**Spec:** `docs/superpowers/specs/2026-07-05-agent-launch-campaign-design.md` · Check: `agent_launch_campaign_live_verify`

This session ran the operator-ordered verification pass ("look at code and plan after sending
out crawl4ai for any questions"): full code probe of every seam the plan touches + live
crawl4ai vendor verification. The plan file itself was under an active parallel-session claim
at write time, so the findings land here instead of inline. **Fold A1–A6 into the plan (or
honor them at execution) before running it.**

## Vendor contract — verified in-session (RULE 0.4)

Sources: installed SDK `resend@6.16.0` (`node_modules/resend/dist/index.d.cts`) + crawl4ai of
`resend.com/docs/dashboard/emails/tags` and `resend.com/docs/webhooks/event-types` (both 200,
07/05/2026).

- `tags?: {name, value}[]` rides `emails.send` AND `batch.send` — the batch payload type is
  `Omit<CreateEmailOptions, 'attachments' | 'scheduledAt'>` (index.d.cts:635), so **tags
  survive batch sends**. The docs show per-message tags in the batch example.
- Constraints: tag name AND value allow ONLY ASCII letters, numbers, underscores, dashes;
  ≤256 chars each; ≤75 tags per email. (`agent-launch` and UUIDs pass as-is.)
- Docs verbatim: **"After the email is sent, the tag is included in the webhook event."**
  Email events: sent / delivered / opened / clicked / bounced / complained / failed /
  delivery_delayed / scheduled / suppressed. Build 2's "data accrues from day one" claim
  holds — but only if the campaign value is actually IN the tags (see A1).
- `mailto:` hrefs pass the blast route's fake-link tripwire — `SAFE_SCHEME_RE` at
  `lib/deliverable/url-lint.ts:33` whitelists `mailto:` / `tel:` / `data:`. No send-time risk
  from the reply CTA.

## A1 — ⚠ OPERATOR DECISION: plan deviation 1 breaks DONE-WHEN and loses data permanently

Plan deviation 1 tags sends with `deliverable_id` + `template` only, arguing "deliverable id
is the join key, so nothing is lost." **That rationale is wrong as stated:** nothing anywhere
persists WHICH deliverable was campaign-seeded — `deliverables` has no campaign column
(verified: `database-generated.types.ts:834-853`), and the recipe hand-off carries no campaign
identity into the save path. With no campaign tag AND no column, the campaign linkage never
exists in any store; Build 2 cannot reconstruct it, and spec DONE-WHEN item 4 ("Blast sends
carry campaign + deliverable tags — inspect one Resend payload") cannot be met as ratified.

The minimal full thread is small (all seams probed):
1. Idempotent migration: `ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS campaign_key text;`
   (run via Bun.SQL — psql not installed; creds in `.dlt/secrets.toml`, `sslmode=require`).
2. Hand-add `campaign_key` to the deliverables Row/Insert/Update in `database-generated.types.ts` (~line 834).
3. `app/api/projects/[id]/materials/route.ts` POST: accept `body.campaign_key`, validate
   `/^[a-z0-9-]{1,40}$/`, include in the insert. Leave PATCH alone (doc edits never wipe provenance).
4. Grid shell: `onSave?: (doc, aiPrompt, campaignKey?: string | null)` — the chip state from
   plan Task 7 (`campaignFollowUp`) knows the key at seed time; retain the KEY separately from
   the chip's armed/dismissed lifecycle so a dismissed chip still saves provenance, and so the
   weekly (follow-up) deliverable carries the same key. `ProjectEmailLabClient.handleSave`
   forwards it (new-deliverable branch only).
5. `blastTags(...)` gains `{ name: "campaign", value: campaign_key }` when non-null.

Default if no ruling: do the full thread — it is what the ratified spec says.

## A2 — ⚠ OPERATOR DECISION: plan deviation 2 conflicts with ratified spec L3

Plan drops the engine-written muted source line on the stat clipping, citing consumption
contract rule 1 ("sources ride in the collapsed list, not inline"). Spec §5 L3 explicitly
ratified "a muted source line (the figure's source name, engine-written)". Two operator
rulings collide — operator's call. If the source line wins: `MarketFigure.source` is available
at assembly (`lib/email/market-context.ts:22`); add `HeroProps.sourceLine` as ENGINE-OWNED
(never in `BlockContentPatchSchema` or `AuthoredBlockSchema` — same posture as
`metricValue`), source NAME only, no date (the as-of date is stated once per artifact), fill
it in `buildEntry` when `value_figure` resolves, render in `HeroBlock` + the PDF hero case.
The accent border ships under either ruling.

## A3 — DEFECT in plan Task 4 (L2 reply CTA): applyBrand clobbers the mailto

Plan Task 4 sets `props.url = buttonMailto` at assembly (server). But the grid shell then runs
`applyBrand(parsed.data, brandTokens)` on the authored doc (`EmailLabGridShell.tsx:342`), and
`applyBrand`'s button branch (`components/email-lab/EmailLabShell.tsx:140-141`) is:

```ts
} else if (b.type === "button") {
  if (cta) props.url = cta;
}
```

`cta = t.CTA_URL || t.WEBSITE_URL` — any brand with a website URL **silently overwrites the
mailto**, and the reply button becomes a website link. Fix (one line + test), required for
Task 4 to work at all:

```ts
} else if (b.type === "button") {
  if (cta && !String(props.url ?? "").startsWith("mailto:")) props.url = cta;
}
```

Test it directly — `applyBrand` is exported from `EmailLabShell.tsx`: a button with
`url: "mailto:agent@example.com"` + tokens `{ WEBSITE_URL: "https://x" }` keeps the mailto; a
button with empty url still gets the CTA (today's behavior preserved).

## A4 — GAP in plan Task 2 (L4): the PDF engine never renders columns

Spec L4: side-by-side must render as true columns "in ALL THREE render engines (free flow,
grid, PDF — they diverge; memory landmine)… Fix where broken; this is load-bearing for the
whole look." Plan Task 2 only characterizes `compileGrid` and runs existing tests for the
rest. Probe result:

- **Grid engine: fine.** `compileGrid` implements the Cerberus hybrid pattern (verified
  06/28/2026 in-file) — true columns, mobile stacking without media queries, MSO ghost tables.
- **Free flow: needs no fix, only a routing assertion.** `renderEmailDocHtml`
  (`lib/email/render-email-doc.ts:23`) routes ANY layout-carrying doc to `compileGrid` — the
  free stacker never sees a positioned doc. Assert the routing in a test; don't "fix" it.
- **PDF: BROKEN for this build's flagship look.** `lib/pdf/email-doc-pdf.tsx` never reads
  `block.layout` — blocks render as a sequential stack, so the portrait-beside-letter row
  stacks in the PDF attachment (`blast` include_pdf path) and the Download-PDF path.

Fix shape (keeps the single-root discipline):
1. Extract `groupRows` + `effectiveLayout` from `compile-grid.ts:68-130` VERBATIM into a new
   `lib/email/doc/row-grouping.ts` (returns rows of `{ block, eff: {x,y,w,h} }`); make
   `compile-grid.ts` consume it (its output must stay byte-identical — existing compile-grid
   tests prove it).
2. In `EmailDocPdf`, group first; single-entry rows render as today; multi-entry rows wrap in
   `<View style={{ flexDirection: "row" }}>` with each child in
   `<View style={{ flex: eff.w }}>`.
3. Tests: 5+7 and 6+6 grouping cases (including the RGL-compaction case: 6+6 with unequal
   heights/different y — the band rule, not exact-y match), plus a PDF tree-walk asserting the
   flex row (mirror `lib/pdf/__tests__/email-doc-pdf.test.ts`'s audit-test introspection
   pattern).

## A5 — minor, plan Task 1: `object-fit` is not email-safe

The plan's agent-card crop uses `objectFit: "cover"` with fixed 96×120. Outlook ignores
`object-fit` (renders a distorted fixed-size img); support is spotty elsewhere. Prefer
width-only sizing (`width: 84-96px`, no height — natural aspect keeps half-body cutouts
undistorted) or consciously accept distortion. Same note for the PDF agent-card case
(`email-doc-pdf.tsx:291`) — drop the fixed square there too.

## A6 — scheduler files are claimed; the jitter check is the right call

`lib/email/scheduler.ts` + `scripts/email/run-schedules.mts` are under a live parallel-session
repolith claim (send-surface hardening, unpushed). Plan Task 11's minute-jitter CHECK (instead
of code) is correct — spec's own "if not trivial, open a check" hatch. Do not touch those
files this build.

## Confirmations (things the plan gets right — no action)

- Announcement prompt routes onto `agent-intro` (`WELCOME_RE` matches "introduc"); the weekly
  prompt hits no recipe regex (no monthly/newsletter/digest/letter words) — routing claims check out.
- Task 5 recipe text contains zero digits (spans/counts as words) — passes the hard constraint.
- `campaignFollowUpForPrompt` prompt-matching works because seed prompts live only in the
  registry; the chip cannot re-arm off the weekly recipe (not a seed prompt).
- Task ordering (assets in T8 before registry in T9) is forced by `registry.test.ts` asset
  existence + `toHaveLength(3→4)` — correct.
- Tag charset sanitizing in `blastTags` matches the verified vendor constraint.
- `weekly` + `day_of_week` Tuesday is fully supported by the existing schedule path
  (`schedule-command` route → `computeNextRunAt`) — no new scheduling machinery needed, as specced.
