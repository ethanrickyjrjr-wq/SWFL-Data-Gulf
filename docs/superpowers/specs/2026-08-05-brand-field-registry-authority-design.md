# Brand field registry is the ONE authority — facets on the spec, 16 hand-lists collapsed

> **Recommended model:** ⚡ Sonnet — keywords: migration, schema




**Date:** 2026-08-05
**Check:** `brand_field_registry_authority_live_verify`
**Related check:** `brand_fields_lost_account_to_project` (the defect this build closes)
**Predecessor spec:** `docs/superpowers/specs/2026-07-16-brand-fill-once-design.md` (§A created the registry)

---

## Problem

We already build one thing as a field, and it works. `lib/brand/profile-ledger.ts` holds 31 typed
specs (`key` / `label` / `tier` / `askCopy` / `typable`) and every consumer *derives* its view —
`profileGaps()`, `typableProfileGaps()`, `completenessSummary()`, `MUST_KEYS`, `PREFILL_KEYS`. Its
own header states the contract: "Nothing keeps its own list; that is how the surfaces stop
disagreeing about what has already been answered."

Everything around it still hand-lists columns.

### Counted, not estimated (08/05/2026)

**Live schema probe** (`information_schema`, `public.user_brand_profiles`): **42 columns**, of which
**38 are field columns** (excluding `id` / `user_id` / `created_at` / `updated_at`).
**The registry knows 31. `applyUserBrandToProject` carries 14.**
So **24 of 38 columns structurally cannot cross from account to project.**

Keep this apart from the number in the sibling check: 17 is how many *filled* fields were dropped
for the one account measured 08/05/2026. 24 of 38 is the schema-wide structural number. Both are
true; blending them is the shape RULE 0.8 exists to stop.

**16 hand-written key lists across 5 production files**, against 1 registry:

- `app/api/user/brand/route.ts` — 7: `AGENT_FIELDS` (7 keys), `COLOR_FIELDS` (7), `FONT_FIELDS` (2),
  `PREFERENCE_FIELDS` (2), `SOCIAL_FIELDS` (9), `CONTACT_FIELDS` (4), `BASE_SELECT` (composes the
  six above plus `BRAND_DESTINATIONS_KEY` — derived from them, but from them, not from the registry)
- `components/brand/BrandingBlock.tsx` — 5: `AGENT_FIELDS` (5), `CONTACT_FIELDS` (4), `MEDIA_FIELDS`
  (2), `FONT_FIELDS` (2), `SURFACE_FIELDS` (2). Each carries its own `label`, duplicating the
  registry's `label`. (The palette slots already derive from `PALETTE_SLOT_KEYS` — that one is
  correct and is the pattern to copy.)
- `lib/project/apply-brand.ts` — 2: the `.select(...)` string in `defaultAgentLookup` (11 keys) and
  the `branding` object literal (14 keys). **This is the pair that drops 24 columns.**
- `lib/email/templates/resolve-brand.ts` — 1: `.select("primary_color, accent_color, logo_url")`
- `lib/showcase/recipe.ts` — 1: the `BrandNeed` union (4 keys)

Plus a **17th list inside `lib/brand/profile-ledger.test.ts`** — a hand-copied 31-key `apiKeys`
array. **This is the correction that changes the design.** The test's comment claims it makes the
ledger authoritative ("If the API grows a field, this test forces the ledger to grow with it"). It
does not. It is a third copy of the same list; the guard only fires if someone remembers to update
the copy. The route and the registry are in sync *today* (31 = 31, test green) by maintenance, not
by construction.

### The gap underneath the drift: nothing distinguishes a field from a column

The 7 unregistered columns are not a uniform miss. Types probed live:

- `company_name` (text) — a real brand field, but owned by the **prospect-enrichment lane**
  (`lib/prospects/enrich-brand.ts` → `lib/claim/claim-store.ts` → `app/api/prospect/open-project`),
  deliberately dropped by `app/api/claim/route.ts` because it feeds the project TITLE. Not editable
  in the Brand panel, by design.
