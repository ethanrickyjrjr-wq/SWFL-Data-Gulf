# Fixture-first brand resolver + Brandfetch/crawl4ai brand-at-scale pilot

> **Recommended model:** ⚡ Sonnet

**Date:** 2026-07-10
**Status:** APPROVED design shape (operator, in-session 07/10/2026: hybrid API+crawl4ai scale
lane, fixture-first resolver, brand-offer as one T1 line + arrival preload) — split ruling:
this spec covers the BRAND workstream only; the contact factory is a separate build
(handoff: `docs/handoff/2026-07-10-agent-contact-factory-handoff.md`).
**Check:** `outreach_brand_injection_live_verify`
**Research base:** `docs/steadyapi-research/2026-07-10-outreach-brand-injection-research.md`
(round-4 social listening + Brandfetch/logo.dev/DBPR crawls, 07/10/2026) + the funnel demo
email spec's pinned 07/02 evidence (`2026-07-02-funnel-demo-email-design.md`).

## Problem

The outreach engine resolves a recipient's brand by live-scraping their domain at build time
(`enrichBrand`), falling back to the SWFL house brand below 0.5 confidence.
`fixtures/real-estate-brands/` — 28 curated brokerage profiles (crawl4ai-sourced, DBPR-confirmed,
confidence-scored, incl. one official brand guide) — is consumed by NOTHING. Curated knowledge
we already paid for never reaches the emails. And coverage stops at 28 of 1,864 licensed
Lee/Collier RE corps, with no scale lane other than hand-crawling.

Research (07/10/2026) says brand fidelity is the wedge: generic automation is explicitly
ignored ("people smell a bot instantly"); compliance-locked brand templates are what brokerages
actually want ("locked templates where agents only touch photos and copy — make the compliant
path the LAZY path"); and the demo email IS the product demo, in their own brand.

## Goal

Every outreach build resolves the best brand we hold for that recipient — curated fixture
first, live scrape second, house brand last — and the fixtures folder grows from 28 to ~100
brokerages via a Brandfetch-bulk + crawl4ai-verify pilot, so a full-scale cycle-1 send (gated
on the contact factory build) renders in the recipient's real brand with the compliance layer
visible.

## What we're building

### A. Fixture loader + resolver (`lib/email/outreach/brand-resolver.ts`)

- **Loader:** reads `fixtures/real-estate-brands/index.json` + per-brand files at script
  runtime (outreach CLI context only — never bundled client-side). Validates shape; a
  malformed fixture file is skipped loudly (stderr), never a crash.
- **Match keys, in order:** (1) recipient `domain` exact/normalized match against fixture
  `domain`; (2) brokerage-name match (normalized casefold) — the contact factory emits a
  `brokerage` column sourced from DBPR Employer's Name, and fixtures carry `dbpr_name`.
- **Resolution order:** fixture (confidence ≥ 0.75) → live `enrichBrand(domain)` scrape →
  fixture (confidence < 0.75, better than nothing when the scrape also fails) → house brand.
  The existing <0.5-scrape-confidence → house-brand rule is unchanged when no fixture exists.
- **Provenance:** the resolved brand carries `brand_source: "fixture:<slug>" | "scrape" |
  "house"` into the run report so every preview names where its colors came from.
- **Compliance fields:** resolver exposes `company_name` (and `license_number` when the
  target row carries one — contact-factory column, optional) to the template layer. The demo
  email's footer block renders brokerage name + license + Equal Housing line INSIDE the
  demo artifact, so the "locked compliant layer" is visible in the demo itself. Absent
  fields render nothing (empty-tolerant) — never a placeholder.
- **No behavior change without a fixture:** with an empty fixtures dir the resolver is
  byte-identical to today's enrichBrand path (tripwire test).

### B. Brand-at-scale pilot (`scripts/outreach/brand-pilot.mts`)

- **Ranking:** brokerages ranked by real licensee count from the DBPR licensee CSV
  (RE_rgn7, Lee+Collier active rows — the contact factory downloads it; this script accepts
  the same file path, so neither build blocks the other). Fallback ranking until that file
  exists: the corp list + agents.json coverage.
- **Domain resolution:** fixture `domain` if held; else Brandfetch Brand Search API
  (company name → domain) with manual confirmation in the run report (names are ambiguous;
  a wrong-domain brand is worse than none).
- **Bulk fetch:** `GET https://api.brandfetch.io/v2/brands/domain/{domain}` (verified live
  07/10/2026 — logos, colors, fonts; 100 free dev requests; quota headers;
  hard spend cap set to $0 = free tier cannot overage). Writes candidate fixture files:
  `status: "api"`, `confidence` mapped conservatively (≤0.7 — API output never outranks a
  crawl), `source_url` = the API reference + fetch date, colors verbatim.
- **crawl4ai verify:** the top 20 send-targets get a crawl4ai pass upgrading them to
  `crawled` (0.75–0.9) or `official_guide` (1.0) per the 06/26 handoff rubric. The BHHS
  cabernet-vs-parent-purple trap is the review template: franchise files must name which
  entity's palette they hold.
- **Hard rules (carried from the 06/26 handoff):** every company confirmed in
  `dbpr-all-corps-lee-collier.json` before a file is created; NO invented colors — a
  brokerage with no fetchable brand stays absent (resolver falls through to scrape/house);
  `index.json` updated in the same commit as new files.
- **Operator gates:** Brandfetch dev account signup is operator-owned (new vendor surface —
  heads-up given 07/10/2026, free tier, $0 cap). Key rides in `.env.local`, never committed.

### C. Cycle-1 wiring (consumes, doesn't build)

- The outreach CLI's brand step swaps `enrichBrand` for the resolver. Run report gains the
  `brand_source` column.
- T1 copy gains ONE brand-offer line ("your brand kit is already loaded — keep it or hand us
  your current setup") and the arrival URL preloads the resolved brand — the existing
  arrival brand param, no new surface.
- The send itself stays behind the funnel build's operator gates (13 local commits
  diff-review + push, outreach domain, From identity, postal, preview-approve) AND the
  contact factory landing. Research pins for the send: text-forward T1 + one chart PNG
  (designed grids are for warm/opted-in only), warm the new domain with value sends first,
  score on replies/clicks never opens.

## Testing

- bun:test — resolver ordering (fixture-wins, low-confidence demotion, scrape fallback,
  house floor), domain + dbpr_name matching (normalization cases), malformed-fixture skip,
  empty-dir byte-parity tripwire, compliance fields empty-tolerance.
- Pilot script: `--dry-run` prints the ranked fetch plan with zero API calls; a fixture-shape
  validator runs over every emitted file (same validator the loader uses).
- Live-verify (`outreach_brand_injection_live_verify`): one real DRY outreach run over a
  small CSV shows ≥1 recipient resolving `fixture:<slug>` with correct colors in the
  preview + `brand_source` in the run report.

## Out of scope

- Contact factory (DBPR CSV + directory email crawls) — separate build, handoff doc.
- Domain-verify UI (send-on-behalf per-client subdomain — the paid-product lane; research
  finding F4 makes it load-bearing LATER, tracked separately).
- logo.dev — held as the fallback vendor if Brandfetch's free tier disappoints; its docs are
  in the research doc, don't re-crawl.
- Any change to the funnel cadence/subject system (pinned 07/02, reconfirmed 07/10).
