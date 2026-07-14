import { describe, expect, it } from "bun:test";
import { fitWindows, FIT_WINDOWS, labelFor, trendVerdict } from "./series-fit";
import type { Verdict, WindowFit } from "./series-fit";
import type { Fit, FitPoint } from "./fit-line";
// THE REAL GATE, not a stand-in. The verdict's whole reason to exist is that it
// SURVIVES this function — asserting against a mock would prove nothing.
import { auditClaims } from "@/lib/deliverable/claims";

/** Monthly points from 06/2015 through 05/2026 on a line, as our real series run. */
function monthly(from: Date, n: number, base: number, slope: number): FitPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    when: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)),
    y: base + slope * i,
  }));
}

const AS_OF = new Date(Date.UTC(2026, 4, 31)); // 05/31/2026

describe("fitWindows", () => {
  it("names all six windows", () => {
    expect([...FIT_WINDOWS]).toEqual(["full", "10y", "5y", "24m", "12m", "ex-boom"]);
  });

  it("drops a window with fewer than 12 points instead of drawing it", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000);
    const got = fitWindows(pts, AS_OF);
    const keys = got.map((w) => w.window);
    // Every returned window must have cleared the 12-point floor.
    for (const w of got) expect(w.fit.n).toBeGreaterThanOrEqual(12);
    // A window with too few points is absent entirely, not present-and-null.
    expect(keys).not.toContain("10y");
  });

  // THE REACH-BACK RULE. An 18-month series does not reach back ten years, five
  // years, or even twenty-four months. A trailing window may only be OFFERED when
  // the data actually reaches its cut date — otherwise an 18-month fit ships wearing
  // the label "last 10 years" and the window's NAME does the lying. `full` and
  // `ex-boom` are not trailing windows and are not subject to the rule.
  it("never offers a trailing window the data does not reach back to", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000);
    // No `ex-boom` either: this series never spanned 2021–22, so the exclusion would
    // have excluded nothing — see the ex-boom-drops-when-it-excluded-nothing test.
    expect(fitWindows(pts, AS_OF).map((w) => w.window)).toEqual(["full", "12m"]);
  });

  // THE REACH-BACK BOUNDARY. `earliest > cut` — STRICTLY greater. A series whose
  // earliest point lands EXACTLY on the cut date DOES reach back to it. Mutating the
  // check to `earliest >= cut` deletes the 12m window here; no other fixture in this
  // file puts a point on a cut date, so this test is the only thing that catches it.
  it("KEEPS a trailing window whose earliest point lands EXACTLY on the cut date", () => {
    // 06/2025 → 05/2026. AS_OF is 05/31/2026, so the 12m cut is exactly 06/01/2025 —
    // exactly the earliest point. Reaching the cut is reaching back.
    const pts = monthly(new Date(Date.UTC(2025, 5, 1)), 12, 400_000, 1_000);
    const got = fitWindows(pts, AS_OF);
    const twelve = got.find((w) => w.window === "12m");
    expect(twelve).toBeDefined();
    expect(twelve!.fit.n).toBe(12);
    expect(twelve!.fit.from).toBe("06/01/2025");
  });

  // AN EXCLUSION THAT EXCLUDED NOTHING IS A LIE. On a post-boom series `ex-boom` drops
  // zero points, fits identically to `full`, and still claims to have removed the
  // 2021–22 run-up. Task 3 quotes that label into a customer email.
  it("DROPS ex-boom when the series has no boom to exclude", () => {
    const pts = monthly(new Date(Date.UTC(2024, 11, 1)), 18, 400_000, 1_000); // 12/2024 →, no boom
    const got = fitWindows(pts, AS_OF);
    expect(got.map((w) => w.window)).not.toContain("ex-boom");
    // ...and it is dropped precisely BECAUSE it would have duplicated `full`.
    expect(got.find((w) => w.window === "full")!.fit.n).toBe(18);
  });

  it("KEEPS ex-boom when the series really does span the boom", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800); // 06/2015 →, spans 2021–22
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom");
    expect(ex).toBeDefined();
    expect(ex!.fit.n).toBe(132 - 24);
  });

  // "AS OF X" MEANS AS OF X. A point dated after asOf is in no window — not in a
  // trailing one, and not in `full` either.
  it("excludes points dated AFTER asOf from every window, full included", () => {
    // 06/2015 → 07/2026: the last two points (06/2026, 07/2026) postdate AS_OF.
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 134, 200_000, 1_800);
    const got = fitWindows(pts, AS_OF);
    const full = got.find((w) => w.window === "full")!;
    expect(full.fit.n).toBe(132); // the two future points are gone, not fitted
    expect(full.fit.to).toBe("05/01/2026"); // full ends AT the as-of, never past it
    expect(got.find((w) => w.window === "12m")!.fit.n).toBe(12);
  });

  it("offers a trailing window as soon as the data DOES reach back to it", () => {
    // 132 monthly points, 06/2015 → 05/2026: every trailing window is reachable.
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const got = fitWindows(pts, AS_OF);
    expect(got.map((w) => w.window)).toEqual(["full", "10y", "5y", "24m", "12m", "ex-boom"]);
    const n = Object.fromEntries(got.map((w) => [w.window, w.fit.n]));
    expect(n["10y"]).toBe(120);
    expect(n["5y"]).toBe(60);
    expect(n["24m"]).toBe(24);
    expect(n["12m"]).toBe(12);
  });

  it("ex-boom EXCLUDES calendar 2021 and 2022", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom")!;
    expect(ex.fit.n).toBe(132 - 24); // 24 months of 2021+2022 removed
  });

  it("ex-boom ALWAYS discloses what it dropped — an undisclosed exclusion is a lie", () => {
    const pts = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const ex = fitWindows(pts, AS_OF).find((w) => w.window === "ex-boom")!;
    expect(ex.label.toLowerCase()).toContain("excluding");
    expect(ex.label).toContain("2021");
    expect(ex.label).toContain("2022");
  });

  it("does not assume the caller handed us a sorted series", () => {
    // The reach-back check must take the TRUE minimum, not points[0]. A shuffled
    // series that DOES reach back must still be offered every window it earns.
    const asc = monthly(new Date(Date.UTC(2015, 5, 1)), 132, 200_000, 1_800);
    const shuffled = [...asc].reverse();
    expect(fitWindows(shuffled, AS_OF).map((w) => w.window)).toEqual([...FIT_WINDOWS]);
  });

  it("never throws on an empty or tiny series", () => {
    expect(() => fitWindows([], AS_OF)).not.toThrow();
    expect(fitWindows([], AS_OF)).toEqual([]);
  });
});

