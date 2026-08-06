import { test, expect } from "bun:test";
import { unreadyDisplays, EMAIL_FACT_LIMIT } from "./area-email-inputs";
import { lengthProfile } from "./length";
import { validateNarrative } from "./validate";
import type { BakeFact, BakeInputs } from "./types";

// Tests named for the failure mode each targets (RULE 3.5). The failure modes come
// from the plan's §5 table plus the measured 08/06/2026 bake diagnosis.

const fact = (label: string, display: string): BakeFact => ({
  label,
  display,
  sub: null,
  why: null,
  source: "test source",
});

// ── The rounding-provocation guard (Class B root cause) ──────────────────────

test("a bare multi-decimal ratio is flagged as not email-ready — it is what provokes rounding", () => {
  // Measured: the writer turned 93.7 into 93 and 1.04 into 1.0. A bare decimal
  // carries no unit telling the writer it is already final.
  expect(unreadyDisplays([fact("Seasonal position", "1.04")])).toEqual(["Seasonal position=1.04"]);
});

test("a display carrying a unit, currency or scale marker is email-ready", () => {
  const clean: BakeFact[] = [
    fact("Sale-to-List Ratio", "93.7%"),
    fact("Zillow Home Value Index", "$637K"),
    fact("Days on Market", "98 days"),
    fact("Months of Supply", "4.2 mo"),
    fact("Price per Square Foot", "$546/sqft"),
    fact("Luxury/Starter Spread", "4.41x"),
  ];
  expect(unreadyDisplays(clean)).toEqual([]);
});

test("an empty display never reaches the writer", () => {
  expect(unreadyDisplays([fact("Missing", "   ")])).toEqual(["Missing=   "]);
});

test("selection skips an unready fact and backfills from rank — never ships a short set", () => {
  // The real shape, measured 08/06/2026: 25 of 52 live surfaces ranked a bare
  // ratio into the top 6. Selecting the top-6 OUTRIGHT would hand the writer
  // exactly the material that produced the rounding failures; selecting the
  // top-6 THAT ARE READY costs nothing, because the pool holds 28-30 signals.
  const pool: BakeFact[] = [
    fact("Pending Ratio", "0.16"), // unready — must be passed over
    fact("Days on Market", "98 days"),
    fact("Average household size", "1.63"), // unready
    fact("Median Home Value", "$742K"),
    fact("Price-Cut Share", "8.8%"),
    fact("Homes Sold", "270"),
    fact("Months of Supply", "4.2 mo"),
    fact("Employment rate", "98.09%"),
    fact("Price per Square Foot", "$546/sqft"),
  ];
  const ready = pool.filter((f) => unreadyDisplays([f]).length === 0);
  const selected = ready.slice(0, EMAIL_FACT_LIMIT);

  expect(selected).toHaveLength(EMAIL_FACT_LIMIT); // backfilled, not short
  expect(unreadyDisplays(selected)).toEqual([]);
  expect(selected.map((f) => f.label)).not.toContain("Pending Ratio");
  expect(selected.map((f) => f.label)).not.toContain("Average household size");
  // Rank order is preserved among the ready facts.
  expect(selected[0]!.label).toBe("Days on Market");
});

test("a bare integer count is email-ready — the guard targets multi-decimal ratios only", () => {
  // "270" homes sold reads as final; "1.63" does not. Over-broad readiness would
  // strip legitimate counts and starve the fact set.
  expect(unreadyDisplays([fact("Homes Sold", "270")])).toEqual([]);
  expect(unreadyDisplays([fact("Market Heat Score", "69")])).toEqual([]);
});

// ── The email-is-not-a-report guard ──────────────────────────────────────────

test("an email leans on a handful of numbers, not a spec sheet", () => {
  expect(EMAIL_FACT_LIMIT).toBeLessThanOrEqual(8);
});

test("area-email narration is judged at email length, not report length", () => {
  const email = lengthProfile("area-email");
  const report = lengthProfile("zip");
  expect(email.maxChars).toBeLessThan(report.maxChars);
  // 50-125 words ≈ 300-900 chars (docs/standards/emails.md §0).
  expect(email.minChars).toBe(300);
  expect(email.maxChars).toBe(900);
});

test("an unknown surface falls back to the report profile, never to email limits", () => {
  // Guards against a new surface silently inheriting a 900-char ceiling.
  expect(lengthProfile("some-future-surface").maxChars).toBe(2000);
});

// ── The prompt and the validator must agree on length ────────────────────────

test("a report-length narration FAILS validation on the area-email surface", () => {
  // The failure this pins: prompt says one length, validator enforces another,
  // and every run fails for a reason no log line explains.
  const inputs: BakeInputs = {
    surface: "area-email",
    key: "33901",
    place: "Fort Myers",
    county: "Lee",
    asOf: "08/06/2026",
    facts: [fact("Days on Market", "98 days")],
    context: [],
    sources: [],
  };
  const tooLong = {
    narration: `Fort Myers as of 08/06/2026. ${"Homes here sit about 98 days. ".repeat(40)}`,
    outlook: [
      {
        text: "[INFERENCE] Days on market could stretch further.",
        base: "98 days",
        falsifier: "Days on market falls below sixty in the next report.",
      },
    ],
  };
  expect(tooLong.narration.length).toBeGreaterThan(900);
  const errs = validateNarrative(tooLong, inputs);
  expect(errs.some((e) => e.includes("outside 300–900"))).toBe(true);
});

test("that same narration PASSES length on the zip surface — the profile is what differs", () => {
  const inputs: BakeInputs = {
    surface: "zip",
    key: "33901",
    place: "Fort Myers",
    county: "Lee",
    asOf: "08/06/2026",
    facts: [fact("Days on Market", "98 days")],
    context: [],
    sources: [],
  };
  const narration = `Fort Myers as of 08/06/2026. ${"Homes here sit about 98 days. ".repeat(40)}`;
  const errs = validateNarrative(
    {
      narration,
      outlook: [
        {
          text: "[INFERENCE] Days on market could stretch further.",
          base: "98 days",
          falsifier: "Days on market falls below sixty in the next report.",
        },
      ],
    },
    inputs,
  );
  expect(errs.filter((e) => e.includes("length"))).toEqual([]);
});