- `sender_address`, `sender_name` (text), `sender_domain_verified` (boolean) — **sending identity
  and its verification state**, read by `app/api/email/deliverability-status`. Not agent brand.
- `color_palettes`, `button_destinations` (jsonb) — structured, each already handled by its own root
  (`sanitizePalettes`, `lib/email/button-destinations.ts`).
- `source` (text) — provenance metadata.

Registering these naively **breaks the registry**: `isBlank()` is `typeof v !== "string"`, so a
boolean or jsonb key would count as a permanent gap, corrupting the `filled` / `total` the Brand
panel strip shows and making `profileGaps()` ask a popup to collect a jsonb blob.

So the registry carries an unwritten contract — *"a nullable text column a human types"* — that
nothing expresses or enforces. That is the real defect. The missing keys are a symptom.

---

## Goal

Make `profile-ledger.ts` the **single derivable authority** for brand fields, such that:

1. A new brand field is added in **exactly one place** and every surface picks it up — the API
   allowlist, the GET select, the Brand panel inputs, and the account→project copy.
2. The account→project copy carries **every field that should carry**, decided by a declared facet
   on the spec — never by a hand-maintained literal.
3. A column that is **not** a field (state, metadata, structured-with-its-own-root) is declared as
   such and stays out, instead of being silently absent.

**Non-goal:** carrying all 38 columns. `source` and `sender_domain_verified` must NOT copy to a
project. "Carry everything" is the wrong fix and would ship a new defect.

---

## What we're building

### A. Facets on `ProfileFieldSpec` (extend the existing artifact — RULE 3 C2)

Three new declared facets. No new gate object, no new mandatory pre-materialization step; this makes
an existing registry authoritative, which C2 permits and in fact prefers.

- `valueType: "text" | "url" | "color" | "enum" | "upload"` — replaces the implicit
  "everything is a nullable string" assumption. `isBlank()` and `profileGaps()` consult it, so a
  non-text field can never be scored as a typable gap. (`typable` becomes derivable from this and
  should be kept only as a deprecated alias during the migration, then deleted.)
- `carriesToProject: boolean` — the account→project copy set. True for the 31 registered fields;
  the facet exists so `sender_domain_verified`-class columns can be registered as fields WITHOUT
  copying, once anyone wants them registered.
- `owner: "brand-editor" | "prospect-enrichment" | "sending-identity" | "derived"` — which lane
  writes it. Determines whether it appears in the Brand panel and the account API allowlist.
  `company_name` becomes registerable and honest for the first time (`owner:
  "prospect-enrichment"`, so it carries to a project but never renders an editor input).

### B. Derivations that replace the 16 lists

Each is a pure function over `PROFILE_FIELDS`, exported from the ledger (client-safe, as today):

- `accountApiKeys()` → replaces the 6 arrays in `app/api/user/brand/route.ts`.
  `BASE_SELECT` becomes `accountApiKeys().join(", ")` plus the two jsonb roots it already appends.
- `brandPanelGroups()` → replaces the 5 arrays in `BrandingBlock.tsx`, carrying key + label +
  group, with labels read from the registry so panel and popup can never disagree.
- `projectCarryKeys()` → replaces BOTH lists in `apply-brand.ts`: the `.select()` string AND the
  `branding` object, which becomes a loop over the filtered set.
- `themeKeys()` → `resolve-brand.ts` keeps its narrow 3-key read, but derives it rather than
  spelling it.
- `lib/showcase/recipe.ts` already reads labels via `profileFieldSpec()`; its `BrandNeed` union
  narrows to `MUST_KEYS` + `photo_url` derived from the registry rather than re-typed.

### C. The test copy is deleted, not maintained

`profile-ledger.test.ts`'s `apiKeys` array is removed. Once the route derives from the registry, a
test asserting they match is asserting `x === x`. Replaced by the schema-parity test in D.

