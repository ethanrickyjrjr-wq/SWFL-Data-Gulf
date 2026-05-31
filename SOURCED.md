# SOURCED.md — Magic number citations

Every numeric constant in refinery pack code that affects scoring, confidence, or ranking
must have an entry here. Format: `## <anchor>` matching the `# see SOURCED.md#<anchor>`
comment in the code.

---

## labor-demand-swfl-wow-threshold

**wowDirection threshold: ±3% WoW**

No published noise floor exists for Lightcast/DEO OSPA weekly county-level job posting counts.
This is an empirical engineering estimate based on:

1. **Posting timing lag**: Lightcast scrapes multiple job boards on a rolling basis. A job posted
   Friday afternoon may be captured Saturday or Monday, shifting counts ±1–2% between adjacent
   calendar weeks independent of any real demand change (Lightcast methodology guide, §3 "Data
   Collection"; no specific county noise number is published).
2. **Deduplication jitter**: The same vacancy posted to LinkedIn, Indeed, and a company site is
   deduplicated by Lightcast with a 24–72h window. Dedup resolution that straddles a week boundary
   can cause a single job to appear/disappear week-to-week (same source, §4 "Deduplication").
3. **County-level vs. MSA-level**: DEO OSPA data is published at county level. County counts are
   lower-volume than MSA aggregates, so proportional noise is higher. No specific county noise
   quantile is published; 3–5% is accepted practice in regional LMI work (CareerSource FL
   practitioner communications; not a formal publication).

**Calibration instruction**: The 3% floor should be re-evaluated after the first 8 live weeks.
If direction flips every week with <3% moves, tighten to 2%; if true demand shifts are being
suppressed at 3%, loosen to 5%. The code comments the update point at `wowDirection()`.

**Comparison**: BLS LAUS ±0.2pp is a published revision floor (BLS LAUS Handbook of Methods,
Chapter 4, Table 4-2). Lightcast has no equivalent published table — hence the "empirical estimate"
classification here, not a "cited" one.

---

## fgcu-reri

**confidence: 0.85**

- Rationale: FGCU RERI is a primary university source (Lutgert College of Business,
  peer-reviewed methodology). Single-source brain with no cross-validation upstream.
- Data lag: ~2 months structural (e.g., May 2026 report covers March 2026 data).
  Lag is baked into `caveats` on every build, not penalized in confidence.
- Benchmark: BLS LAUS (government primary, single-source) ships at 0.80–0.85 in macro-swfl.
  FGCU RERI is comparable provenance quality.

**fitScore: 0.7**

- Rationale: Dedicated SWFL regional macro leaf. Always relevant to SWFL macro queries.
  Not a universal macro brain (no national/state coverage) — capped below 1.0 to allow
  broader-scope brains to rank above it when the query is national or Florida-wide.

---

## safety-swfl-direction-threshold

**crimeDirection / rateTrend threshold: ±3% YoY (`DIRECTION_THRESHOLD_PCT`)**

A property-crime-rate YoY change of magnitude ≥ 3% flips the brain bullish (falling crime) or
bearish (rising crime); smaller moves read as neutral. Engineering estimate, not a published
figure:

1. **No published county-level UCR/FIBRS noise floor.** FDLE does not publish a year-over-year
   revision band for county Part I property-crime rates, so there is no authoritative threshold to
   cite (contrast BLS LAUS ±0.2pp, which is published).
2. **Population denominator drift.** The covered-population denominator moves ~1–3%/yr with organic
   growth even when the agency roster is stable, so a sub-3% rate change is within denominator noise.
3. **Calibration knob.** If the first live FBI-CDE-sourced years show the brain flipping on noise,
   tighten toward 5%; if it sits neutral through real moves, loosen toward 2%. Update point:
   `crimeDirection()` / `rateTrend()` in `refinery/packs/safety-swfl.mts`.

## safety-swfl-magnitude-divisor

**magnitude = min(1, |YoY %| / 15) (`MAGNITUDE_YOY_DIVISOR`)**

Normalizes the YoY rate change into the 0–1 magnitude scale; a 15% YoY swing saturates to full
magnitude. Engineering estimate: a 15% single-year move in a county property-crime rate is a
genuinely large shift (multiples of the ±3% direction threshold), so it anchors the top of the
scale. Not a published figure; same calibration discipline as the direction threshold.

## safety-swfl-coverage-shift-threshold

**Coverage-shift suppression: ±10% covered-population YoY (`COVERAGE_SHIFT_SUPPRESS_PCT`)**

FIBRS reports per-agency; the per-1k denominator is the sum of the populations of the agencies that
reported that year (the "covered population"). When that covered population moves more than 10% YoY,
the brain suppresses the direction to neutral and caveats it. Engineering estimate:

1. **Organic county population growth is ~1–3%/yr** (Census PEP, Lee/Collier). A covered-population
   move >10% cannot be organic — it means an agency entered or left the FIBRS roster.
2. **The roster genuinely swings.** Cape Coral PD (~25% of Lee County's population) reports to FIBRS
   in 2024 but is absent in 2021/2025. Including/excluding it shifts Lee's covered population
   ~25–40% — far above 10% — while a like-for-like comparison would not.
3. **Why suppress rather than adjust.** When the footprint changes, the numerator (crimes) and the
   geography both change, so the YoY rate is not a like-for-like comparison and cannot be rescued by
   normalizing the denominator alone. Neutral + caveat is the honest output. Update point: the
   coverage-shift guard in `safetyOutputProducer`.

**Note:** this guard makes the data internally honest; it does NOT fix the FIBRS undercount versus
the FDLE UCR baseline (incomplete NIBRS-transition participation). That is a source-fitness problem
tracked separately — `safety-swfl` stays dormant until a complete county source (FBI CDE) replaces
FIBRS aggregation.
