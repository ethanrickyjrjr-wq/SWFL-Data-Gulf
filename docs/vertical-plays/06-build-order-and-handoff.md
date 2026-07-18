# Build order & handoff — the non-RE monetization sweep

**Written 07/18/2026. For any Claude taking over one of these builds.** Companion to
`05-non-re-monetization-sweep-2026-07-18.md` (the 10 fully-planned, adversarially-verified
candidates). That doc is the *what* and the *how*; this doc is the *in what order, and why*.

Scope: the operator's three top picks from the sweep — **#1 SIRS/Milestone Compliance-Gap Radar**,
**#2 Appraiser/Inspector Cross-Check (UAD 3.6 wedge)**, **#3 Trade-Area Reality Check** — plus **#6
DBPR CAM Direct-Mail Channel**, which the sweep flags as #1's reach arm. The other six sweep ideas
(#4 bank feed, #5 advisor report, #7 vessel watch, #8 civic digest, #9 grounding-gate API, #10 STR
compass) are real but out of this handoff's scope — pick them up from `05-…` directly if a session
turns to them.

---

## The one thing that changes the order

Every play here shares the **same dominant risk: nobody has paid yet.** #1's three buyer prices are
self-labeled "unsourced hypotheses." #2's addressable market is ~1,014 SWFL licensees with a
"low-five-figures/mo ceiling at full capture," and its only scalable lane (licensing to a
forms-software vendor / AMC) is unproven. #3's WTP is "adjacent, not product-specific" — a real
price band on a *different* (demographics-only) competitor, not proven demand from Lee/Collier
lessees.

So the sequencing axis is **cheapest demand-validation first, not cheapest build first.** Build the
thing that tells us someone will pay before building the thing that costs money to run.

This also matches the operator's stated posture from 07/17 (`memory: project_strategy-trust-low-point-2026-07-17`):
**credibility — landing pages, tracked outcomes — before any new feature pitch.** These four are
*non-RE* bets; the operator's floated lane on 07/17 was seller/buyer-side RE. Name that tension out
loud with the operator before committing engineering weeks here. This handoff is a plan for *if we go*,
not an argument that we should.

---

## Prerequisites — settle these before ANY build

