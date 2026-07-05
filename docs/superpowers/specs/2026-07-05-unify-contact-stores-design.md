# One canonical contact store (public.contacts) + unified vCard parser

**Date:** 2026-07-05
**Source task:** `_AUDIT_AND_ROADMAP/Operation July/21-unify-contact-stores.md` (autopsy §9.6, P6)
**Checks:** `unify_contact_stores_live_verify` (opened by new-build) · this task IS the existing
"Reconcile email_contacts vs public.contacts two-lane + dedupe vCard parsers" check — close both on live proof.

## Problem

The platform has two contact stores that don't know about each other:

- **`public.contacts`** (uuid PK, `phone`, `unsubscribed`; `docs/sql/20260618_contacts_and_blasts.sql`) —
  written by the `/contacts` page (`POST /api/contacts`, `POST /api/contacts/import`), read by the one-off
  blast route (`app/api/deliverables/[id]/blast/route.ts:115`) and `/api/unsubscribe?id=<uuid>`.
- **`email_contacts`** (bigserial PK, no phone, no unsubscribed; `docs/sql/20260612_email_product.sql`) —
  written ONLY through `upsertContacts` (`lib/email/upsert-contacts.ts`; CSV upload, Google People, phone-QR
  all funnel through it), read by `lib/email/audience-sync.ts` (tags → Resend segments → `email_audiences`),
  the Resend inbound webhook (`app/api/webhooks/resend/route.ts:214`), and `scripts/email/migrate-segment-names.mts`.

Scheduled/recipe sends resolve recipients as `audience_slug → email_audiences.resend_audience_id → Resend
segment broadcast` (`lib/email/scheduler.ts:308`) — audiences are enumerated from `email_contacts` tags. So a
contact added on `/contacts` can never be picked as a recipe-flow audience. The inverse is also broken:
`/contacts/upload` (linked from "Send weekly") writes `email_contacts`, so those contacts never appear on the
`/contacts` page and can't be blast recipients. Two vCard parsers exist (`lib/contacts/parse-vcard.ts`,
`lib/email/parse-vcard.ts`) with different capabilities and different per-card semantics.

A real compliance gap rides along: a contact who unsubscribes via a blast footer gets
`contacts.unsubscribed = true`, but scheduled sends are Resend segment broadcasts that never consult our flag —
they keep mailing that person.

## Goal (done-when, live proof)

A contact added via `/contacts` (with a tag) appears as a sendable audience member in the lab recipe flow,
live end-to-end; the duplicate vCard-parser path is unified. Bonus hardening: an unsubscribed contact stops
receiving scheduled sends.

## Decisions (operator-approved 2026-07-05)

1. **Canonical store = `public.contacts`.** Richer schema (uuid PK, phone, unsubscribed), and unsubscribe
   links already baked into sent emails carry `contacts.id` uuids — those must keep working. Enumerable
   bigserial ids in an unauthenticated unsubscribe URL would be a downgrade. Rejected: `email_contacts`
   canonical (breaks/remaps live unsub links); two-way sync trigger (permanent drift risk, new subsystem).
2. **Dedupe rule = union tags, non-null wins.** Existing `mergeContact` semantics: tags unioned; an incoming
   non-null name/phone overwrites, null never erases. For the one-time SQL merge the `contacts` row wins ties
   (`name = COALESCE(contacts.name, email_contacts.name)`).

## Evidence (RULE 0.4 — live Resend docs, resend.com/docs/api-reference/contacts, fetched 2026-07-05)

- `unsubscribed` on a Resend contact is **global**: "If set to `true`, the contact will be unsubscribed from
  all Broadcasts."
- `PATCH Update Contact` (`resend.contacts.update`) exists on the current surface; `contacts.create` accepts
  `segments: [{ id }]` (matches the in-repo verification of resend@6.12.3, `lib/email/audience-sync.ts` header).
- `DEL Delete Contact Segment` exists for per-segment removal (not used in v1 — the global flag is stronger).

## What we're building

### 1. Migration (idempotent SQL, run directly per RULE 1)