/** Build a WindowFit from the REAL numbers computed on the lake 07/13/2026. */
function wf(
  window: WindowFit["window"],
  slope: number,
  r2: number,
  n: number,
  ci: [number, number],
): WindowFit {
  const fit: Fit = {
    slope,
    intercept: 0,
    r2,
    n,
    se: 0,
    ci,
    established: ci[0] > 0 || ci[1] < 0,
    tight: r2 >= 0.7,
    from: "06/30/2015",
    to: "05/31/2026",
    at: () => 0,
  };
  // The REAL label, from the one authority that mints it. A stub label here would let
  // the ex-boom run-on (below) sail through a green test — the run-on only exists
  // because the shipped ex-boom label carries a comma of its own.
  return { window, label: labelFor(window), fit };
}

describe("trendVerdict — the comparison is CODE's job, never the model's", () => {
  it("CAPE CORAL -> plateau (long-run up; the last 24 months establish NOTHING)", () => {
    const v = trendVerdict([
      wf("full", 1931, 0.787, 132, [1755, 2107]),
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("5y", -472, 0.105, 60, [-833, -111]),
      wf("24m", -619, 0.151, 24, [-1245, 7]), // CONTAINS ZERO
      wf("12m", 1395, 0.205, 12, [-343, 3132]),
    ])!;
    expect(v.kind).toBe("plateau");
    expect(v.tight).toBe(true);
    // The recent slope's SIGN may not be read: its interval crosses zero.
    expect(v.claim.sentence).not.toContain("619");
  });

  it("LEHIGH ACRES -> reversed (eleven years up; two years down HARD, both strong)", () => {
    const v = trendVerdict([
      wf("full", 1979, 0.887, 132, [1855, 2103]),
      wf("ex-boom", 1923, 0.908, 108, [1804, 2042]),
      wf("5y", 740, 0.213, 60, [366, 1113]),
      wf("24m", -1844, 0.843, 24, [-2183, -1504]), // established, OPPOSITE
      wf("12m", -1977, 0.694, 12, [-2808, -1146]),
    ])!;
    expect(v.kind).toBe("reversed");
    expect(v.tight).toBe(true);
  });

  it("SANIBEL -> plateau, LOOSE (direction IS solid; the FIT is not)", () => {
    const v = trendVerdict([
      wf("full", 3446, 0.334, 131, [2590, 4302]),
      wf("ex-boom", 3055, 0.423, 108, [2361, 3748]),
      wf("5y", -2384, 0.041, 59, [-5435, 667]),
      wf("24m", 317, 0.0, 24, [-9734, 10368]), // establishes nothing
      wf("12m", 13899, 0.072, 12, [-17557, 45355]),
    ])!;
    expect(v.kind).toBe("plateau");
    // "noisy" and "no direction" are DIFFERENT claims. Sanibel's direction is real.
    expect(v.tight).toBe(false);
  });

  it("no-direction when the LONG window establishes nothing", () => {
    const v = trendVerdict([
      wf("full", 120, 0.01, 132, [-400, 640]), // CI contains zero
      wf("24m", 50, 0.0, 24, [-900, 1000]),
    ])!;
    expect(v.kind).toBe("no-direction");
  });

  it("intact when CURRENT agrees with LONG", () => {
    const v = trendVerdict([
      wf("ex-boom", 1800, 0.88, 108, [1670, 1930]),
      wf("24m", 1500, 0.75, 24, [1100, 1900]), // same sign, established
    ])!;
    expect(v.kind).toBe("intact");
  });

  it("returns null when there is no LONG window at all", () => {
    expect(trendVerdict([])).toBeNull();
    expect(trendVerdict([wf("24m", 100, 0.9, 24, [50, 150])])).toBeNull();
  });

  it("THE LICENSE: the verdict is a SettledClaim the claim gate already honors", () => {
    const v = trendVerdict([
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("24m", -619, 0.151, 24, [-1245, 7]),
    ])!;
    // Same shape as compareToSet/settledCount: a sentence + its numeral anchors.
    expect(typeof v.claim.sentence).toBe("string");
    expect(Array.isArray(v.claim.anchors)).toBe(true);
    // Every numeral in the sentence is anchored, so no unanchored-number violation.
    expect(v.claim.anchors.length).toBeGreaterThan(0);
  });

  it("THE FALSIFIER IS COMPUTED, never a blank for the model to fill", () => {
    const v = trendVerdict([
      wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
      wf("24m", -619, 0.151, 24, [-1245, 7]),
    ])!;
    expect(Number.isFinite(v.falsifier.value)).toBe(true);
    expect(v.falsifier.sentence.length).toBeGreaterThan(0);
  });
});

