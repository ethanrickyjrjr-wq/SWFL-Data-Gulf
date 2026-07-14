# Contact segmentation for blast sends

**Date:** 2026-07-14

## Problem

Audience selection for a one-off blast (`POST /api/deliverables/[id]/blast`) is a single
client-side tag filter in `components/contacts/ContactPickerModal.tsx` — pick one tag,
check boxes, POST `contact_ids[]`. No AND/OR across tags, no filtering by custom
attributes, no "people who opened/clicked a specific past campaign" re-engagement segment.

Prompted by an audit of listmonk (github.com/knadh/listmonk, 07/14/2026 session) — it
supports raw-Postgres-fragment segmentation over arbitrary subscriber attributes and
campaign engagement. That literal approach doesn't fit here: this codebase's generated
Supabase types hardcode `Functions: Record<string, never>` (`database.types.ts`), so every
`.rpc()` call is untyped KNOWN-DEBT, and a free-text SQL box is an injection surface we
don't need to open. This spec adapts the underlying capability — attribute + engagement
segmentation — using the codebase's own "pure decision core + thin DB wrapper" pattern
(`lib/email/suppression.ts`, `lib/email/blast-stagger.ts`) instead.

## Goal

Let a user build a reusable, saved filter over their own `contacts` (tags AND/OR/NOT,
custom attributes, "engaged with campaign X") and use it to pick recipients for a blast
send — without adding a new parallel recipient-management system alongside the ones that
already exist.

## Scope / non-goals

- Operates ONLY on the `contacts` table — the blast route's actual source of truth
  (verified live 07/14/2026: the blast route queries `.from("contacts")`, not
  `email_contacts`).
- Does NOT touch `email_contacts` / Resend Segments (recurring digest lane, driven by
  `lib/email/audience-sync.ts`), `outreach_recipients` (cold-outreach drip,
  `lib/email/outreach/lifecycle.ts`), or `weekly_read_subscribers` (ZIP digest opt-in).
  Those remain separate, pre-existing lanes — this build does not add a fifth.
- Does NOT resolve the open `contacts_email_vs_public_lane` check (email_contacts vs
  contacts two-lane reconciliation). Explicitly out of scope; tracked separately.
- Does NOT rename, merge with, or replace `email_audiences` (the tag → Resend-segment-id
  cache). Different concept, different lane — see Naming section below.

## What we're building

### Data model

- Migration: `contacts.attribs jsonb not null default '{}'::jsonb` — arbitrary
  per-contact attributes (e.g. `{"city": "Naples", "budget": 450000}`), additive to the
  existing `tags text[]` / `unsubscribed` / `phone` columns.
- New table `contact_segments`: `id uuid pk default gen_random_uuid(), user_id uuid
  references auth.users, name text not null, filter jsonb not null, created_at
  timestamptz default now(), updated_at timestamptz default now()`. RLS: `user_id =
  auth.uid()`, same posture as `contacts` itself.
- CSV contact import (existing route covered by
  `lib/email/__tests__/contact-import-replay.route.test.ts`) maps any column not already
  recognized (email/name/phone/tags) into `attribs` by header name, instead of silently
  dropping it.

### Filter DSL (the AST — never raw SQL, never a free-text box)

```
type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { field: "tags"; op: "has"; value: string }
  | { field: "attribs"; key: string; op: "eq" | "gt" | "lt" | "contains";
      value: string | number | boolean }
  | { field: "email" | "name"; op: "matches"; value: string }   // substring, not regex
  | { field: "engagement"; op: "opened" | "clicked" | "never_opened";
      deliverable_id: string }
```

The picker UI only ever emits this shape (dropdowns → AST nodes). No layer ever accepts
or compiles a user-typed query string.

### Engine (pure core + thin DB wrapper)

- `lib/email/segments/filter.ts` — `evaluateSegment(contacts, events, filter): Contact[]`.
  Pure, dependency-free, unit-testable with zero DB — same shape as
  `suppression.ts#decideSuppressions`.
