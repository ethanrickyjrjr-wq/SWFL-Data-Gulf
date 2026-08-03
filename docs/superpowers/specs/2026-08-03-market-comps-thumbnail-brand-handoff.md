# HANDOFF — market-comps quality pass (thumbnails, subject-line, comp-correctness) + one open bug

Written 08/03/2026, end of a Sonnet session, for whoever picks this up next (Opus). Operator is
tired and frustrated tonight — read the whole thing before touching code, don't re-derive what's
already below, and don't re-litigate decisions that are already made and tested.

## What the operator actually asked for, across the session

1. crawl4ai research (4-agent fan-out) on real estate email best practices → filed at
   `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md`,
   indexed in `_RESEARCH/INDEX.md`. Read that file before doing any more email-design work — it's
   the actual source for every design decision below, not vibes.
2. "Advise for highest value build and code it... make it so builder can build and send to
   hello@swfldatagulf.com" → built a deterministic subject-line composer and proved a real
   market-comps send end-to-end.
3. After the operator looked at what shipped: a real quality pass — brand colors, property photo,
   comp thumbnails, comp correctness (self-referencing comp, stale sales).

## STATUS: uncommitted work sitting in the working tree right now

```
git status --porcelain
 M lib/deliverable/recipes/market-comps.ts
 M lib/email/blocks/ListBlock.tsx
 M lib/email/doc/schema.ts
 M lib/email/doc/types.ts
 M lib/pdf/email-doc-pdf.tsx
```

None of this is committed. All tests pass (656 pass / 0 fail across `lib/deliverable/recipes/` +
`lib/email/blocks/`, last run this session) and `bun run build` succeeded clean earlier in the
session (before these 5 files' latest edits — re-run it before committing). **Commit these 5 files
explicitly by path — never `git add -A`** — there is a genuinely unrelated foreign change sitting in
the tree too (see "Parallel session" below).

### Separately, already committed by a PARALLEL session (not this one)

Commit `d0f55e5b`, ~28 min before this handoff was written: "feat(subject-lines): add
deterministic subject line functions for new listings, market comps, price reductions, and market
pulse" — this is the subject-line work from ask #2 above (`lib/deliverable/recipes/subject-lines.ts`
+ wiring into `new-listing.ts`/`market-comps.ts`/`price-reduced.ts`/`market-pulse.ts`). It landed
correctly; nothing to redo. This explains why the operator said "other claude just sent me 3
fucking emails" mid-session — a different session was running against the same working directory
and picked up/sent using this same code. **Two sessions were live in the same repo dir tonight, not
a worktree.** If you see anything else surprising in git log, that's why.

### ALSO found, NOT mine, NOT touched, status unknown

`lib/deliverable/recipes/index.ts` has 2 uncommitted lines (import + `RECIPE_BUILDERS` registration
for a `listings-showcase` recipe), and `lib/deliverable/recipes/listings-showcase.ts` +
`.test.ts` are untracked. `RECIPE_KEYS` in `recipes.ts` already lists `"listings-showcase"` as
committed (message: "Distilled from a real Zillow send... found 08/03/2026"). This is presumably
the SAME parallel session's in-progress work, just not committed yet as of this writing. **Do not
commit these as part of your work** unless the operator confirms they're finished and his — check
with him or check git log again before touching.

## What shipped and is proven working (real evidence, not claims)

### 1. Deterministic subject lines (committed, d0f55e5b)
`lib/deliverable/recipes/subject-lines.ts` — no LLM, ever; distilled from the crawl4ai research
Part B (30-40 char target, never the word "Newsletter", local specificity required). Wired into
`new-listing.ts`, `market-comps.ts`, `price-reduced.ts`, `market-pulse.ts` via `subjectVariants`.
Proven live: a real market-comps build for 326 Shore Dr, Fort Myers came back with subject
`"326 Shore Dr — is the price right?"`.

