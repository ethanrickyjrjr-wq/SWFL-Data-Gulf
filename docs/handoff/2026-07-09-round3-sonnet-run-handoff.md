# HANDOFF — run the round-3 social-listening backlog (SteadyAPI, credits window open)

**For:** the Sonnet research session. **Written:** 07/09/2026 by the Fable session that authored the
round-3 backlog.

## Mission

Run the question backlog at `docs/steadyapi-research/2026-07-09-round3-question-backlog.md` with
live SteadyAPI calls. The operator has authorized generous SteadyAPI spend through roughly
07/11/2026 — the per-call approval rule is satisfied for this run; you do not need to re-ask before
each call. Rate limits still apply (15 req/s global; see mechanics).

## Scope split — read this before spending anything

- **YOURS:** Q1 (residential-agent willingness-to-pay) and Q2 (which CMA adjustments agents name)
  first — they're the Tier-1 SteadyAPI questions. Then Tier 2 (Q5–Q9) in order as the credit window
  allows. Tier 3 only as piggyback when a sweep already passes through the same threads.
- **NOT YOURS:** Q3 (link-tracking vs Gmail placement) and Q4 (seed-test mechanics) are
  crawl4ai-only document questions — the Fable session is handling them in parallel. Before
  touching anything Q3/Q4-adjacent, check `docs/steadyapi-research/` for a 07/09-dated crawl4ai
  answers file; if present, those are closed.
- Do NOT re-research anything in round1 §1 (18 settled items) — the backlog file already excludes
  them, but resist the pull if a thread drifts there. Showing Prep is BUILT, not a candidate.

## Read first (in order)

1. `docs/steadyapi-research/2026-07-09-round3-question-backlog.md` — the mission; each question has
   its own run recipe (subreddits, filters, client-side keywords, what the answer changes).
2. `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` — endpoint reference + field-verified quirks
   (updated 07/09 with the `content`-not-`body` comment-field fix — already folded in, don't redo).
3. `docs/steadyapi-research/2026-07-09-recurring-pain-questions-and-answers.md` — round 2; your
   output file should follow its shape (evidence + URLs + what-it-changes + searched-and-empty).

## Mechanics quick-card (4×-field-verified; full detail in the vendor note)

- Key: `new_steady` in `.env.local` (line ~152). `PHOTOS_API` is the SUSPENDED key — the client
  code in `lib/listings/steadyapi.ts` reads `PHOTOS_API`, so don't call through that client; hit
  the REST endpoints directly with the `new_steady` bearer.
- **Never generic `/v1/reddit/search` for niche topics** — site-wide relevance ranking returns junk
  (4 independent confirmations). Use `/v1/reddit/posts?url=<subreddit-url>&filter=hot|new|rising`
  (note: `filter=top` returns only ~3 items; `sortType` is broken — don't combine it with
  `filter`), then filter client-side by keyword.
- Always check `body.success !== false` — the API 200s with `{"success": false}` on innocuous
  queries (stable content-filter false-positive; reword and retry once).
- Comment text lives in `comment.content`, NOT `comment.body` (nested `replies` same). Fetch
  comments via `/v1/reddit/post?url=<post-url>` on every promising hit — the numbers live in
  comments (that's where the Reonomy prices were).
- Raw JSON responses go to your session scratchpad, NEVER committed (real Reddit usernames stay
  off GitHub — standing rule, three sweeps deep).

## Output contract

1. Findings → a new dated file in `docs/steadyapi-research/` (e.g.
   `2026-07-09-round3-answers-<n>.md`), round-2 file as the template. Per question: what was
   found (verbatim quotes + thread URLs + pull date), what it changes, and — just as important —
   what was searched and came up EMPTY (recipes tried), so nobody re-searches blind.
2. Fold anything fully settled into round1 §1 as new numbered items (the round-2 session's items
   17–18 show the pattern), narrowing or closing the matching open items.
3. Update the folder `README.md` index with your file.
4. RULE 2.4: anything that changes a build decision but isn't acted on gets a `checks` entry the
   same session (`node scripts/check.mjs open brain-platform <key> "<label>"`).
5. Annotate the open `steadyapi_round3_tier1_run` check: your run covers its Q1/Q2 half; the
   Fable session covers Q3/Q4. Close it only if all four are answered by then.
6. SESSION_LOG entry before any push; push only with the operator's explicit OK (standing rule —
   this handoff is NOT push authorization for your session).

## Stop conditions

- A question whose Tier-1 recipe AND one fallback recipe both come up empty → write the
  "searched, empty" note and move on. Don't invent a third venue mid-run; log the idea instead.
- Credits window closes (~07/11) or the Tier-2 list is exhausted → stop, write up, hand off.