```sql
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Step 0: normalize email case first. email_contacts emails are already lowercase
-- (normalizeEmail on every write); contacts manual-add stored as-given. Lowercase
-- contacts.email where that doesn't collide; a collision merges by the same
-- union-tags / non-null-wins rule (keep the older row's id — unsub links point at ids).

INSERT INTO public.contacts (user_id, email, name, tags, created_at)
SELECT ec.user_id, ec.email, ec.name, ec.tags, ec.created_at
FROM public.email_contacts ec
ON CONFLICT (user_id, email) DO UPDATE SET
  name = COALESCE(public.contacts.name, EXCLUDED.name),
  tags = (SELECT ARRAY(SELECT DISTINCT unnest(public.contacts.tags || EXCLUDED.tags))),
  updated_at = now();
```

Verify row counts after (RULE 1). `email_contacts` stays in place but becomes unreferenced by prod code;
dropping it is a follow-up check opened at ship time, closed only after live verify. Regenerate
`database-generated.types.ts` so any missed `email_contacts` reference is a compile error.

### 2. One write core — `lib/email/upsert-contacts.ts`

- Retarget `.from("email_contacts")` → `.from("contacts")` (3 call sites in the file).
- Extend `ContactRow`/`ContactRecord`/`prepareContacts`/`mergeContact` with `phone: string | null` under the
  same never-null-an-existing-value rule as `name`.
- Fix the update key cast: `.eq("id", ex.id as number)` → uuid string.
- Lane-A writers (CSV upload route, Google callback, phone route) need no changes — they already call this core.
- Lane-B writers repoint through it: `POST /api/contacts` (single add) and `POST /api/contacts/import` call
  `upsertContacts` instead of their hand-rolled upserts. `lib/contacts/types.ts` `ContactRow` collapses into
  the shared one.

### 3. One vCard parser — `lib/email/parse-vcard.ts` survives

- Add `TEL` capture → `phone` (first TEL per card, matching the retired parser's behavior).
- Delete `lib/contacts/parse-vcard.ts` + `lib/contacts/__tests__/parse-vcard.test.ts`; port distinctive cases
  (TEL, skip-counting with reasons) into `lib/email/__tests__/parse-vcard.test.ts`.
- Parse the vCard `CATEGORIES` property → tags (research 2026-07-05: Apple/Google exports carry the user's
  own contact groups there; both current parsers throw it away — free categorization on every .vcf import).
- `/api/contacts/import` switches to the surviving parser.
- **Behavior change (accepted):** one row per email address — a card with 2 addresses becomes 2 contacts
  (each a legitimate recipient; the work-email filter depends on per-email rows). The retired parser picked a
  single WORK/PREF-preferred address; that preference logic dies with it.

### 4. Contact added anywhere → pickable audience

`/contacts` page fires `POST /api/email/contacts/sync` after a successful add/import — the same call
`app/contacts/upload/UploadForm.tsx` already fires — so tagged contacts materialize as Resend segments +
`email_audiences` rows and show up in the recipe flow's audience picker. Untagged contacts remain
no-audience by design (`enumerateAudiences` decision comment stands).

### 5. Unsubscribe correctness for scheduled sends — `lib/email/audience-sync.ts`

- `readContacts` selects `unsubscribed` too; `enumerateAudiences` (or the store) excludes
  `unsubscribed = true` contacts from segment membership.
- For unsubscribed contacts, best-effort push the **global** Resend flag: `contacts.create({ email,
  unsubscribed: true })` to obtain the id (idempotent on duplicate — verified in-repo), then
  `contacts.update({ id, unsubscribed: true })`. Error-isolated per contact, same as existing sync errors —
  a Resend hiccup never sinks the sync.

### 6. Repoints, not rewrites

- Resend inbound webhook `from`-lookup (`app/api/webhooks/resend/route.ts:214`) → `contacts`.
- `scripts/email/migrate-segment-names.mts` → `contacts`.
- Blast route + `/api/unsubscribe` unchanged — already on `contacts`; they now see lane-A contacts too.
- `/contacts` page and `/contacts/upload` cross-link so the two surfaces stop looking like strangers.

## Testing

- Unit: `upsertContacts` phone merge (non-null wins, null never erases); parser TEL capture + ported cases;
  `enumerateAudiences`/sync unsubscribed-exclusion; existing suites keep passing
  (`lib/email/__tests__/audience-sync.test.ts`, `parse-vcard.test.ts`).
- `bunx next build` (not bare tsc) for the type sweep after regenerating DB types.
- Live proof (operator-run — no paid sends without approval): add a tagged contact on `/contacts` → it appears
  as an audience chip in the recipe flow; close `unify_contact_stores_live_verify` + the standing reconcile
  check on that evidence.

## Phase 2 — sourced intake & auto-grouping roadmap (research 2026-07-05, crawl4ai, all live vendor docs)

Operator directive: find the easiest/best ways to bring contacts in and group them. Findings, ranked by
effort-to-value. None of these are in the current build; they stack cleanly on the unified store because tags
remain the ONE grouping primitive (tags → audiences → recipe flow, already wired).

**P2a — Google contact groups → auto-tags. ZERO new scopes.** `contactGroups.list` and the `memberships`
person field are covered by `contacts.readonly` — the scope our Google import already requests
(developers.google.com/people/api/rest/v1/contactGroups/list: "Requires … contacts or contacts.readonly";
people.connections/list readMask includes `memberships`). The user's own Gmail labels ("Buyers", "Sphere",
"Past Clients") are sitting in the responses we already fetch and get thrown away. Extend the readMask +
one `contactGroups.list` call to resolve group names → import each group as a tag → instant audiences.

