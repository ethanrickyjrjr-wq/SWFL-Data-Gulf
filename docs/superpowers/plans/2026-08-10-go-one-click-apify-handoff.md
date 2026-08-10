# HANDOFF — /go one-click: any address → email lab → COMPLETED email via Apify

**Written 08/10/2026. Operator decree, verbatim scope:** *"all we are doing is making sure it
works. we don't need ui or words or anything but putting in any address and ending up in email
lab with a completed email from using apify."*

## The one goal

Type ANY address (not just SWFL) into /go, pick one of the 7 lifecycle options, and land in the
email lab with a **finished email** — data filled through the Apify rung, no manual steps, no
popups the user has to answer. That is the entire definition of done. Nothing else.

## DO NOT

- Do NOT touch the page's look or add ANY words. The operator raged twice on 08/10/2026 about
  copy creep ("YOU SAY NOTHING ELSE WRITTEN, BUT THEN WRITE MORE BESIDES WHAT I TOLD YOU",
  "just get rid of swfl data gulf and logo"). The page is: h1 "Address to email in one click."
  + bar + New Listing button + 7 labels. No logo, no company name, no taglines, no blurbs.
  The spec is a CEILING. If a fix seems to need UI, ask first.
- Do NOT touch the main site. /go is chrome-free and self-contained on purpose (it moves to a
  new domain later).
- Do NOT rebuild the Apify lane — it exists (memory: paid-record lane wired; playbook §3.3 has
  the actor inventory + spend guards). The Ohio test already proved ~11/15 cells fill from one
  ~$0.04 pull. This handoff is WIRING + VERIFYING, not building.

## What exists and is verified (08/10/2026, this session, on a production build)

- `app/go/page.tsx` + `components/go/OneClickHero.tsx` — the page. Address autocomplete rides
  the existing `/api/address-suggest` / `/api/address-retrieve` routes (Mapbox Search Box).
- Clicking an option navigates via `heroDestination` (`lib/campaigns.ts`, re-exported from
  `lib/lab-entry/destination.ts` — the ONE root for lab URLs; its param type was loosened to a
  structural subset so any registry recipe rides it). Verified landing URL:
  `/email-lab/grid?recipe=<prompt with address filled>&rkey=<key>&recipeNeeds=…&addr=<address>`.
- The 7 keys, from `lib/deliverable/recipes.ts` (labels never retyped): new-listing,
  coming-soon, open-house, market-comps, price-reduced, under-contract, just-sold.
- /go links STRAIGHT to `/email-lab/grid`, so the params survive for both anonymous and
  signed-in visitors. (The `/email-lab` redirect page's signed-in branch drops `addr` — not
  /go's path, but know it if you reroute.)

## The gap you are closing

The grid lab's arrival treats `recipe`/`rkey`/`addr` as a Make-this handoff — it seeds the
build box. Whether it AUTO-RUNS the build to a finished email, and whether the build's data
fill reaches the Apify rung for a non-SWFL address, is exactly what has to be made true and
proven. Work the arrival path in `app/email-lab/grid` (planArrival / arrival controller) and
the build dispatch (`lib/deliverable/build-doc.ts` → `resolveSubject` → recipe builder).

Sibling doc: `docs/superpowers/specs/2026-08-10-apify-email-storefront-design.md` (the
storefront decree: Stripe + 7 emails through Apify only + basic landing page). This handoff is
the "make it work" slice of that. RULE 0.7a's ladder still governs generally; the decree's
carve-out for this storefront is Apify-only fill so ANY address works.

## The acceptance loop (run it, don't reason about it)

1. `bunx next build` && `bunx next start -p <fresh port>` (check the port isn't owned first).
2. Open /go. Type an address OUTSIDE SWFL (an out-of-region address forces the Apify rung —
   the lake can't answer it). Pick New Listing.
3. PASS = the lab shows a completed New Listing email for that address: photo, specs, price
   cells filled from the Apify record, prose present, no popup blocking, no invented numbers
   (open slots are fine where the record is empty).
4. Repeat for at least one more of the 7 (the decree covers all 7 eventually).
5. Watch spend: one Apify pull per address, behind the existing guards — a build that pulls
   more than once per address is a defect (RULE 0.7a).

## State of the repo at handoff

- Commits on main: 8120baf6 (page + lab-door plumbing), aab70433 (stripped to hero+bar only).
- Note: d705a5c9 (another session's kitchen-sink commit) briefly swept a broken intermediate
  of OneClickHero.tsx; aab70433 supersedes it — the tip is clean and lint/type-checked.
