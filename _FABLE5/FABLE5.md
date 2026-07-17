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

- 07/17/2026: 6 rows → 2 picks, both airports (RSW $1.1B/14-gate/Dec-2027 Suffolk build; APF lease
  appraised $8–10.8M/yr). Brain sweep landed the thesis's THIRD leg: ZORI rents split on the same
  map (Marco +11.9% vs Lehigh −8.2%); Naples luxury print = statewide coastal pattern (cross-coast
  Redfin). 2 defect checks opened (news body truncation; TDT combined label). Press run → Sun 07/19.
- 07/16/2026: ~40 rows → 10 picks; thesis UPGRADED to bifurcation (construction slowing + ZHVI
  bottom tier falling ~2x faster); `collection/2026-07.md` started. 07/11: 48 rows → 16 picks,
  luxury-diffusion candidate. 07/10: desk opened; composer at operator gate. No issue shipped yet.
