# Handoff — MLS/RESO live-verified: the pipe already works, it's just uncredentialed

**Date:** 2026-07-14
**Trigger:** Operator asked to find "one solid idx or mls we can eventually pay for, but use right now" — DOM, sales, recent sales, new listings, price cuts, community info, "everything."
**Finding:** We already built this. `lib/reso/` (Phase 1 of `docs/superpowers/plans/2026-06-25-mls-reso-integration.md`) has shipped since 06/25/2026 — client, sync, DB tables, API routes, `/settings/mls` UI, and a purpose-built `/for-agents` public page for the vendor application. It has sat uncredentialed for 19 days. Today's session lived-verified the actual pipe against a real vendor, not just the spec.

---

## What's proven live today (crawl4ai + our own code, not memory)

**Bridge Interactive (`bridgedataoutput.com`) — target for `swfl_mls` board.**

- RESO Web API, Platinum Certified to spec 1.0.2, normalizes to RESO Data Dictionary. Docs verified live: `https://bridgedataoutput.com/docs/platform/Dashboard/registration`.
- **Every new application is auto-granted a Test dataset — no MLS approval, no waiting.** Confirmed by using the actual API Explorer UI (`https://bridgedataoutput.com/docs/explorer`, RESO Web API → `/Property` → API Explorer tab), which ships with a live public token pre-filled: `access_token=6baca547742c6f96a6ff71b138424f21`, `dataset=test`.
- **Ran our actual `lib/reso/client.ts` against it — unmodified, zero code changes:**
  ```
  RESO_BASE_URL_SWFL_MLS="https://api.bridgedataoutput.com/api/v2/OData/test" \
  RESO_TOKEN_SWFL_MLS="6baca547742c6f96a6ff71b138424f21" \
  bun -e "... new ResoClient('swfl_mls').get('Property', {...}) ..."
  ```
  Returned 3 real rows with every field category asked for:
  - **DOM:** `DaysOnMarket: 276, 93, 92`
  - **New listings:** `OnMarketDate`
  - **Price cuts:** `OriginalListPrice` vs `ListPrice` (both present, independently trackable)
  - **Sales/recent sales:** `ClosePrice`, `CloseDate`
  - **Community info:** `SubdivisionName`, `AssociationFee`, `AssociationAmenities` (e.g. `["Pool", "Clubhouse"]`)
  - Values are synthetic placeholders ("exercitationem", "consequatur" — Bridge's own docs warn test data is machine-generated lorem-ipsum-style, not real listings). **This proves the pipe, not real Lee County market data** — that only comes after the actual MLS grants access (below).
- Rate limits: 5,000 req/hr, 334 req/min burst — plenty for our sync cadence.
- Full RESO Property field list (DOM, price history, community, agent/office, media, rooms) confirmed against Trestle's published metadata (same RESO DD standard Bridge normalizes to) at `https://api.cotality.com/trestle/Documentation/MetaData/Resource/Property` — every field category the operator asked for is a real, standard field.

**Trestle / Cotality (formerly CoreLogic) — target for `nabor` board.**

- Same RESO Web API + Data Dictionary standard. Docs live at `https://trestle-documentation.corelogic.com` (old CoreLogic domain still serving current content post-rebrand — verified, not assumed).
- Offers a public sample feed ("provided by Austin Board of Realtors") for exactly this kind of integration testing — but **unlike Bridge, no zero-click public token is published in the static docs.** Getting sample-feed credentials requires the Sign Up wizard: `https://trestle.corelogic.com/SubscriptionWizard`. Free but not zero-friction.
- **Real gap found, not minor:** Trestle authenticates via **OAuth2 `client_credentials` token exchange** (`POST /trestle/oidc/connect/token` with `client_id`/`client_secret` → short-lived bearer token), confirmed live in their Getting Started guide. Our `lib/reso/client.ts` sends a **static long-lived Bearer token** — that's what Bridge's "Server token" model expects, and it is what the 06/25 plan assumed for *both* boards. **It will not work against Trestle as-is.** Needs a small token-exchange step added to `ResoClient` (or a Trestle-specific subclass) before `nabor` can go live — this is implementation work, not done today, and should be scoped before wiring NABOR credentials.

---

## What's NOT verified — flag this honestly

**The `swfl_mls` = Bridge / `nabor` = Trestle board mapping in `lib/reso/boards.ts` is inherited, not independently reconfirmed today.** It traces back to Repliers' own site description (06/25 session, `reference_real-estate-data-source-scan` memory) — a third party's characterization of "Florida Gulf Coast MLS (Lee) + NABOR (Collier)," not each board's own statement of which distribution platform they use. `royalpalmcoastrealtor.com` (the guessed domain for Lee's board) is dead ("This site is no longer available"), and NABOR's own site (`naplesarea.com`) didn't surface a Bridge/Trestle mention on the pages crawled. **Don't skip this** — confirming which platform each board actually runs is literally step 1 of both vendors' own onboarding ("contact the relevant MLS to request an invite"), so it isn't extra work, just don't assume the current `boards.ts` labels are guaranteed correct until the MLS itself confirms it.