1. **Rotate the exposed credentials FIRST.** The 07/18 36-agent run left a plaintext copy of the
   entire `.env.local` on disk (`/tmp/noai.env`, since deleted) — Stripe **live** secret key, a GitHub
   PAT with push-to-`main`, the Supabase service-role key + Postgres password, and ~20 more. Files are
   gone but copies may predate the sweep. **No Stripe/payment surface (#3, #1's paid report) ships
   until at minimum the Stripe key, the GitHub PAT, and the Supabase service-role/Postgres password
   are rotated.** This is urgent independent of any build. See
   `docs/steadyapi-research/2026-07-18-non-re-vertical-sweep-and-security-incident.md`.

2. **The verify queue is already saturated.** `_AUDIT_AND_ROADMAP/build-queue.md` is a wall of `[~]`
   BUILT-but-awaiting-operator-live-verify items (Brand fill-once, per-listing DOM, Hub mission
   control, factuality gate, and ~15 more). These four are *new* bets competing for the same scarce
   operator-verification bandwidth. An honest handoff says: adding more BUILT-not-verified work has a
   real cost. Prefer probes that need *no* operator verification to learn something (Stage 1 below).

3. **Register at pickup, brainstorm at pickup.** Each build, when a session actually starts it:
   `node scripts/new-build.mjs <slug> "<label>"` (RULE 3.5) and a `superpowers:brainstorming` pass
   with a crawl4ai research round (RULE 0.4). The `05-…` plan is a *hypothesis*, not authority —
   re-verify its vendor-surface claims live before writing code (RULE 0).

---

## The order

### Stage 1 — cheap demand probes (build ~nothing, learn WTP). Do these first, in parallel.

**1a. #1 SIRS core pack + free "look up your building" funnel.**
The core is a join of two tables **already in the lake** (`data_lake.dbpr_sirs_submissions` ×
`data_lake.parcel_subdivision`) — genuinely near-zero new ingest. Ship the `PackDefinition` modeled on
`refinery/packs/condo-sirs-swfl.mts` plus a free, no-login "look up your building/association" web
funnel (reuse Geo Resolution + Claim-Token Funnel). **The free funnel doubles as the demand signal** —
inbound lookups tell us whether board members / buyers / CAMs care, at zero postage and zero payment
infra. Ship it as a **human-reviewed screening tool**, not an automated non-filer list (see guardrails).
Open a `checks` entry for the story-count data gap the same session (RULE 2.4).
*No payment, no mail, no outreach in this stage.*

**1b. #3 Trade-Area landing-page smoke test.**
Before the 2–4 week engine, stand up the lease-decision landing page — address input, the $49–149
price, an email capture — and measure conversion intent. **Zero build of the report engine, zero
channel-legality exposure, zero outreach.** The `05-…` plan itself names this as the gate before
engineering. This is the single cheapest demand test on the board.

Neither Stage-1 item needs the credential rotation (no payment surface yet) and neither needs operator
live-verify to produce a learning signal.

### Stage 2 — gated on a Stage-1 demand signal (build only if the probe converts)

**2a. #6 CAM Direct-Mail Channel + #1's paid diligence report** — *if #1's free funnel shows CAM/buyer pull.*
This is where #1 and #6 pair up technically (#6 has **no standalone payload** without #1's content).
But keep the *sequencing* decoupled: #6 is a 1.5–2 week build with **real recurring postage** and a
**new vendor integration** (Lob), and its mailer content is **capped at "confirmed filings + HB-913
mandate context"** — it *cannot* make the compelling "you're non-compliant / X% of your county hasn't
filed" claim (that's the competitor's hook; our data can't back it). So it's an expensive channel
carrying weak content. Don't drag cheap #1 down by welding it to #6 up front — earn #6 with a demand
signal first. #6 builds shared primitive **P-A** (direct-mail send lane). #1's paid one-off diligence
report needs shared primitive **P-B** (one-off payment) and the rotated Stripe key.

**2b. #3 full build** — *if the 1b smoke test converts.*
Builds the permits-proximity query, the FDOT address-resolver (the riskiest new logic — no precedent
in the repo), the live-only Mapbox category client, the new recipe, and shared primitive **P-B**
(one-off Stripe `mode:payment` + no-login paid delivery; today's checkout route is subscription-only
and cookie-authed). #1's paid diligence report then reuses P-B rather than rebuilding it.

### Stage 3 — opportunistic, only if a demand signal appears this cycle

**#2 Appraiser/Inspector Cross-Check** — de-risked **standalone report only.**
**The Nov 2, 2026 UAD 3.6 deadline does NOT pull this forward.** The deadline only bites if you sell
the *forms-software integration* (native ClickFORMS/TOTAL/ACI field-assist) — and that is explicitly
**Phase-2, partnership-gated, out of the MVP.** The MVP is a standalone permit+storm+flood+parcel-GLA
cross-check report the deadline doesn't especially need. Combined with the tiny market (~1,014
licensees, base nationally *shrinking*) and the permit→parcel address join (**documented 0/360 prior
failure** on Marco Island — see `MEMORY.md`), #2 is the weakest-economics play here. Build it only if a
demand signal shows up, reuse P-A (Lob mail) from #6, and **do not** build the forms-vendor
integration until a partner is actually real.

---

## Shared primitives — build once at the first consumer, reuse at the second

