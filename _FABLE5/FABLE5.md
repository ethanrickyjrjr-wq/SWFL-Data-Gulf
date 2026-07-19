# FABLE5 — editorial desk boot file (read me in ~1 minute)

## Read order (fresh session)

1. SessionStart output (SESSION_LOG tail + open checks + desk status line).
2. This file. 3. `MINDMAP.md` (systems map). 4. `desk/<current-month>.md`.
5. `playbook.md` before authoring anything.

## What this desk is

Daily editorial triage for the **Insiders Edition** (monthly Fable 5 flagship +
event minis). Spec: `docs/superpowers/specs/2026-07-10-insiders-edition-design.md`.
Plan: `docs/superpowers/plans/2026-07-10-insiders-edition-plan.md`.

## Daily visit (first session of the day)

1. Pull news items newer than desk frontmatter `last_seen_published_at`
   (table `data_lake.news_articles_swfl` — via `db.schema("data_lake")`; columns:
   `headline, article_url, body_text, source_name, published_date, swfl_relevance`).
2. HANDPICK what matters for the publication (editorial judgment, not the cron's
   relevance score). Add each pick to `desk/<month>.md`: weight 1–5 + one-line
   why + areas + candidate series pairing. Entry format is parser-enforced
   (`lib/email/insiders/desk.ts`):
   `- [w] Headline · url: https://… · areas: 33905, Lehigh · series: permits YoY · why: one line`
3. Weight 5 → propose a mini same-session (draft + preview + park for approval).
4. Quiet day → log "nothing desk-worthy" under today's heading. Update frontmatter
   `last_visited` + `last_seen_published_at` every visit.

## Issue month (compose → approve → send)

Draft: `bun scripts/email/insiders-run.mts --month YYYY-MM` (DRY_RUN default; paid
authoring only with `INSIDERS_LIVE_AUTHOR=1`, ≤ $20/issue ledger). Preview + spend
ledger land in `insiders-runs/<stamp>/`. Sends are operator commands only
(`INSIDERS_APPROVED=1` + postal + From). After every send: retro from
`retro/TEMPLATE.md`, promotions → checks SAME session.

## Pointers (never copies)

- Open obligations → `node scripts/check.mjs list` (check: insiders_edition_live_verify)
- History → SESSION_LOG.md · Craft → playbook.md · Retros → retro/

## State of the desk (≤5 lines, update each visit)

- 07/19/2026: 15 rows → 4 picks (Naples Bay Resort $41.25M print; APF lease adds purchase option).
  ALL banked numbers re-verified after the 07/18–19 consolidation (ZHVI tiers/ZORI stand — now
  INDEX-labeled; Collier subdivisions 18,426→18,400). NEW fourth leg: Lee SOH lock-in served
  (36.71% median gap). Tape sweep done; One Community pair picked (Lehigh $244K vs Aqualane $7.4M,
  30.3x). Collection compose-ready; historical depth + receipts closer remain. Press run → 07/19.
- 07/17: 6 rows → 2 picks, airports; ZORI third leg. 07/16: thesis → bifurcation; collection
  started. 07/11: first triage, luxury-diffusion candidate. 07/10: desk opened. No issue shipped.