### D. The guard that actually catches the next drift: schema parity

A test that reads the **live column list** for `public.user_brand_profiles` and asserts every column
is either registered in `PROFILE_FIELDS` or present in an explicit `NON_FIELD_COLUMNS` set with a
one-line reason. A new column added by a migration fails the suite until someone classifies it.

This is the piece none of the 17 lists ever had: today a migration can add a column and **nothing
anywhere notices**. That is exactly how 7 columns ended up outside the registry.

Runs against the live DB, so it follows the existing bun-test env convention (see
`project_factuality-ci-gate-and-bun-test-env` — `bun test` skips `.env.local`); if the connection is
absent the test must **skip loudly**, never silently pass.

---

## Failure modes, each with the guard that stops it (RULE 3.5, locked 07/20/2026)

1. **A non-text field is registered and scored as a permanent gap.** The Brand panel shows
   "28 of 33" forever and a popup asks the user to type a jsonb blob.
   *Guard:* `valueType` is required on every spec (no default); `profileGaps()` filters to
   collectible types; unit test asserts a `boolean`/`jsonb` field never appears in
   `typableProfileGaps()` and never decrements `completenessSummary().filled`.

2. **`carriesToProject` is set true on sending-identity or provenance state**, and a project's
   branding blob starts carrying `source` / `sender_domain_verified` into rendered emails.
   *Guard:* test pins the exact carry set by key; `owner: "sending-identity" | "derived"` with
   `carriesToProject: true` is a type-level error (discriminated union), not a review catch.

3. **The account→project copy silently narrows again** because someone edits the derivation and
   the only proof is a green suite of tests that never asserted the count.
   *Guard:* a test asserting `projectCarryKeys().length` equals the registry's carry-flagged count
   AND that `applyUserBrandToProject` writes every one of them, driven from the registry — so
   adding a field to the registry automatically extends the assertion.

4. **A migration adds a column and nothing notices** (the failure that produced this build).
   *Guard:* the schema-parity test in D. Fails on any unclassified column.

5. **The parity test can't reach the DB in CI and silently passes**, restoring the invisible drift.
   *Guard:* explicit skip-with-reason that fails the suite when the env var is set but the
   connection errors; never a bare `try/catch` returning green. (Named because this repo has the
   exact scar — `feedback_checks-prod-evidence-not-dev-attestation`, and the masked-exit-code
   incident logged 08/05/2026.)

6. **The Brand panel loses a field's editor input** when its 5 hand-built groups are replaced by a
   derived grouping — a field with no group falls off the page and becomes uneditable.
   *Guard:* `brandPanelGroups()` is exhaustive over `owner: "brand-editor"` fields; a test asserts
   every brand-editor field lands in exactly one group, and a render test asserts the input count
   matches. Uneditable-but-registered is worse than the current state and must fail loudly.

7. **`company_name` starts rendering as an agent-editable field** once registered, letting a user
   overwrite the enrichment-derived project title.
   *Guard:* `owner: "prospect-enrichment"` is excluded from `brandPanelGroups()` and from
   `accountApiKeys()` (the PATCH allowlist) by construction; test asserts it is absent from both.

8. **A green suite is mistaken for a rendered proof.** Every failure above is logic; none of them
   prove a real email carries the brand.
   *Guard:* the build is not done until `scripts/email/render-coming-soon.mts` is re-run against the
   real account and the per-cell provenance table shows the socials/fonts/unsubscribe URL arriving.
   This is `feedback_render-and-look-before-calling-it-done` applied as an acceptance gate, not a
   suggestion.