Flag the seam so the second builder reuses instead of rebuilding (memory: extract-on-copy-#2).

| Primitive | First built by | Reused by | Note |
|---|---|---|---|
| **P-A — Direct-mail send lane** (Lob adapter + QR/PURL rendering onto the claim-token funnel) | #6 | #2 | No direct-mail vendor exists in the repo today (grep-confirmed). New code, ~3–5 days. `send.ts` is Resend-only and does **not** transfer. |
| **P-B — One-off payment** (Stripe `mode:payment` + webhook one-time/subscription disambiguation + no-login paid-unlock delivery) | #3 | #1's paid diligence report | Today's `app/api/stripe/checkout/route.ts` is hard-coded `mode:"subscription"` and requires a cookie-authed user. New work. **Blocked on credential rotation.** |
| **P-C — DBPR bulk-license CSV → lake table** (fixed-position parse, county filter, PK merge, volume guard) | *exists* (boards 06/08, RE) | #6 CAM board 38 · #2 Home-Inspector `lic04home` + Appraiser `lic64appr` · #1's outreach FBPE engineer board | Pattern proven twice. Clone per board. **None of these files is confirmed to carry email/phone** — the existing contractor boards carry none. Probe each file's layout live (Full-Scope-First) before assuming a channel. |

---

## Per-play hard guardrails — the "never" rules (do not ship without these)

A fresh session won't re-read all 84 lines of #1's plan. These are load-bearing; violating one ships a
legal or invention problem.

- **#1 SIRS Radar** — **Never** claim reserve adequacy or a compliance *rate*; we hold filing
  presence/absence only. **Never** auto-publish a "non-filer" claim below high match-confidence —
  output is a *screening flag*, phrased "no filing found under this name as of [date] — verify with
  your CAM/engineer," never "you are non-compliant." The age+type+unit-count filter is a **proxy** for
  the law's 3-story trigger (no story-count field exists in the lake) → mandatory human-review gate on
  the first pilot batch, and disclose the proxy in every deliverable. Re-check the SIRS-scrape
  truncation flag before every gap computation.
- **#2 Appraiser Cross-Check** — **Never** auto-fill GLA as an authoritative value; only ever a
  sourced, dated discrepancy flag (assessor `TOT_LVG_AR` vs submitted). Enforce structurally via the
  existing claim-gate. Lead every pitch with the **bundle** (permit+storm+flood+parcel), never "nobody
  tracks permits" — BuildFAX already delivers permit history natively inside ClickFORMS (verified).
  National survey stats (3% / 58% / Nov-2) are **national context**, never implied as Lee/Collier
  specifics.
- **#3 Trade-Area** — **Never** claim foot-traffic / visit data (we hold none) — drop "daytime
  density" from MVP. **Never** cache/persist Mapbox Search-Box results into the lake (ToS = temporary
  use only; call live at request time). The permits-proximity signal is "a *generic commercial* permit
  is nearby," **not** "a competing restaurant/retailer is opening" — permit buckets carry no
  retail/restaurant granularity; frame honestly. FDOT is a text-matched nearest-*named*-road segment
  (geometry dropped at ingest), not GPS-exact — carry the caveat + a falsifier.
- **#6 CAM mailer** — content is **capped at "confirmed filings + HB-913 mandate context"** (the
  content pack rides positive-signal-only `condo-sirs-swfl`); never gap-detection or a non-compliance
  percentage until a baseline-of-required-filers registry is separately sourced. Target the **2,636
  individual CAM licensees**, not "CAM firms" (only 6 firm licenses exist). Mail-only; physical mail
  carries no CAN-SPAM/TCPA/FTSA/FDACS exposure.

---

## Verify at pickup — do NOT assume these are cleared

- **#2's real data gate is not the pipeline commit.** The Lee/Collier parcel *pipelines* are committed
  (`a82133f9`, `707e7dff`), but the sweep found the refinery connector reads only the 1-row
  `lee_parcels_summary` view — the per-parcel table being **populated in `data_lake.*` AND granted**
  (`docs/sql/lee_parcels_grant.sql`) is what the per-address join actually needs. Confirm live before
  sizing #2's Week 1.
- **#2 permit-status field:** `lee_permits.status` / `collier_permits.permit_status` exist but the
  *values'* population/quality (open/finaled/expired) is unverified. Spot-check before claiming the
  "pulled-but-never-closed" feature.
- **#2 UAD 3.6 data dictionary is unread** — required (RULE 0) before *any* forms-integration Phase 2.
- **#1 CAM/FBPE bulk files** — layout + email/phone presence unverified; probe live before building the
  outreach adapters.
- **#3 Stripe route** — confirmed subscription-only + cookie-authed today; the one-off + no-login path
  is genuinely new (don't underscope).

---

## What "taking over" looks like, concretely

1. Read this doc, then the matching section of `05-non-re-monetization-sweep-2026-07-18.md` for your
   play (the full build steps / data / reuse / risks live there).
2. Confirm the Prerequisites above still hold (credentials rotated if you touch payment; check the
   verify-queue pressure with the operator).
3. `node scripts/new-build.mjs <slug> "<label>"` → `superpowers:brainstorming` + crawl4ai research.
4. Reuse the shared primitives; build one only if you're the first consumer, and flag the seam.
5. Honor the guardrails for your play verbatim. They are the difference between a product and a lawsuit.
