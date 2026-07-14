// lib/charts/fit-overlay.test.ts
//
// The suite was green over every one of the six prose defects fixed on 07/14. Green is
// not evidence. So this file does two things a passing assertion cannot: it holds the
// PICTURE and the SENTENCE in lockstep, and it PRINTS what a reader would actually see.

import { describe, expect, test } from "bun:test";
import { fitLine, type FitPoint } from "./fit-line";
import { fitWindows, trendVerdict, windowRead, type Verdict } from "./series-fit";
import {
  fitOverlay,
  hydrateOverlay,
  observedForChart,
  overlayClaims,
  serializeOverlay,
  verdictAgreesWithOverlay,
  windowClaims,
  windowViews,
} from "./fit-overlay";
import { fitTrendSvg } from "./svg/fit-trend";

const ASOF = new Date(Date.UTC(2026, 4, 31));

/** Monthly points ending at `asOf`, from a slope + noise. Deterministic — no Math.random. */
function series(n: number, start: number, perMonth: number, wobble = 0): FitPoint[] {
  const out: FitPoint[] = [];
  for (let i = 0; i < n; i++) {
    const when = new Date(Date.UTC(2026, 4 - (n - 1 - i), 1));
    // A fixed, repeating zig-zag: reproducible scatter with zero randomness.
    const noise = wobble * [0, 1, -1, 0.5, -0.5, 0.8, -0.8][i % 7];
    out.push({ when, y: start + perMonth * i + noise });
  }
  return out;
}

function verdictFor(pts: FitPoint[]): Verdict {
  const v = trendVerdict(fitWindows(pts, ASOF));
  if (!v) throw new Error("no verdict — the fixture is too short to fit");
  return v;
}

describe("bandAt — the fan is the CI on the pace, drawn", () => {
  const fit = fitLine(series(60, 300_000, 1_000, 20_000))!;

  test("its edges ARE the confidence interval on the slope — not a prediction band", () => {
    // Two dates one month apart: the fan's edges must climb at exactly ci[0] and ci[1].
    const a = new Date(Date.UTC(2024, 0, 1));
    const b = new Date(Date.UTC(2024, 1, 1));
    const [aLo, aHi] = fit.bandAt(a);
    const [bLo, bHi] = fit.bandAt(b);
    const [ciLo, ciHi] = fit.ci;
    // The fan's lower edge rises at the LOW pace; its upper edge at the HIGH pace.
    expect(bLo - aLo).toBeCloseTo(ciLo, 6);
    expect(bHi - aHi).toBeCloseTo(ciHi, 6);
  });

  test("the fitted line is the fan's midline at every date — they cannot drift apart", () => {
    for (const d of [fit.fromDate, new Date(Date.UTC(2023, 6, 1)), fit.toDate]) {
      const [lo, hi] = fit.bandAt(d);
      expect(fit.at(d)).toBeGreaterThanOrEqual(lo - 1e-6);
      expect(fit.at(d)).toBeLessThanOrEqual(hi + 1e-6);
    }
  });

  test("it PINCHES at the centroid and OPENS toward the ends — the pace is what is unknown", () => {
    const mid = new Date(Date.UTC(2023, 10, 1)); // ~centre of a 60-month series ending 05/2026
    const width = (d: Date) => {
      const [lo, hi] = fit.bandAt(d);
      return hi - lo;
    };
    expect(width(mid)).toBeLessThan(width(fit.fromDate));
    expect(width(mid)).toBeLessThan(width(fit.toDate));
  });
});

describe("THE LAW: an unestablished window gets a FAN, and the fan has NO LINE in it", () => {
  test("a directionless series draws no line ANYWHERE — not even the midline", () => {
    // Pure zig-zag, zero underlying slope: the interval cannot clear zero.
    const v = verdictFor(series(60, 400_000, 0, 30_000));
    expect(v.kind).toBe("no-direction");
    const o = fitOverlay(v);

    expect(o.long.line).toBeNull();
    expect(o.long.fan).not.toBeNull();
    // THE WHOLE POINT. The slope has a sign; we may not read it — so it must not leak
    // out as a direction, which is how it would reach a colour.
    expect(o.long.direction).toBeNull();
    expect(o.direction).toBeNull();
  });

  test("an established series draws the line, and the fan is withheld", () => {
    const v = verdictFor(series(60, 300_000, 2_000, 15_000));
    const o = fitOverlay(v);
    expect(o.long.line).not.toBeNull();
    expect(o.long.fan).toBeNull();
    expect(o.long.direction).toBe("up");
  });
});