10. **THE BIG ONE — someone "tightens" the edit path to the registry and kills freeform editing.**
    Today `lib/deliverable/edit-plan.ts` types branding as `Record<string, unknown>` — an open bag —
    and `projects.branding` is jsonb. That is deliberate: `lib/brand/bank-brand-fields.ts` states
    "deliberate per-project divergence stays local." Once an authoritative registry exists, the
    obvious-looking next move is to validate edited branding against it. That would convert a
    registry that *decides what gets copied* into a registry that *decides what a value may be*, and
    it would break the grid builder and per-project overrides.
    *Guard:* the registry governs THREE things only — the account PATCH allowlist, which inputs the
    Brand panel renders, and the account→project carry set. It never validates
    `projects.branding` or deliverable branding. Stated here, restated as a comment in the ledger
    header, and pinned by a test asserting an unknown key survives a round-trip through
    `edit-plan.ts` unchanged. Live-verified 08/05/2026: 11 projects carry a non-empty branding blob
    with 14 distinct keys, **zero of them outside the registry** — so no freeform key is in use
    today, which is exactly why this guard has to be written down before someone concludes freeform
    isn't needed. **And the guard has teeth: of those 11 projects, 9 hold a branding value that
    DIFFERS from the account profile** — `agent_name` diverges on 9, `primary_color` on 7,
    `accent_color` on 7 (live 08/05/2026). Per-project divergence is the majority case in
    production, not a theoretical allowance. Anything that validated or re-synced project branding
    against the account registry would stomp 9 of 11 live projects. The predecessor spec already
    ruled on this — "Full two-way sync was considered and REJECTED (kills legitimate per-project
    variants)" — and this build does not reopen it.

11. **Deliverable cells get assumed into this build.** The email playbook uses the same "cell"
   vocabulary, and it would read as complete to fold them in.
   *Guard:* explicitly out of scope below, with its own follow-up check. Do not touch
   `lib/deliverable/` in this build.

---

## TDD order (RULE 3.5 — mandatory once failure modes are approved)

Each test named for the failure mode it targets, written failing first:

1. `valueType gates collectibility — a non-text field is never a typable gap` (FM 1)
2. `valueType — a non-text field does not decrement completeness` (FM 1)
3. `carry set excludes sending-identity and provenance owners` (FM 2)
4. `applyUserBrandToProject writes every carry-flagged registry key` (FM 3)
5. `schema parity — every live column is registered or explicitly classified` (FM 4)
6. `schema parity skips loudly, never silently, without a connection` (FM 5)
7. `every brand-editor field lands in exactly one panel group` (FM 6)
8. `company_name is absent from the PATCH allowlist and the panel` (FM 7)
9. `an unknown branding key survives edit-plan round-trip unchanged — the registry never validates
   an edit` (FM 10)

---

## Out of scope (named so nobody reports this as finished)

- **Deliverable cells.** The per-cell source ladder is explicitly NOT tracked
  (`docs/standards/email-build-playbook.md` line 153) and `deliverable_build_manifest` is a separate
  unbuilt build. Brand fields have a registry with drift around it; deliverable cells have the
  vocabulary and no registry object at all. That is a second spec, not this one. **Open a check
  before this build lands** (RULE 2.4 — no silent deferrals).
- **Registering the 6 non-field columns as fields.** This build classifies them; it does not move
  them.
- **`applybrand_no_server_side_caller`** (open check, 15d untouched): `applyBrand` is browser-only,
  so non-Lab send paths ship unbranded. A registry fix does not touch that path, and closing this
  build must not be read as closing that one.

---

## Evidence trail

- Live schema probe of `public.user_brand_profiles` (42 columns / 38 field columns / 7 unregistered,
  with pg types) — run 08/05/2026 via `Bun.SQL` against the credentials in `.dlt/secrets.toml`.
- Tree-wide grep for `from("user_brand_profiles")` and for the key-list literals — 16 production
  lists across 5 files, plus the test copy.
- `_RESEARCH/competitor-and-strategy/2026-08-02-claydotcom-app-drive.md` — "one primitive, one gate
  surface": every guard built once on the field primitive and inherited, versus bolted on per
  surface. Read for the pattern, filtered through RULE 11: we are adopting the *derivation*
  discipline, not a credit economy or a column marketplace.
- `docs/standards/data-roots.md` — one root per concept, applied here to fields instead of tables.
