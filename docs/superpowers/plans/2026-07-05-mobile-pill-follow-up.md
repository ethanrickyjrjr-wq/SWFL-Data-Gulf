# Follow-up — after the mobile-pill / address-leak fix push (07/05/2026)

Written post-push per operator instruction ("ship small and write the follow up after push").
This is a brief, not a status board — open obligations live in `checks`.

## What just shipped (0c8cad9e + 963ddd19, on origin/main)

1. Phone: the AI + Briefcase pill never auto-opens under 640px (desktop funnel pop unchanged);
   the open sheet has an always-visible grabber + X close and Escape; cap 55vh.
2. A bare street address typed into /ask (including the map search's `?q=` handoff) or the
   public pill chat routes into the campaign-build flow (`heroDestination`, inherits the
   address-spine `addr=` comps enrichment). Questions ABOUT an address still go to the chat
   engine (comp helper intact). Project-context chat untouched.
3. `AnswerText` strips markdown markers at the one shared render root — `**` can never ship raw.

## Operator's 2-minute prod verify (closes `mobile_pill_address_leak_live_verify`)

On the phone, after Vercel deploys, in a fresh/private tab:
1. Load swfldatagulf.com — the page should be fully visible, only the small pill bottom-right.
2. Tap the pill — sheet opens to ~half screen with an X top-right; X and Escape both close it.
3. Type a bare Lee/Collier address into the map-section search (below the fold) — should land
   in the email lab prebuilt (with the address-spine comps in the figure menu), never a chat answer.
4. Ask the pill chat something normal ("what's the bottom line on SWFL right now?") — answer
   should render with no `**` asterisks.
Close: `node scripts/check.mjs close mobile_pill_address_leak_live_verify`
Also still open from the parallel session: `address_spine_live_verify` (its own prod check).

## Ladder state (spec: 2026-07-05-agent-first-homepage-design.md)

- Build 1 (hero + chips + zip-seed): LIVE on prod, `agent_first_homepage_live_verify` open.
- Build 2 (address spine — comps in the one lake feed): PUSHED by the parallel session
  (3a10aa97..e413af6e), `address_spine_live_verify` open.
- This fix build: PUSHED (see above).
- **Build 3 — lifecycle sequences — is next and unstarted.** One listing campaign fires
  coming-soon → new-listing → comps → under-contract → just-sold on milestones; the
  single-cadence scheduler stays the primitive (closes G4). Per the ladder rule it starts
  with its own brainstorm + spec + check (`node scripts/new-build.mjs`), and must respect
  the locked never-batch rule (project_new-listing-lifecycle-project: a house can sell in a
  day — set up the gameplan, generate per event). Build 2 of the lifecycle decomposition
  (grounded just-sold email, spec 2026-07-01-sold-email-builder-design.md) likely folds in —
  reconcile the two ladders in that brainstorm.
- Build 4 (send hardening: Resend Idempotency-Key dual-layer, send-history, recipient ledger)
  is independent of 3 and small — a good parallel-session candidate.

## Residuals accepted (no action queued)

- Hero.tsx map search still *routes* addresses via `/ask?q=` (file was claimed by the spine
  session mid-build); the AskPage redirect covers it transitively, so user-visible behavior is
  correct. Optional cosmetic: short-circuit in `submitSearch` later to skip the /ask flash.
- Streaming answers may show `**` transiently until the closing marker arrives, then clean up.
- Deploy-window confusion caused the operator's first bad screenshot (old hero serving 2–8 min
  after push). If it recurs, consider a deploy-status badge on /littlebird rather than any
  change to the site itself.