describe("THE DIRECTION A SURFACE READS is the most recent READABLE one", () => {
  // The real Cape Coral series (redfin, 132 months) fits `reversed`: the long run climbs
  // $1,794/mo, the last 24 months FALL $1,201/mo. `direction` was the long window's, so it
  // shipped "up" on a market the copy called turned and falling. A badge keyed to it would
  // have pointed up. No fixture reversed, so nothing failed.
  const reversedPts: FitPoint[] = [
    ...series(84, 200_000, 2_000, 6_000).slice(0, 60),
    ...Array.from({ length: 24 }, (_, i) => ({
      when: new Date(Date.UTC(2026, 4 - (23 - i), 1)),
      y: 400_000 - 1_200 * i + 6_000 * [0, 1, -1, 0.5, -0.5, 0.8, -0.8][i % 7],
    })),
  ];

  test("REVERSED points DOWN, not up — the turn is the claim", () => {
    const v = verdictFor(reversedPts);
    expect(v.kind).toBe("reversed");
    const o = fitOverlay(v);
    expect(o.long.direction).toBe("up"); // the long run really did climb
    expect(o.current!.direction).toBe("down"); // and it really has turned
    // The surface must read the market as it is NOW.
    expect(o.direction).toBe("down");
  });

  test("PLATEAU falls back to the long run — the recent window has nothing to say", () => {
    const pts = series(60, 300_000, 2_000, 10_000).map((p, i, all) => {
      if (i < all.length - 24) return p;
      const base = all[all.length - 24].y;
      return { when: p.when, y: base + 25_000 * [0, 1, -1, 0.5, -0.5, 0.8, -0.8][i % 7] };
    });
    const v = verdictFor(pts);
    expect(v.kind).toBe("plateau");
    const o = fitOverlay(v);
    expect(o.current!.direction).toBeNull(); // unreadable — contributes nothing
    expect(o.direction).toBe("up"); // so the long run's readable direction stands
  });
});

describe("NO-DIRECTION draws NOTHING about the recent window — the copy never licensed it", () => {
  test("an established recent window is still not drawn when the long run is directionless", () => {
    // Long run: flat and noisy → no direction. Recent 24 months: a hard, real climb.
    // `trendVerdict` never looks at the recent window in this branch, so its sentence is a
    // blanket "no direction either way". Draw a confident recent line under that sentence
    // and the page contradicts itself — and the line wins.
    const pts: FitPoint[] = [
      // 84 months of pure scatter — the full-history slope lands at −$58/mo with a CI of
      // [−240, +124], which straddles zero. Directionless, for real.
      ...Array.from({ length: 84 }, (_, i) => ({
        when: new Date(Date.UTC(2026, 4 - (107 - i), 1)),
        y: 450_000 + 45_000 * [0, 1, -1, 0.5, -0.5, 0.8, -0.8][i % 7],
      })),
      // ...and then a clean, tight $1,200/mo climb over the last 24. Established on its own.
      ...Array.from({ length: 24 }, (_, i) => ({
        when: new Date(Date.UTC(2026, 4 - (23 - i), 1)),
        y: 430_000 + 1_200 * i,
      })),
    ];
    const v = verdictFor(pts);
    expect(v.kind).toBe("no-direction");
    // The engine DID fit a 24-month window, and it IS established...
    expect(v.current?.fit.established).toBe(true);

    const o = fitOverlay(v);
    // ...and the chart draws NOTHING for it anyway. No sentence settled it.
    expect(o.current).toBeNull();
    expect(o.direction).toBeNull();
    expect(o.long.fan).not.toBeNull();

    const svg = fitTrendSvg(observedForChart(pts), o, { title: "Nowhere" });
    // Not one crisp fitted stroke anywhere on the picture.
    expect(svg).not.toContain('stroke-opacity="0.85"');
  });
});

