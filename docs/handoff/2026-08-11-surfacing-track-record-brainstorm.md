# Brainstorm handoff — where does any of this reach a customer?

**Question, verbatim (08/11/2026):** *"Where are we putting all this knowledge into emails and
on the site?"*

**Short answer, measured not assumed: nowhere.** This is a brainstorm starter, not a spec. Run
it through `superpowers:brainstorming` with a failure-modes section before anything is built.

## Measured state, 08/11/2026

Searched `app/`, `lib/`, `components/` for any reader of `predictions`, `outcomes`, or
`confidence_calibration`. **Zero hits.** Every bit of the grading, calibration and
direction-call machinery is internal. Nothing reaches an email or a page.

The one exception, and it is the uncomfortable one:

- `app/r/[slug]/page.tsx:213` and `app/r/housing-swfl/page.tsx:166` render
  `<Meta label="Confidence" value={`${confidencePct}%`} />`.

So we already show customers a confidence percentage. **It is self-asserted.** It has never been
compared to a single outcome — `outcomes` holds 0 rows and `confidence_calibration` holds 0 rows
(both probed live 08/11/2026). The brain says 0.9 and the page prints 90%, and nothing in the
system has ever checked whether the brain's 0.9 means anything.

That is the real finding here. We are not missing a track-record surface; we are **already
publishing a trust signal with nothing behind it.**

## The constraint that governs every option

Our own code, `refinery/tools/flywheel-backtest.mts:21`:

    grade_method='retrodicted', written to backtest_grades ONLY — never
    predictions/outcomes. A retrodicted % is never a public accuracy claim.

So the 144-row backtest corpus **cannot** be shown as accuracy. And it would be a bad idea even
if it were allowed: it scores 42.0% against a 48.6% naive baseline (lift −6.5 pp, N=138).

Real, forward-graded outcomes start at **08/30/2026** — the first window close. One outcome is
not a track record. So any surface phrased as "we are right X% of the time" is months away, and
the honest N will be small for a long time after that.

## The reframe worth starting the brainstorm from

**Stop waiting for accuracy. The honesty signals are available RIGHT NOW and cost nothing.**

The validation shipped this session (`51975c39`) produces a per-call verdict that does *not*
depend on any outcome existing:

- `no_direction` — we fitted the trend, the confidence interval straddles zero, and we are
  declining to call it.
- `unvalidated` — we could not check this one (too little history).
- `agree` / `disagree` — the authored call versus the fitted trend.

"We looked at this and we are not calling it" is a credibility move we can make **today**.
"We are right 62% of the time" is a claim we cannot make until we have earned it. The first is
also the harder one for a competitor to fake.

Related and already true: the crawled standard's §4.1 — *"A forecast that is always willing to
name a direction is not a forecast."* A surface that shows we sometimes decline is the visible
proof of that.

## Questions for the brainstorm

1. **Does the bare Confidence % chip stay, change, or go?** It is currently unbacked. Options:
   remove it; keep it but attach what it is derived from; or hold it until calibration exists.
   This is a credibility decision, not a UI one — cf. the 07/17/2026 trust low point.
2. **Does an email ever show a declined call?** A line like "no established trend in this ZIP
   over the last N months" is honest, cheap, and differentiating — but it reads as a non-answer
   to a reader who wanted a number. Which emails, if any, can carry it? Start at
   `docs/standards/email-build-playbook.md` §0.4 to see which of the 17 are walked.
3. **Is there a public track-record page at all, and when does it earn the right to exist?**
   What is the minimum N before it is not misleading? Pre-register that number now, before we
   know whether the results flatter us.
4. **Grain.** Per-call, per-slug, or one house-wide number? A house-wide accuracy figure over
   two unemployment series is not a statement about the whole platform — the existing scope
   caveat in the persistence handoff applies.
5. **Does the site show the fit itself?** `fitLine()` already returns a confidence band and
   `lib/charts/fit-overlay` exists. Showing the fan of paces a window supports is arguably a
   better trust artifact than any percentage.

## Failure modes to name before building (RULE 3.5)

- **A retrodicted number leaks to a public surface.** Guard: it is already forbidden in code
  comments only — there is no lint. Consider a real one if any of this ships.
- **Showing accuracy on tiny N.** A 3-outcome "67% accurate" is worse than showing nothing.
  Guard: a pre-registered minimum N, decided before the data arrives.
- **The gradeable count falling reads as a regression.** It will fall by design once
  `no_direction` starts downgrading rows. Any dashboard counting calls must say why.
- **Declining to call reads as "they don't know."** This is a copy problem, not a data problem,
  and it is the main risk in the reframe above.
- **A stale trust number.** The coverage artifact was already served 22 days stale to ops this
  month (`grade_coverage_artifact_served_stale`). A trust surface is exactly where staleness
  does the most damage.

## Prior art to read first, not re-derive

- `docs/handoff/2026-08-11-direction-call-what-remains.md` — what is built vs open.
- `_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md` — the
  crawled outside standard, especially §2 (never lead with raw accuracy) and §4 (the contract).
- `docs/superpowers/specs/2026-08-11-direction-validation-design.md` — the verdicts and what
  each one honestly means.
- `docs/standards/email-build-playbook.md` — the ONE map for any email change.
- `docs/consumption-contract.md` + `THE-CONTRACT.md` — what we already promise a reader.
