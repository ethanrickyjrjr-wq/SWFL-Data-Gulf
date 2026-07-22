# HANDOFF — fan out and actually FIX the checks, don't just close them

**Written 07/22/2026, end of a session that ran out of context mid-task.**
Everything below was measured or verified live this session. Re-measure before acting.

## What the operator asked for, verbatim, and what he did NOT get

> "fan out 100 sonnets and close out all these issues correctly. no bullshit answers.
> no reading it partially. i want 2 examples of each being fixed, how it was fixed and
> proof it is fixed"

**This was NOT delivered.** The session hit its context ceiling while composing the workflow
and was cut off. Nothing from that request ran. Do not report it as done, do not assume a
background job is running — there isn't one. Start it.

The word that defines the job: **FIXED**, not closed. He wants working code and proof, not a
smaller number. A close without a fix is the exact lie the whole ledger mechanism exists to prevent.

## State of the ledger, measured 07/22/2026

- **667 open** (was 722 at session start).
- **11 closed by machine** with live signal proof (`resolved_by='check-sweep'`).
- **48 `idea` rows banked** to `_AUDIT_AND_ROADMAP/build-queue.md` and `--drop`ped
  (state='dropped', drop_reason set, NO proof — an abandonment record, never a "done" claim).
- **3 open checks bumped to `priority=100`** — the criticals below.
- **122 closed checks carry NO proof at all** — closed before the proof trigger existed.
  Unverified "done" claims sitting in the ledger. Nobody has audited these. Separate job.

## What got BUILT this session (working, committed, NOT pushed)

`scripts/check-sweep.mjs` — the missing acting half. The ledger had an automatic OPENER
(`reverify-signals.mjs` reopens closed checks whose signal regressed) and no automatic CLOSER.
`runSignal` fired only inside `check.mjs close`, one key at a time, typed by a human. The count
could only go up, by construction.

    node scripts/check-sweep.mjs [--dry-run] [--class verify] [--project ingest]

Scans `state=open` + signal, runs each signal live, closes passers with a `proof.kind='signal'`
record re-validated server-side by the `checks_require_proof` trigger. `resolved_by='check-sweep'`.
15 tests, each named for a failure mode. Spec: `docs/superpowers/specs/2026-07-22-check-sweep-design.md`.

`.claude/hooks/print-closeable-checks.mjs` — SessionStart, report-only (operator's explicit
choice over auto-close-on-cron). Runs the sweep `--dry-run` and prints "N checks are NOW
CLOSEABLE". Silent when there's nothing to say.

**Unpushed commits on main — run `git log origin/main..HEAD` before pushing; at session end
several were from a PARALLEL SESSION. Ask before bundling (RULE 1 / safe-push carries foreign commits).**

## THE THREE LIVE CRITICALS — fix these first, they are priority 100

All three were recorded correctly in the ledger on 07/18 and sat unread for four days. The
ledger worked; 722 rows of noise buried them.

**1. A public page FABRICATES a freshness token.** `sa0718_embed_widget_fabricates_freshness_token_co`
`/embed/footer-token` serves the literal `SWFL-7421-vX-pending` and captions it
"Master brain — live" — twice each, verified by direct curl 07/22, live served bytes not a diff.
When the master fetch fails it invents the token AND a 0.78 confidence and still says "live".
This is the ONE hard block in our own rules — an invented value with no source — shipping
publicly. Source: `app/embed/footer-token/page.tsx:27,28,65`.

**2. `/map` serves MOCK flood dollars as real, undisclosed.** `sa0718_map_page_always_renders_hardcoded_mock_flo`
All three `MapCanvas` calls pass `metric="flood"` with no `override` (`app/map/page.tsx:13,22,26`);
`components/charts/MapCanvas.tsx:154` falls through to `lib/landing/home-map-data.ts`, whose own
header says "MOCK FIXTURE — fail-soft fallback ONLY … do NOT import from new surfaces". No
"sample data" disclosure in the served HTML.

**3. Stripe checkout silently downgrades paying subscribers.** `sa0718_unchecked_supabase_read_on_the_customer_lo`
`app/api/stripe/checkout/route.ts:47` is `const { data: row } = await db…` — `error` never
destructured; `:65` unconditionally upserts `tier:"free", status:"none"`. A transient DB blip
turns a paying customer free. Zero commits to that file since 07/18.