/**
 * ONE VERDICT OF EACH KIND — and every one of them takes `ex-boom` as its LONG window,
 * because ex-boom's label is the one that carries a comma of its own and is therefore the
 * hard case for both the gate and the grammar. A fix that lands on one kind is not a fix.
 */
const VERDICTS: Record<Verdict["kind"], Verdict> = {
  plateau: trendVerdict([
    wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
    wf("24m", -619, 0.151, 24, [-1245, 7]), // CONTAINS ZERO — no readable direction
  ])!,
  intact: trendVerdict([
    wf("ex-boom", 1802, 0.882, 108, [1674, 1930]),
    wf("24m", 1500, 0.75, 24, [1100, 1900]), // same sign, established
  ])!,
  reversed: trendVerdict([
    wf("ex-boom", 1923, 0.908, 108, [1804, 2042]),
    wf("24m", -1844, 0.843, 24, [-2183, -1504]), // established, OPPOSITE
  ])!,
  "no-direction": trendVerdict([
    wf("ex-boom", 120, 0.01, 108, [-400, 640]), // the LONG window's CI contains zero
    wf("24m", 50, 0.0, 24, [-900, 1000]),
  ])!,
};

/**
 * THE VERDICT MUST SURVIVE THE REAL GATE — CLAIM **AND** FALSIFIER.
 *
 * A trend read is an [INFERENCE], and this platform's rules of engagement require every
 * inference to carry its base value AND ONE FALSIFIER in visible copy. The falsifier says
 * "…climb by LESS THAN $1,674 a month" — which is comparative-shaped, and (on the
 * directional kinds) carries a numeral no other settled sentence holds. So unless the
 * falsifier is ITSELF settled, `auditClaims` eats it, the paragraph fails closed to an
 * open slot, and we cannot ship a compliant inference AT ALL. Hence
 * `falsifier: SettledClaim & { value: number; valueLow: number | null }`.
 *
 * NOTE the no-direction falsifier reaches the same death by a DIFFERENT route: both its
 * numbers are the claim's own band edges, so `unanchored-number` CANNOT fire on it. It is
 * the `comparative` shape ("more than $640") that kills it. Word it any other way — "a
 * climb STEEPER THAN $640" — and it sails through the gate unsettled, because `steeper
 * than` is in no regex. The wording is load-bearing; that is what the loop below proves.
 */