describe("THE PICTURE AND THE SENTENCE CANNOT COME APART", () => {
  // Every shape the engine can produce — including the two `plateau` lands on.
  const cases: Array<[string, FitPoint[]]> = [
    ["intact (long up, recent up)", series(60, 300_000, 2_000, 10_000)],
    ["no-direction (flat, noisy)", series(60, 400_000, 0, 30_000)],
    [
      "reversed (long up, recent down)",
      [
        ...series(60, 300_000, 3_000, 5_000).slice(0, 36),
        ...series(24, 420_000, -3_000, 5_000).map((p, i) => ({
          when: new Date(Date.UTC(2026, 4 - (23 - i), 1)),
          y: 420_000 - 3_000 * i,
        })),
      ],
    ],
    ["plateau (long up, recent unreadable)", series(60, 300_000, 2_000, 10_000).map(flatten24)],
  ];

  /** Flatten the trailing 24 months into noise so the recent window establishes nothing. */
  function flatten24(p: FitPoint, i: number, all: FitPoint[]): FitPoint {
    if (i < all.length - 24) return p;
    const base = all[all.length - 24].y;
    return { when: p.when, y: base + 25_000 * [0, 1, -1, 0.5, -0.5, 0.8, -0.8][i % 7] };
  }

  for (const [name, pts] of cases) {
    test(`${name} — verdict and overlay agree`, () => {
      const v = verdictFor(pts);
      const o = fitOverlay(v);
      // The copy branches on `falsifier.valueLow`; the picture branches on `established`.
      // If these two encodings ever disagree, a surface draws a line over a sentence that
      // says no direction can be read.
      expect(verdictAgreesWithOverlay(v, o)).toBe(true);
    });

    test(`${name} — BOTH sentences are handed to the gate`, () => {
      const v = verdictFor(pts);
      // Pass only `claim` and the gate eats the falsifier. This is the shape that ships.
      expect(overlayClaims(v)).toHaveLength(2);
      expect(overlayClaims(v)[0]).toBe(v.claim);
      expect(overlayClaims(v)[1]).toBe(v.falsifier);
    });

    test(`${name} — the fit survives the RSC boundary unchanged`, () => {
      const o = fitOverlay(verdictFor(pts));
      const back = hydrateOverlay(serializeOverlay(o));
      expect(back.direction).toBe(o.direction);
      expect(!!back.long.line).toBe(!!o.long.line);
      expect(!!back.long.fan).toBe(!!o.long.fan);
      expect(back.long.line?.to.y ?? back.long.fan?.hi.to.y).toBeCloseTo(
        o.long.line?.to.y ?? o.long.fan!.hi.to.y,
        6,
      );
      // A Date that crossed as a string and came back as a string would silently draw
      // nothing — the scale would return undefined and the path would collapse.
      expect(back.long.line?.to.when ?? back.long.fan?.hi.to.when).toBeInstanceOf(Date);
    });

    test(`${name} — the SVG never draws a fan edge as a stroked line`, () => {
      const v = verdictFor(pts);
      const o = fitOverlay(v);
      const svg = fitTrendSvg(observedForChart(pts), o, { title: "Test" });
      expect(svg).toContain("<svg");

      const unreadable = [o.long, o.current].filter((l) => l?.fan);
      for (const _ of unreadable) {
        // The fan is a FILL. If it ever gains a stroke, a reader follows the edge as a
        // line — which is the sign of a slope we ruled unreadable.
        expect(svg).toContain('fill-opacity="0.16" stroke="none"');
      }
    });
  }
});

describe("the observed series is drawn IN FRONT of the fit — the z-order is the argument", () => {
  test("every fit layer is painted before the observed polyline", () => {
    const pts = series(60, 300_000, 2_000, 10_000);
    const o = fitOverlay(verdictFor(pts));
    const svg = fitTrendSvg(observedForChart(pts), o, { title: "Cape Coral" });
    const lastGlow = svg.lastIndexOf('stroke-opacity="0.85"'); // the fit's brightest layer
    const hero = svg.indexOf("<polyline"); // the observed series
    expect(lastGlow).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(lastGlow);
  });

  test("the end label quotes the last OBSERVED value, never a fitted one", () => {
    const pts = series(60, 300_000, 2_000, 10_000);
    const o = fitOverlay(verdictFor(pts));
    const svg = fitTrendSvg(observedForChart(pts), o, { title: "Cape Coral", valueFormat: "usd" });
    const last = pts[pts.length - 1].y;
    const fitted = o.long.line!.to.y;
    expect(Math.round(last)).not.toBe(Math.round(fitted)); // the fixture must actually differ
    expect(svg).toContain(`$${Math.round(last / 1000)}k`);
  });
});