### 2. Real comp thumbnails (uncommitted, this session)
New optional fields `ListItem.imageUrl` / `ListItem.imageAlt` (`lib/email/doc/types.ts` +
`lib/email/doc/schema.ts`), rendered as a 56×56 (email) / 28×28 (PDF) thumbnail to the LEFT of each
row — across all THREE render engines (`lib/email/blocks/ListBlock.tsx` is the ONE shared component
for both email engines via `BlockRenderer.tsx`; `lib/pdf/email-doc-pdf.tsx`'s own `case "list":` is
separate and was edited too — emails.md's own rule: any block-style change touches all three).

Source of the thumbnail: `resolveCompThumbnails()` in `market-comps.ts` — geocodes each comp's
address (`lib/geo/geocode-address.ts`, the SAME geocoder the subject already uses) and builds a
Mapbox aerial URL (`lib/listings/aerial.ts`'s `aerialUrl()` — a PURE URL builder, no fetch, already
used elsewhere in the product as a listing-photo fallback). REAL, sourced, licensed imagery — never
invented. Best-effort per comp: a geocode miss just means that one row ships with no thumbnail
(open-slot pattern), never blocks the build. Verified live: all 6 comp rows on the 326 Shore Dr
build came back `thumb=YES`.

### 3. Real brand + real subject photo (traced, partially fixed — see OPEN BUG below)
First build used `defaultDoc()` (blank/neutral seed) → shipped the gold `#B98F45` fallback instead
of the operator's real teal `#3DC9C0`, and the resolved address (16447 Rainbow Meadows Ct) came
back with no `facts.photos`. Second build switched to a verified-photo address (326 Shore Dr, Fort
Myers 33905 — per `new-listing.ts`'s own comment: "LIVE PROOF 07/13/2026... with the real photo")
and seeded from the operator's real branded doc (deliverable id
`eb4d3793-38e4-4f65-8e7d-218aa7ececfa`, accent `#3DC9C0`, logo `swfldatagulf.com/logo-mark.png`,
company "Ricky Cooper" — read off his `campaign-sim` project's past deliverables, since
`brand_profiles` table is `null` for his UID and brand is carried STICKY off the canvas, not a
separate profile row). Subject photo now resolves correctly (real mirrored Supabase-hosted URL).
**Brand color did NOT carry through — see below, this is the one open bug.**

### 4. Comp correctness — TWO real data bugs found and fixed (uncommitted, this session)
Both in `market-comps.ts`, both operator-flagged live from a real sent email:

- **The subject was appearing as its own comp.** The first sent email (16447 Rainbow Meadows Ct)
  listed "16447 Rainbow Meadows Ct" itself in its own comps table, citing a 2017 sale — the
  vendor's `/nearby-home-values` candidate set can include the subject house. Fixed:
  `isNotSubjectAddress()` — normalized street-line exact match, excludes the subject from its own
  comp set. Exported, tested.
- **Stale sales.** Operator: "comps can't be from more than 6 months to a year ago." Fixed:
  `isFreshSale()` — 365-day cutoff, but ONLY on rows already tagged `priceKind === "sold"` (a real
  day-precision date from the per-comp `fetchSold()` enrichment call, NOT the vendor AVM's
  `estimateDate`). Valuations and undated sales are never touched by this filter. Verified live: a
  05/23/2025 sale (14 months old) was correctly dropped from the second build; the 08/29/2025 sale
  (~11 months, within the 365-day window) was correctly kept.

**Read `docs/standards/data-roots.md` T9/T10 before touching comp sourcing again.** There is a
SEPARATE, more rigorous comp root — `lee_comp_sales_v` — with real measured recency stats (17,859
sales trailing 12mo, 8,999 trailing 6mo, Lee-only, RESIDENTIAL only) that `market-comps.ts` does
NOT use. It pulls from SteadyAPI `/nearby-home-values` + a per-comp `fetchSold()` call instead. T9's
hard rule: **never map the vendor AVM's `estimateDate` into a sale date** — my `isFreshSale()` fix
is clean against that rule (guards on `priceKind === "sold"` specifically), but it's a filter on top
of the WEAKER of two comp sources, not a switch to the catalogued stronger one. Whether to swap
`market-comps.ts` onto `lee_comp_sales_v` entirely is a real, bigger, NOT-yet-scoped decision —
flagged to the operator, not decided.

## THE ONE OPEN BUG — accent color not carrying through (priority #1 for you)

Symptom: fed `authorDoc()` a `rawDoc` whose `globalStyle.accentColor` is `#3DC9C0` (verified by
logging it right before the call). The BUILT doc that comes back has `globalStyle.accentColor` =
`#B98F45` (the recipe's own hardcoded fallback — `lib/deliverable/recipes/market-comps.ts`:
`const accent = doc.globalStyle.accentColor || "#B98F45";`). So somewhere between `authorDoc()`
receiving the rawDoc and `buildMarketComps()` reading `ctx.currentDoc.globalStyle.accentColor`, the
value is getting lost.

What's already ruled out / traced (don't redo this):
- `authorDoc()` (`lib/email/build-doc.ts:1116-1122`): `const docParsed = EmailDocSchema.safeParse(rawDoc); const currentDoc = docParsed.data;` — this is a straight schema parse, `globalStyle` is a real schema field, should pass through unchanged. Confirmed the SEED doc itself (fetched fresh from Supabase right before the `authorDoc` call) has the correct `#3DC9C0` — so the seed is right, the loss happens somewhere AFTER this point.
- NOT yet checked: whether `market-comps` recipe dispatch takes a DIFFERENT path than the generic
  `finish()` tail (`build-doc.ts` line ~1127) for an address-spine recipe — i.e. does
  `resolveSubject`/the recipe-key branch construct its own `currentDoc` variant that doesn't
  inherit `docParsed.data.globalStyle`? Search `build-doc.ts` for how `RecipeBuildContext.currentDoc`
  actually gets assigned for the KEYED recipe branch (not the terminal default-grid fallback) — that
  assignment is the next thing to find. Also check whether `applyBrand` (client-side overlay, runs
  AFTER authoring per `docs/standards/emails.md` §2.10) is somehow involved — but this bug shows up
  in the SERVER-SIDE authored doc before any client overlay runs, so `applyBrand` is probably not
  it, but confirm.