**P2b — "People you've emailed" WITHOUT touching Gmail: People API Other contacts.**
`GET people.googleapis.com/v1/otherContacts`, scope `contacts.other.readonly` — "contact info automatically
saved in your 'Other contacts'", i.e. auto-created from interactions (the addresses the user has actually
emailed). Verbatim from Google's restricted-scopes list (support.google.com/cloud/answer/13464325): restricted
= Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient APIs — **no contacts scope is restricted**, so this
is sensitive-tier: same verification lane as the `contacts.readonly` we already ship, no CASA security
assessment, no annual re-verification. Import them under an `emailed` tag → the "people I actually correspond
with" audience the operator asked for.

**P2c — Gmail API itself is a TRAP for this use case.** `gmail.readonly` AND even `gmail.metadata`
(headers-only!) are RESTRICTED scopes (developers.google.com/workspace/gmail/api/auth/scopes) → annual paid
CASA security assessment by a Google-empanelled assessor + annual recertification
(support.google.com/cloud/answer/13465431). P2b delivers the same grouping signal at sensitive tier. Do not
request any gmail.* read scope.

**P2d — CRM lane, easiest first: Follow Up Boss.** The dominant real-estate CRM has a plain REST v1
(`api.followupboss.com/v1/people`) with HTTP **Basic auth via per-user API key** (user pastes their key from
Admin → API; no OAuth app registration to start — docs.followupboss.com/reference/authentication). People
carry tags → map straight onto ours. OAuth exists for a marketplace-grade integration later.

**P2e — Outlook/Microsoft contacts.** Graph `GET /me/contacts`, delegated `Contacts.Read`, works for
personal AND work Microsoft accounts (learn.microsoft.com/en-us/graph/api/user-list-contacts) — far lighter
verification than Google restricted. Second import provider when demand shows.

**P2f — HubSpot: UNRESOLVED.** developers.hubspot.com is bot-walled (anti-bot block on two crawl attempts,
2026-07-05) — needs a follow-up research pass before speccing. Flagged, not guessed.

**Phone status quo confirmed:** Contact Picker API is still experimental / not Baseline (MDN, fetched
2026-07-05) — our Chrome/Android picker + QR-token vCard fallback remains the right architecture; no change.

## Out of scope

- Dropping the `email_contacts` table (follow-up check after live verify).
- Per-segment Resend removal (`DEL Delete Contact Segment`) — the global unsubscribed flag covers v1.
- Merging the `/api/contacts/*` and `/api/email/contacts/*` route namespaces — both keep working against the
  one table; consolidation is cosmetic and can wait.
- Any UI redesign of `/contacts` beyond the sync call + cross-link.