## DB / infra state (confirmed live)

- `data_lake.user_mls_listings` and `data_lake.user_mls_stats` tables **exist** (migrations ran at some point after 06/25 — `SELECT count(*) FROM data_lake.user_mls_listings` returns `0`, not an error).
- **Zero RESO/MLS/Bridge/Trestle secrets exist anywhere** — confirmed via `gh secret list`. No `RESO_TOKEN_SWFL_MLS`, `RESO_BASE_URL_SWFL_MLS`, `RESO_TOKEN_NABOR`, `RESO_BASE_URL_NABOR`, no Vercel env either (nothing since 06/25 touched this).
- `app/for-agents/page.tsx` is live in prod (`https://www.swfldatagulf.com/for-agents`) — the exact public link Bridge's vendor application form asks for. Already built, nothing more needed there.

---

## Concrete next steps (in order)

1. **Confirm the board↔vendor mapping directly.** Call or email Lee County's current MLS board (Royal Palm Coast's old domain is dead — find their current name/site first) and NABOR, ask which RESO Web API platform they distribute through (Bridge, Trestle, or something else — MLS Grid and Rapattoni also exist). This is a 2-email task, not research — it's literally the first step of registering with either platform anyway.
2. **Register a Bridge Interactive account now** (`bridgedataoutput.com`) — self-serve, free, auto-grants the Test dataset used above. Link to give them: `https://www.swfldatagulf.com/for-agents`. This is Ricky's action (business identity, ToS acceptance) — not something to automate.
3. **Apply for the real Lee County MLS feed** through the Bridge dashboard once registered (IDX or VOW — VOW gets more fields including off-market/sold data, but has stricter display rules; decide based on what the deliverable actually needs to show).
4. **Same for NABOR** via Trestle's Subscription Wizard — plus the OAuth token-exchange code addition noted above before wiring it live.
5. Once real credentials land: `gh secret set RESO_TOKEN_SWFL_MLS` etc., wire into Vercel env, and `lib/reso/sync.ts` is ready to run (Phase 1 code, untouched).

## Reproduce the live proof

```bash
RESO_BASE_URL_SWFL_MLS="https://api.bridgedataoutput.com/api/v2/OData/test" \
RESO_TOKEN_SWFL_MLS="6baca547742c6f96a6ff71b138424f21" \
bun -e "
const { ResoClient } = await import('./lib/reso/client.ts');
const client = new ResoClient('swfl_mls');
const rows = await client.get('Property', { \$top: '3', \$select: 'ListingKey,ListPrice,OriginalListPrice,ClosePrice,CloseDate,StandardStatus,DaysOnMarket,SubdivisionName,PostalCode,OnMarketDate,AssociationFee,AssociationAmenities' });
console.log(JSON.stringify(rows, null, 2));
"
```

Note: that public token only serves the synthetic `test` dataset — it is not a path to real data and shouldn't be built on for anything beyond integration testing (Bridge's own docs say the same).
