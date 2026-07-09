# Subject-line / CTA AI variants + split-test — design

**Status:** spec, not built. **Scope:** Email Lab block-canvas builds sent via
`/api/deliverables/[id]/blast` only. Does NOT touch the outreach drip
(`lib/email/outreach/demo-subjects.ts`) or the weekly-read digest
(`lib/email/weekly-read/`) — both are intentionally deterministic (no LLM) by
design, and that constraint stands.

## What exists today (probed, not assumed)

- `AUTHOR_TOOL` (`lib/email/author-doc.ts`) authors the whole document body in
  one model call — blocks, layout, prose — but has **no subject field** and
  **no variant concept** anywhere in its schema.
- The subject line is derived deterministically, post-hoc, from whatever
  headline-like text landed in the doc (`lib/email/emaildoc-subject.ts:
  deriveEmailDocSubject`) — one string, no AI involved, no alternatives.
- The CTA is a single `button` block; `ButtonBlock.tsx` says so explicitly in
  its own header comment ("Single centered CTA"). `button_label` on the
  `AUTHOR_TOOL` schema is one string.
- Resend has **no native A/B/split-send feature** (verified live against
  `resend.com/docs/dashboard/broadcasts/introduction`, 2026-07-08) — the only
  built-in testing tool is a manual "Test Email" preview send to one address.
  Any real split-test is entirely our own build.
- The blast route (`app/api/deliverables/[id]/blast/route.ts`) already tags
  every Resend send (`blastTags` in `lib/email/blast-tags.ts`: `did`, `tpl`,
  `campaign`) and the webhook (`app/api/webhooks/resend/route.ts`) already
  reads tags back off `email.opened`/`email.clicked` events. This is the exact
  mechanism a `variant` tag reuses — no new tracking pipe needed.
- The no-invention prose lint (`lib/deliverable/narrative-lint.ts`,
  reused inside `author-doc.ts`) already gates every number the model writes
  in body prose. Subject/CTA variants must pass through the same gate — a
  subject line that names a number (e.g. a headline figure) is exactly as
  dangerous as an invented number in a paragraph.

## Decision (operator, 2026-07-08)

Full split-test, not just "suggest and let the user pick." The operator wants
this promoted as a real feature with real data behind it, opt-in per send.

## Architecture

### 1. Generation (build time)

Extend `AUTHOR_TOOL.input_schema` with two optional top-level fields:

```
subject_variants: string[]   // 2-4 options, sibling of `blocks`
```

And on the block schema, alongside the existing `button_label` (only
meaningful on a `button`-type block, mirroring the "single centered CTA"
reality):

```
cta_variants: string[]       // 2-4 alternate button labels for THIS block
```

The system prompt (`authorSystem` in `author-doc.ts`) gets one added
paragraph: generate 3 subject lines and, if a button block is present, 3 CTA
labels — same "no invented numbers" rule as prose, same voice-guard pass
(`lib/email/voice-guard.ts`) applies to every variant string exactly as it
applies to the rest of the authored copy. No second model call — this rides
the existing cached tool definition and the one `author_email` invocation
already happening per build.

`assembleAuthoredDoc` picks variant `[0]` as the default (so a user who never
opens the variant picker gets the exact behavior of today — first option is
what `deriveEmailDocSubject` would have produced, no regression). The full
arrays ride on the `EmailDoc` (a new `subjectVariants?: string[]` /
`ctaVariants?: string[]` field, both optional, both absent → identical to
current behavior) so the Email Lab UI can offer the picker without a second
fetch.

### 2. Picker UI (Email Lab grid, `EmailLabGridShell.tsx`)

Subject field gets up to 3 selectable pills underneath it (same visual
pattern already used for the chart-type picker in the same file — a row of
small toggle buttons, not a dropdown). Selecting one sets the doc's subject.
Same treatment under the CTA button's label field when `ctaVariants` is
present. A "Split test this send" toggle appears only when ≥2 subject or CTA
variants exist — off by default (opt-in, per the operator's framing).

### 3. Split-send (blast time)

`app/api/deliverables/[id]/blast/route.ts` gains an optional body field:
`variant_test: { subjects?: string[]; ctas?: string[] }` (only sent when the
toggle was on). When present:

- Cohort assignment is a stable hash of `contact.id` mod `N` (N = variant
  count) — deterministic so a retried/partial batch send never reassigns a
  contact to a different cohort mid-flight.
- `messageFor(c)` picks that cohort's subject (falls back to the existing
  single `subject` when no subject variants were supplied — CTA-only tests
  are valid) and, when a CTA variant set exists, re-renders the doc's button
  block with that cohort's label before `renderEmailDocHtml`.
- `blastTags(id, template, campaignKey)` gains one more tag: `variant:<0|1|2>`.
  Tag values are already sanitized to `[A-Za-z0-9_-]` by the existing `SAFE`
  regex in `blast-tags.ts` — an index is trivially safe, no new validation
  needed.
- `email_blasts` gets one new nullable jsonb column, `variant_config`, storing
  `{ subjects: string[] | null, ctas: string[] | null }` — the actual text,
  so the results view can label "Variant B: '...'" instead of a bare letter.
  This extends the existing audit row (RULE 3 C2 — extend, don't erect a new
  table for what's fundamentally metadata on one send).

### 4. Results

A new pure aggregation function, `variantResults(events, config)`, groups the
blast's `email_events` rows (already keyed by `did` via the existing `rid`/
`did` tag plumbing) by the `variant` tag and computes, per cohort: sent count,
opened count, clicked count, and their rates.

**Minimum-sample gate:** below 50 recipients in the smaller cohort, the panel
shows raw counts and rates with a "not enough sends yet to call a winner"
line — never a declared leader off a handful of sends. At or above 50/cohort,
a simple two-proportion z-test (on click rate, the more decision-relevant
metric than opens) determines whether the leading cohort's lift is
significant at 95% confidence; only then does the UI say "Variant B is
leading" instead of just listing the numbers. This mirrors the platform's
existing no-invented-confidence posture — a "winner" is a real statistical
claim or it isn't claimed at all.

**Where it's shown:** the existing campaign-results strip that already reads
webhook events back for a deliverable (per `blast-tags.ts`'s own header
comment: "Build 2 (campaign results strip) reads these back off Resend
webhook events") gains a per-variant breakdown section when a blast's
`variant_config` is non-null. No new page — this extends an existing surface.

## Error handling

- No variants generated (model omitted the field, or a doc has no button
  block) → everything behaves exactly as today. This is the fallback path,
  not an error path.
- Variant text fails the no-invention lint → that variant is dropped (mirrors
  how a lint failure drops/strips authored prose today), never blocks the
  whole build.
- `variant_test` sent but variant count doesn't match `variant_config` (e.g.
  a stale request from an edited doc) → 422, same pattern as the existing
  `invalid email document` guard in the blast route.
- A cohort ends up with 0 contacts (small audience, high N) → that cohort is
  silently skipped in results, not counted as a 0% cohort (would misrepresent
  as a real result).

## Testing

- Pure functions get unit tests per existing convention: cohort-hash
  stability (same contact → same cohort across calls), `variantResults`
  aggregation math, the z-test threshold boundary (49 vs 50 recipients — gate
  on vs off), variant text passing/failing the no-invention lint.
- No live Resend send in tests — mirrors every existing email test in the
  repo (mocked send, real pure logic).