- `lib/email/segments/resolve.ts` — `resolveSegment(db, userId, filter)`: fetches the
  user's `contacts` rows, plus — only when the filter contains an `engagement`
  condition — the `email_events` rows for `did = <that deliverable_id>` restricted to
  those contact ids (never a full-table pull). Calls the pure evaluator. Mirrors
  `suppression.ts#getSuppressedContacts`'s chunked-fetch pattern for larger contact lists.

### API + persistence

- `/api/segments` — GET (list) / POST (create) / PATCH (update) / DELETE — CRUD for
  `contact_segments`, cookie/RLS client, scoped to the signed-in user like every other
  Email Lab route.
- `/api/segments/preview` — POST `{filter}` → matching contacts. Used by the picker to
  show a live match count as conditions are built, before saving.

### UI wiring

- `ContactPickerModal` replaces the single `activeTag` click-filter with a condition
  builder: tag chips (multi-select, AND/OR/NOT), attribute conditions (key/operator/value,
  keys sourced from the user's own observed `attribs`), and an "engaged with ___" dropdown
  populated from the user's own past deliverables. A "Save as segment" action persists the
  current filter to `contact_segments`.
- Tag-only filtering (today's capability) stays available to everyone
  (`FEATURE_ROUTING` = `"both"` in `lib/email/lab/capabilities.ts`). Attribute and
  engagement conditions are new capability, routed `"paid-only"` — the same tier
  machinery every other Email Lab feature already uses, never a hardcoded check in the
  modal itself.
- `/api/deliverables/[id]/blast` is UNCHANGED — it still only accepts `contact_ids[]`.
  The picker resolves a segment to a concrete id list client-side (via
  `/api/segments/preview`) before POSTing, exactly like manual checkbox selection does
  today.

### Naming disambiguation (so this isn't confused with `email_audiences`)

- `email_audiences` (existing) = tag → Resend-segment-id cache, feeds the recurring
  DIGEST broadcast lane (`lib/email/audience-sync.ts`, `lib/email/broadcast-overrides.ts`).
  Unrelated table, unrelated send path.
- `contact_segments` (new) = saved filter AST, feeds the one-off BLAST lane
  (`ContactPickerModal`, `/api/deliverables/[id]/blast`).
- Both `lib/email/audience-sync.ts` (top-of-file comment) and the new
  `lib/email/segments/resolve.ts` get an explicit one-line cross-reference to the other,
  and `lib/email/CLAUDE.md` gets an entry naming both as separate one-root concepts, so a
  future session searching "audience" or "segment" finds the right one immediately
  instead of assuming they're the same thing or merging them.

### Error handling

- Empty filter → today's exact behavior (all contacts shown, no regression).
- Engagement lookup error → fail open (no engagement data assumed), matching
  `suppression.ts`'s existing fail-open posture. Never blocks the picker or a send.
- `attribs` null/malformed on legacy rows → treated as `{}`; a condition referencing a
  missing key simply doesn't match (never throws).
- A saved segment's engagement condition pointing at a since-deleted deliverable →
  contributes zero matches at resolve time (not an error). The segment itself is never
  auto-deleted — a user's named segment is data, not a foreign-key-cascaded artifact.

### Testing

- `lib/email/segments/filter.test.ts` — pure `evaluateSegment` unit tests, same style as
  `suppression.test.ts` (fixtures in, matched contacts out, no DB).
- `lib/email/segments/resolve.test.ts` — DB wrapper tests with a stub Supabase client
  (chunking, fail-open behavior).
- `lib/email/lab/capabilities.test.ts` extension — assert attribute/engagement conditions
  never leak to free tier (existing test file, existing pattern).
- Manual live-verify (closes `contact_segments_live_verify`): build a segment with a tag
  condition AND an engagement condition against a real account, confirm the match count
  and the resulting blast recipient list are correct.

## Findability (so this isn't a silent build)

- `lib/email/CLAUDE.md` gets a new bullet naming `lib/email/segments/` as the one root
  for contact filtering, alongside the existing "one root" entries (social platforms,
  tier capabilities) — the file every session already reads before touching `lib/email`.
- `contact_segments_live_verify` check opened 07/14/2026 via `scripts/new-build.mjs`;
  closes only when the manual live-verify above is run and evidenced.
- SESSION_LOG entry on ship, per RULE 0.