- Reproduction is cheap: any one-off script that calls `authorDoc({prompt, rawDoc: <a doc with a
  non-default accentColor>, scope, assets: []})` and logs `payload.doc.globalStyle.accentColor`
  reproduces it in about 10 seconds. The two test scripts used this session
  (`tmp-hello-market-comps-send.mts`, `tmp-hello-market-comps-v2.mts`) were both deleted per repo
  convention ("LOCAL ONLY — never commit, delete after use") — recreate a minimal repro from
  scratch rather than looking for them.

## Real evidence from this session (verify these are still true, don't just trust the log)

- Resend send ids: `2ad7c5a4-b0ee-4f62-8feb-a07d564df143` (hello@swfldatagulf.com, first build,
  Rainbow Meadows Ct — this is the one that revealed the self-comp bug), `bda2a6f7-54f0-4c73-83cb-5eb0fea9395c`
  (diagnostic re-send to ethanrickyjrjr@gmail.com, same build), `b6cceb6c-59a5-4ee3-9800-bcca0c08fce9`
  (corrected build, 326 Shore Dr, real photo + real thumbnails + fixed comps, sent to
  ethanrickyjrjr@gmail.com). **A Resend "sent" response only proves outbound dispatch, never
  receipt** — the operator confirmed the ethanrickyjrjr@gmail.com sends landed; hello@swfldatagulf.com
  receipt was never independently confirmed.
- `hello@swfldatagulf.com`'s MX records point to Cloudflare Email Routing (route1/2/3.mx.cloudflare.net)
  — that service needs an explicit per-address rule or an enabled catch-all to deliver inbound mail
  anywhere. This was flagged as the likely reason a send to hello@ might not surface anywhere
  visible; never independently confirmed one way or the other (Resend API key in `.env.local` is
  send-only restricted, can't pull delivery/bounce events).
- Deliverable rows saved this session (all under the operator's UID `37cc6c49-4759-4e07-9686-0a8dcce1f8ff`,
  project `1b35a795-e06`): `55da0f70-a888-461a-9cc9-56f3c3062b80` (Rainbow Meadows Ct, has the
  self-comp bug — don't use as a good example), `8455236e-6332-4592-a2f1-4ad093a4b283` (326 Shore
  Dr, thumbnails added, comps NOT yet fixed), `a368dc5c-fd76-4307-8e64-23318a4c24a5` (326 Shore Dr,
  fully corrected — comps fixed, this is the one that was actually sent as `b6cceb6c-...`).

## Immediate next steps, in priority order

1. **Chase the accent-color bug** (see above) — this is the one thing the operator asked about
   twice and didn't get a real fix on tonight.
2. **Re-run `bun run build` + the full recipe/blocks test suite** before committing the 5
   uncommitted files (tests were last green at 656/656, but that was before the LAST edit pass —
   verify fresh).
3. **Commit the 5 files explicitly by path** (`git add lib/deliverable/recipes/market-comps.ts
   lib/email/blocks/ListBlock.tsx lib/email/doc/schema.ts lib/email/doc/types.ts
   lib/pdf/email-doc-pdf.tsx`) — never a broad `add`, the `listings-showcase`/`index.ts` foreign
   changes are sitting right there.
4. **Decide, with the operator, whether `market-comps.ts` should move onto `lee_comp_sales_v`**
   (the catalogued, more rigorous comp root — data-roots.md T9/T10) instead of the current
   SteadyAPI `/nearby-home-values` + `fetchSold()` path. Not decided, not scoped, don't just do it.
5. **SESSION_LOG.md entry is still owed** before any push (root CLAUDE.md RULE 0) — none of this
   session's work has been logged there yet.