## The premise correction that reframes the 74 site-audit defects

**They were never "unreconciled." They were fixed and never closed.**

- All 74 checks created `2026-07-18T19:12Z` (within 5 seconds of each other).
- `daeb1f6e` "fan-out fix pass — 43 of 89 audit findings" landed **57 minutes later**.
- `f3a4e833` "apply 10 confirmed findings from the 07/18 fan-out review" landed next morning.
- `_RESEARCH/audits/2026-07-18-fanout-fix-log.md` ends with: *"Once reviewed: push, then close
  the `checks` for the 43 fixed findings (not yet closed — waiting on the review)."*
- **Nobody ever did the closing.**

Sample of 10 verified against current `main`: **4 FIXED, 6 STILL_TRUE, 0 unverifiable.**
Spot-check of the log itself: **7 of 7 fixed-claims verified true, 6 of 6 flagged-claims verified
still-true.** The log is an accurate key.

**Disposition: SPLIT, log-guided — one grep per check, NOT a 74-item re-audit.**
- Close the checks matching the log's "Fixed (43)" + "Already fixed (5)" tables, confirming each
  against its cited file:line first.
- Keep open "Flagged (30)" + "Carved out (11)". The carved-out ones need operator sign-off
  (billing, MCP CORS, cross-brain reconciliation) per RULE 1.
- The log's flagged *table* itemizes only 28 of its stated 30; the two missing are findings **#24**
  (contacts auth) and **#76** (PageShell `py-8`) — both verified STILL_TRUE, which reconciles the count.
- **Closing the batch wholesale is ruled out** — 6 of 10 reproduce, including the three criticals.

## Why only 11 of 667 could close: the signal vocabulary is structurally too narrow

Two agents proposed signals across 32 `verify` checks. Result: **4 PROPOSE, 28 NOT_CLOSEABLE**,
each with specific evidence. That is the correct outcome, not a failure. The four enabled types
(`http_ok`, `http_body`, `db_row_exists`, `db_fresh`) cannot express:

- **Column-to-column comparison.** `dom_backfill_listed_date` needs `listed_date != first_seen`.
  Every PostgREST filter compares a column to a literal. Unexpressible.
- **Absence.** `zip_scope_core` needs "no longer says 126 SWFL ZIPs". `db_row_exists` only proves
  presence; there is no "count is zero" assertion.
- **Before/after state.** `leaf_ingest_freshness` needs "`refined_at` advanced past a source
  landing time". All four types are single-shot point-in-time reads.
- **Rendering / consistency.** `trend_fit_engine` needs "the stated direction matches the plotted
  line" — the actual failure (caption says rising, line is flat) leaves both strings present and a
  `contains` green.
- **Workflow success.** `workflow_success` is recognized-but-unimplemented
  (`scripts/lib/check-signals.mjs:136-142` returns `ok:false` unconditionally). Enabling it would
  make `pdf_html_visual_parity` and `slug_index_autoderive` closeable.

**Cheapest unblocks, in order:** enable `workflow_success`; materialize `listed_date != first_seen`
as a generated column or view (turns a permanently-manual check self-closing); add a `not_contains`
or `row_count_is` signal type.

### The traps that would have caused permanent false closes

These are why signals must be hand-verified. **A false pass NEVER self-heals** —
`reverify-signals.mjs` only reopens on signal FAIL, so a too-loose signal that wrongly closes
something keeps returning `ok:true` forever.

- **`incremental_ingest` — INVERTED.** A `db_fresh` reads *greenest at the moment the bug is worst*:
  a poisoned cursor stamps the newest row today while stranding the whole backlog.
- **`hendry_first_sweep_land` — already-satisfied trap.** A sibling check (`hendry_seed_orphans`,
  already `done`) closed on the IDENTICAL filter, and 1,127 rows already match. Any row-count signal
  passes the instant it's attached, verifying a condition true before the check was written. Its real
  remaining work — retiring 298 superseded `lifecycle_seed` rows — is provably undone; all 298 are still there.
- **`homepage_one_bar` — REJECTED this session.** Proposed `contains: "Pick what comes out:"` is
  static JSX. The check is named "one WORKING bar, no theater"; a hero with a dead submit handler
  renders that string perfectly.
