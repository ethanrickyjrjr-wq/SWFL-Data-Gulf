# 22 — Fix the flywheel's calibration (P7) — PARKED

- **Status:** ⬜ PARKED until ~08/30/2026 (first prediction windows close then)
- **Owner:** needs plan (not urgent)
- **Source:** autopsy §3 + §9.7

## What

The flywheel machinery is sound but the *skill* isn't demonstrated. The one number that exists says the
system **loses to a naive "assume nothing changed" baseline by 6.5pp**; master lands "mixed / no
confident call" 91% of the time; 0 live graded outcomes (earliest window closes 08/30/2026).

## The hard rule (do not violate)

**Do NOT ship a public "we're X% accurate" claim until it beats persistence.** Structural guarantee,
not AI virtue. Not on the recipe→edit→schedule→send launch path — do not invest here before launch.

## Steps (after 08/30/2026)

1. Wait for the first real graded outcomes.
2. Re-measure calibration vs the persistence baseline.
3. Only then decide whether/how to tune the grader — and only then consider any public accuracy claim.

## Done when

- First windows are graded, calibration is re-measured against persistence, and a go/no-go on a public
  accuracy claim is recorded (with the number).

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