describe("trendVerdict SURVIVES auditClaims — the real gate, not a stand-in", () => {
  for (const [kind, v] of Object.entries(VERDICTS)) {
    it(`${kind}: claim and falsifier BOTH pass when BOTH are in the settled set`, () => {
      const settled = [v.claim, v.falsifier];
      expect(auditClaims(v.claim.sentence, settled)).toEqual([]);
      expect(auditClaims(v.falsifier.sentence, settled)).toEqual([]);
      // And together, as the narrator actually restates them — one paragraph.
      expect(auditClaims(`${v.claim.sentence} ${v.falsifier.sentence}`, settled)).toEqual([]);
    });
  }

  // THE FIX IS LOAD-BEARING, and this is the test that proves it. Hand the gate the claim
  // ALONE — exactly what the old `{ value, sentence }` type forced on every caller, since
  // a bare object could not go in a `SettledClaim[]` — and the falsifier DIES.
  it("the falsifier is EATEN when it is not itself settled — the reason it is a SettledClaim", () => {
    for (const v of Object.values(VERDICTS)) {
      expect(auditClaims(v.falsifier.sentence, [v.claim]).length).toBeGreaterThan(0);
    }
  });

  // THE GATE IS NOT INERT. Everything above passes because CODE authored the sentence.
  // A trajectory the MODEL wrote for itself still dies — that is the whole point.
  it("a trajectory the narrator invented for itself still FAILS", () => {
    expect(auditClaims("Prices in Cape Coral are climbing.", []).length).toBeGreaterThan(0);
  });
});

/**
 * THE SENTENCE IS CUSTOMER COPY. It goes out over an agent's signature to their client
 * list, so it has to read as English under BOTH window labels — "full history" AND
 * "full history, excluding the 2021–2022 run-up", which carries a comma of its own.
 *
 * Shipped before this test existed, verbatim:
 *   "Across the full history, excluding the 2021–2022 run-up this market has been
 *    climbing $1,802 a month."
 */
describe("the verdict sentence reads as English under the ex-boom label", () => {
  for (const [kind, v] of Object.entries(VERDICTS)) {
    it(`${kind}: no run-on, and the exclusion is still disclosed`, () => {
      expect(v.long.window).toBe("ex-boom"); // the hard label, on every kind
      // THE RUN-ON: "…the 2021–2022 run-up this market has been climbing…"
      expect(v.claim.sentence).not.toContain("run-up this");
      expect(v.claim.sentence).toContain("run-up, this");
      // AN UNDISCLOSED EXCLUSION IS A LIE BY OMISSION. It survives the rewrite.
      expect(v.claim.sentence).toContain("excluding");
      expect(v.claim.sentence).toContain("2021");
      expect(v.claim.sentence).toContain("2022");
      // The narrator has never seen the document; the sentence may not point at it.
      expect(v.claim.sentence).not.toMatch(/\b(above|below|as shown)\b/i);
    });
  }
});