- **`insiders_edition` — flagship unbuilt.** "Issue 001 · in production" is hardcoded at
  `app/insiders/page.tsx:219,390`. The page's live desk data would have made a signal look easy and
  closed an unshipped deliverable.
- **`briefcase_examples` — the check's own detail overclaims.** Detail says "smoke passed 07/22/2026",
  but `scripts/smoke-prod.mts:147` asserts only HTTP 200 on 2 of the 4 URLs and verifies nothing about
  cited content or freshness currency. Do not treat that stamped detail as evidence.
- **Soft-404s return HTTP 200.** `/z/*` and `/r/should-i-sell/*` render "Outside our coverage" at 200.
  Any `http_ok` on those route families is worthless — use `http_body`, negative-tested against a
  known-bad input (e.g. `/z/00000`).

## Signals attached this session (all hand-verified before attaching)

- `homes_only_sold_median_live_verify` — `db_row_exists` on `data_lake.leepa_sold_median_by_zip`,
  filter `zip_code=eq.33972&median_sale=gt.300000&county_fallback=is.false&home_sales_n=gte.20`.
  Polarity: if the homes-only filter regressed, 33972 collapses to the land-blended ~$35–50k.
  `county_fallback=is.false` closes the false-pass path where the county median ($355,298) would
  itself satisfy the threshold. CLOSED.
- `seller_stress_facing_page_live_verify` — `http_body` on `/r/should-i-sell/33908`,
  contains "areas we score for seller pressure". Negative-tested: `/r/should-i-sell/00000` → 0 hits. CLOSED.
- `zip_page_destination_live_verify` — `http_body` on `/z/33908`, contains "Would change this read:".
  Negative-tested: `/z/00000` → 0 hits. CLOSED.

## HOW TO RUN THE FAN-OUT (the actual ask)

Operator explicitly authorized multi-agent orchestration ("fan out 100 sonnets"). Use the
`Workflow` tool, not inline agents — the orchestration must survive a context ceiling.

**Phase design that matters:**

1. **Triage** — fan out over open `defect` + `verify` checks. Each agent returns per check:
   ALREADY_FIXED (with file:line or served bytes) / STILL_BROKEN (with a concrete diff) /
   NOT_CLOSEABLE (with the reason). Read-only. Seed the site-audit slice with the fanout-fix-log
   as the key — it is validated, do not re-derive it.
2. **Fix** — only STILL_BROKEN with a concrete diff. **`isolation: 'worktree'`** is mandatory here;
   parallel agents writing the same repo will conflict. Landing N worktrees is the hard part —
   batch by area (email / ingest / app-routes / charts) to limit collisions.
3. **Adversarially verify** — a SEPARATE agent per claimed fix, prompted to REFUTE it. Majority
   refute = the fix does not land. This is the gate; without it the fan-out just produces confident
   wrong answers at scale.
4. **Close** — only after verification. `node scripts/check.mjs close <key> --evidence "<what proved it>"`.
   Where the claim is mechanically checkable, attach a `--signal` instead so it re-verifies free forever.

**The operator wants, per category: 2 worked examples — the defect, the fix, and the proof.**
Structure the final report around that, not around a count.

**Hard rules that still apply:** never mass-close · `public.checks` is prod evidence, not dev
attestation — verify served bytes, not the diff · a code fix is not live until the thing that serves
it rebuilds · every close names what proved it · a check you cannot verify gets a signal or a `--due`,
not a close.

**Cost note:** three agents cost roughly $80 this session (~480k subagent tokens). A 100-agent
fan-out is materially more. The operator authorized it; he should still see the number before it runs.

## Not done, tracked, do not lose

- `checks_signal_backfill` — the open check covering signal backfill across the remaining ledger.
- `check_sweep_live_verify` — opened by `new-build.mjs` for the sweeper itself; needs a signal once
  there's a stable surface to assert, or a manual close with the run output as evidence.
- The 122 proof-less closed checks — unaudited unverified "done" claims. Nobody has looked.
- The nightly chain is DISABLED and it blocks two checks: `dom_backfill_listed_date` sits at
  12,545 of 33,671 rows, and newest Hendry data is 07/19. The clock is not running on either.