describe("THE WINDOW MENU — every row earns its own line AND its own sentence", () => {
  const pts = series(132, 180_000, 1_900, 25_000);
  const fits = fitWindows(pts, ASOF);
  const views = windowViews(fits);

  test("the menu is exactly what fitWindows earned — never a synthesized row", () => {
    expect(views.map((v) => v.window)).toEqual(fits.map((f) => f.window));
    // Nothing thin, short-reaching, or excluded-nothing gets a button.
    for (const f of fits) expect(f.fit.n).toBeGreaterThanOrEqual(12);
  });

  test("EVERY row has a line XOR a fan — never both, never neither", () => {
    for (const v of views) {
      const hasLine = !!v.layer.line;
      const hasFan = !!v.layer.fan;
      expect(hasLine !== hasFan).toBe(true);
      // A fan may never leak a direction — that is the sign we ruled unreadable.
      if (hasFan) expect(v.layer.direction).toBeNull();
    }
  });

  test("NO WINDOW'S FALSIFIER IS ALREADY TRUE THE MOMENT IT IS PRINTED", () => {
    // The phase-1 bug, one window over: a claim of "$1,500/mo" under a falsifier saying
    // "breaks below $1,674/mo". A slope sits STRICTLY inside its own interval, so keying
    // each read to its OWN window makes this construction impossible to violate. Proven,
    // not asserted.
    for (const f of fits) {
      if (!f.fit.established) continue;
      const nearestZero = f.fit.slope > 0 ? f.fit.ci[0] : f.fit.ci[1];
      expect(Math.abs(f.fit.slope)).toBeGreaterThan(Math.abs(nearestZero));
    }
  });

  test("an unestablished window quotes its band ONLY in the falsifier, never in the claim", () => {
    // Load-bearing against the gate: the band falsifier has no comparative shape, so the
    // only thing keeping it settled is `unanchored-number` — its edges must appear in NO
    // other settled sentence. Quote an edge in the claim and the falsifier walks through
    // unsettled and gets deleted.
    const usd0 = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
    for (const f of fits) {
      if (f.fit.established) continue;
      const { claim, falsifier } = windowRead(f);
      // The BAND EDGES are the numerals that matter. ("last 12 months" carries a numeral
      // too — that is the window's NAME, not a pace, and anchoring it costs nothing.)
      expect(claim.sentence).not.toContain(usd0(f.fit.ci[0]));
      expect(claim.sentence).not.toContain(usd0(f.fit.ci[1]));
      expect(falsifier.sentence).toContain(usd0(f.fit.ci[0]));
      expect(falsifier.sentence).toContain(usd0(f.fit.ci[1]));
      expect(falsifier.valueLow).not.toBeNull();
      // And no comparative shape — "more than"/"less than" is what the gate reads as a
      // threshold. A band is not a threshold and must not be dressed as one.
      expect(falsifier.sentence).not.toContain("more than");
      expect(falsifier.sentence).not.toContain("less than");
    }
  });

  test("BOTH sentences go to the gate, per window", () => {
    for (const f of fits) {
      const claims = windowClaims(f);
      expect(claims).toHaveLength(2);
      expect(claims[0].sentence).not.toBe(claims[1].sentence);
    }
  });

  test("the ex-boom row still discloses the exclusion in its label", () => {
    const exb = views.find((v) => v.window === "ex-boom");
    if (exb) {
      expect(exb.label).toContain("excluding the 2021–2022 run-up");
      expect(exb.claim).toContain("excluding the 2021–2022 run-up");
    }
  });

  test("PRINT THE MENU — every row, as a reader would see it", () => {
    console.log(`\n──── THE WINDOW MENU (${views.length} rows earned) ────`);
    for (const v of views) {
      console.log(
        `\n  [${v.window}] ${v.layer.line ? "LINE" : "FAN "}  ${v.layer.direction ?? "no direction"}`,
      );
      console.log(`     ${v.claim}`);
      console.log(`     ${v.falsifier}`);
    }
    expect(views.length).toBeGreaterThan(0);
  });
});

describe("PRINT THE SENTENCES — green is not evidence", () => {
  test("every kind, as a reader would see it", () => {
    const shapes: Array<[string, FitPoint[]]> = [
      ["INTACT", series(60, 300_000, 2_000, 10_000)],
      ["NO-DIRECTION", series(60, 400_000, 0, 30_000)],
    ];
    for (const [name, pts] of shapes) {
      const v = verdictFor(pts);
      const o = fitOverlay(v);
      console.log(`\n──── ${name} (${v.kind}) ────`);
      console.log(`  claim:     ${o.claim}`);
      console.log(`  falsifier: ${o.falsifier}`);
      console.log(
        `  draws:     long=${o.long.line ? "LINE" : "FAN"} current=${
          o.current ? (o.current.line ? "LINE" : "FAN") : "—"
        } colour=${o.direction ?? "neutral (unreadable)"}`,
      );
      expect(o.claim.length).toBeGreaterThan(0);
      expect(o.falsifier.length).toBeGreaterThan(0);
    }
  });
});