/**
 * THE PROSE PASS — three defects, caught before phase 2 wired FOUR renderers to them.
 *
 * Every sentence in this module is customer copy: it leaves over an agent's signature,
 * to their client list. It is held to the rules of engagement like any other copy we
 * ship, and it was failing them in three separate ways.
 */
describe("the verdict is CLIENT COPY — it obeys the rules of engagement", () => {
  // DEFECT 1 — JARGON IN AN AGENT'S EMAIL (rules of engagement #5: no jargon).
  // The no-direction falsifier shipped THREE pieces in one sentence: "A direction becomes
  // readable only once a FITTED SLOPE's 95% INTERVAL CLEARS ZERO." That is a note about
  // our arithmetic, mailed to somebody's client.
  const JARGON =
    /\b(fitted (slope|line)|95%|confidence interval|interval clears|statistically|significan\w+|p-value|r²|r2|regression|least.squares|slope|std|standard error)\b/i;

  for (const [kind, v] of Object.entries(VERDICTS)) {
    it(`${kind}: neither the claim nor the falsifier speaks statistics`, () => {
      expect(v.claim.sentence).not.toMatch(JARGON);
      expect(v.falsifier.sentence).not.toMatch(JARGON);
    });

    // DEFECT 3 — THE VOICE SPLIT. no-direction said "this series"; the other three said
    // "this market". Same town, same email, two different subjects — one of which tells
    // the reader they are looking at a spreadsheet.
    it(`${kind}: the subject is "this market", never "this series"`, () => {
      expect(v.claim.sentence).toContain("this market");
      expect(v.claim.sentence).not.toContain("this series");
    });

    // A FALSIFIER NAMES A BREAKING CONDITION — a pace the market would have to print.
    // "A direction becomes readable once…" names none: nothing it describes could ever
    // come true or fail to. Every kind states a dollar pace per month.
    it(`${kind}: the falsifier states a PACE the market could actually print`, () => {
      expect(v.falsifier.sentence).toMatch(/breaks/i);
      expect(v.falsifier.sentence).toMatch(/\$[\d,]+ a month/);
    });
  }

  // DEFECT 2 — THE BOUND IS A RATE, AND THE SENTENCE CALLED IT A DEVIATION.
  //
  // Shipped: "…the next two months move AGAINST the fitted line by more than $1,674 a
  // month." `ci[0]` is the slowest CLIMB the history supports — not a permitted wobble
  // around the line. Read literally, the old sentence was a far weaker test than the one
  // we meant: Cape Coral's climb could collapse from $1,802 a month to DEAD FLAT without
  // ever "moving against the line by more than $1,674", so the read survived its own
  // refutation. It only broke once the market actively fell.
  it("the directional falsifier breaks on a SLOWING climb, not only on a decline", () => {
    const v = VERDICTS.intact; // 24m ci [1100, 1900]
    expect(v.falsifier.sentence).toContain("climb by less than $1,100 a month");
    // The old framing, and the jargon it carried in with it. Never again.
    expect(v.falsifier.sentence).not.toMatch(/against/i);
  });

  it("a FALLING market's falsifier breaks on a slowing fall — the mirror of the above", () => {
    const v = trendVerdict([
      wf("ex-boom", -1802, 0.88, 108, [-1930, -1674]), // established DOWN
      wf("24m", -1500, 0.75, 24, [-1900, -1100]),
    ])!;
    expect(v.kind).toBe("intact"); // same sign, both established
    expect(v.falsifier.sentence).toContain("fall by less than $1,100 a month");
    expect(v.falsifier.value).toBe(-1100); // the bound NEAREST ZERO — ci[1] when down
  });

  /**
   * DEFECT 2, ONE LAYER DOWN — **THE FALSIFIER THAT WAS ALREADY TRUE WHEN PRINTED.**
   *
   * Fixing the rate/deviation confusion exposed the bug underneath it. The threshold came
   * from the LONG window's interval, but the sentence tested the NEXT TWO MONTHS — and the
   * claim, two sentences earlier, had already reported a recent pace on the wrong side of
   * it. Shipped, in one breath:
   *
   *   "The last 24 months are still climbing, at $1,500 a month.
   *    This read breaks if the next two months climb by less than $1,674 a month."
   *
   * $1,500 is less than $1,674. The read refuted itself. `reversed` was worse: it declared
   * the market had TURNED and was FALLING $1,844 a month, then staked the read on the next
   * two months CLIMBING $1,804.
   *
   * The cause is the module's own opening thesis: an eleven-year bound and a two-month
   * horizon are different windows, and they disagree freely (+$1,931/mo over eleven years,
   * −$619/mo over twenty-four months, BOTH TRUE). So the horizon and the bound must come
   * from THE SAME WINDOW — and this is the assertion that holds them there.
   */
  it("NO FALSIFIER IS ALREADY TRUE THE MOMENT IT IS PRINTED", () => {
    // A one-sided threshold is keyed to the window whose pace the claim reports, and a
    // fit's slope always sits strictly INSIDE its own interval. So |slope| > |bound
    // nearest zero|, ALWAYS: the market the claim just described cannot already have
    // failed the test the falsifier just set.
    for (const kind of ["intact", "reversed"] as const) {
      const v = VERDICTS[kind];
      expect(v.falsifier.valueLow).toBeNull(); // a real threshold
      expect(Math.abs(v.current!.fit.slope)).toBeGreaterThan(Math.abs(v.falsifier.value));
      // …and it is keyed to the CURRENT window — the one the sentence is about.
      expect(v.falsifier.sentence).toContain("the last 24 months");
    }
    // The band kinds cannot be already-true either: a band drawn from the data STRADDLES
    // flat by construction, so the very data that drew it has not cleared it.
    for (const kind of ["plateau", "no-direction"] as const) {
      const v = VERDICTS[kind];
      expect(v.falsifier.valueLow).not.toBeNull();
      expect(v.falsifier.valueLow!).toBeLessThanOrEqual(0);
      expect(v.falsifier.value).toBeGreaterThanOrEqual(0);
    }
  });

  // A REVERSED READ STAKES THE TURN — not the old direction resuming. The long-run bound
  // demanded a market we had just called FALLING go back to climbing $1,804 a month.
  it("reversed: the falsifier stakes the TURN, in the turn's own direction", () => {
    const v = VERDICTS.reversed; // 24m −1844, ci [−2183, −1504]
    expect(v.claim.sentence).toContain("The direction has turned.");
    expect(v.falsifier.sentence).toContain("fall by less than $1,504 a month");
    expect(v.falsifier.sentence).toContain("the turn still supports");
    expect(v.falsifier.value).toBe(-1504);
  });

  // DEFECT 1, THE OTHER HALF — `value: 0` IS NOT A BASE VALUE.
  // The rules require an inference to carry the audited base value. Zero was the number
  // the interval had to clear, which is a fact about our method, not about the market.
  // The honest base value of an unestablished fit is the SPREAD it still allows.
  it("no-direction: the base value is the BAND, and the break is TWO-SIDED", () => {
    const v = VERDICTS["no-direction"]; // ex-boom ci [-400, 640]
    // The band is quoted in the copy — that is the base value a reader can check, and it
    // is the ONLY one this kind has (the slope's sign may not be read at all).
    expect(v.falsifier.sentence).toContain("from a $400 a month slide to a $640 a month climb");
    // TWO-SIDED, and it must be: a one-sided break would have to pick a side, and picking
    // a side means reading the sign of a slope this module just ruled UNREADABLE.
    expect(v.falsifier.sentence).toContain("settles on a direction of its own");
    expect(v.falsifier.value).toBe(640); // climb edge
    expect(v.falsifier.valueLow).toBe(-400); // slide edge
    expect(v.falsifier.value).not.toBe(0); // the old sentinel
  });

  /**
   * THE KNIFE-EDGE THE FIXTURE WAS HIDING.
   *
   * no-direction used to threshold its band edges — "a climb of MORE THAN $640 a month, or
   * a slide of MORE THAN $400 a month" — and on the tidy [−400, 640] fixture that reads
   * fine. It is the SAME construction the plateau branch refuses to print, and its
   * absurdity is data-dependent, not kind-dependent. Give it a lopsided band that still
   * straddles flat and it shipped, live:
   *
   *   "a climb of more than $15 A MONTH, or a slide of more than $2,000 a month"
   *
   * $15 is not a breaking pace. It is where the band ENDS — a pace a hair past it does not
   * pull the refit clear of flat, so the sentence promised a break that would not happen.
   * A band is quoted as a BAND, at BOTH windows. One construction, no knife-edges.
   */
  it("a LOPSIDED flat band never dresses its edge up as a breaking pace", () => {
    const v = trendVerdict([
      wf("ex-boom", -900, 0.2, 108, [-2000, 15]), // straddles flat, hard against one side
      wf("24m", -50, 0.0, 24, [-900, 800]),
    ])!;
    expect(v.kind).toBe("no-direction");
    // The edge is REPORTED (it is the band), never THRESHOLDED.
    expect(v.falsifier.sentence).toContain("from a $2,000 a month slide to a $15 a month climb");
    expect(v.falsifier.sentence).not.toMatch(/(more|less) than \$15\b/);
    expect(v.falsifier.sentence).not.toMatch(/more than/i);
    // Still dies when it is not itself settled — by `unanchored-number`, since the band
    // edges appear in no other settled sentence. That is the whole gate for this kind.
    expect(auditClaims(v.falsifier.sentence, [v.claim]).length).toBeGreaterThan(0);
    expect(auditClaims(v.falsifier.sentence, [v.claim, v.falsifier])).toEqual([]);
  });

  // A PLATEAU DENIES A TURN, so that is what it stakes — one-sided, and keyed to the LONG
  // direction, which IS readable. The recent band is quoted as a BAND: Cape's runs from a
  // $1,245/mo fall to a $7/mo climb — a hair from establishing the turn, still touching
  // flat. "$7 a month" is where the band ENDS. A sentence calling it a breaking pace would
  // be lying about its own number, so no sentence here does.
  it("plateau: the break is the TURN; the band's edges are quoted as a band, not a threshold", () => {
    const v = VERDICTS.plateau; // long UP; 24m ci [-1245, 7]
    expect(v.falsifier.sentence).toContain("establish a fall of their own");
    expect(v.falsifier.sentence).toContain("from a $1,245 a month fall to a $7 a month climb");
    // The band edge is NEVER dressed up as a pace that breaks something.
    expect(v.falsifier.sentence).not.toMatch(/(more|less) than \$7\b/);
    expect(v.falsifier.valueLow).toBe(-1245);
    expect(v.falsifier.value).toBe(7);
  });

  /**
   * THE VERDICT REPORTED A FINDING FROM A WINDOW IT NEVER FIT.
   *
   * `plateau` also fires when there is NO 24m window at all — an 18-month series cannot
   * reach back two years, so `fitWindows` never offers one. The sentence said anyway:
   * "The last 24 months do not establish a direction either way." We did not fit the last
   * 24 months. They do not exist. That is the label-outrunning-its-data sin this module
   * opens with, committed by the verdict itself — and a falsifier keyed to a null window
   * would have thrown on top of it.
   */
  it("plateau with NO recent window: says so, and stakes the long run instead", () => {
    const v = trendVerdict([wf("full", 1802, 0.88, 18, [1674, 1930])])!; // no 24m at all
    expect(v.kind).toBe("plateau");
    expect(v.current).toBeNull();
    // It may not report a finding about months it never fitted.
    expect(v.claim.sentence).not.toContain("do not establish");
    expect(v.claim.sentence).toContain("We hold no two-year window");
    // With no recent window the only claim is the long run — so THAT is what it stakes,
    // on the long run's own horizon. A real threshold, not a band.
    expect(v.falsifier.sentence).toContain("full-history pace to less than $1,674 a month");
    expect(v.falsifier.value).toBe(1674);
    expect(v.falsifier.valueLow).toBeNull();
    // And it still survives the real gate, both ways.
    expect(auditClaims(v.falsifier.sentence, [v.claim, v.falsifier])).toEqual([]);
    expect(auditClaims(v.falsifier.sentence, [v.claim]).length).toBeGreaterThan(0);
  });
});
