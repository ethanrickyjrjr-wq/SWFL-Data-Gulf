/**
 * tier_divergence_zip_latest VIEW ⇆ _tier-divergence-oracle equivalence (load-bearing).
 *
 * The brain reads `data_lake.tier_divergence_zip_latest`; the oracle
 * (`_tier-divergence-oracle.mts`) is an independent TS reimplementation. This test
 * pins that the VIEW's `tier_spread_yoy_pct` equals the ORACLE's on the three crafted
 * period-matching cases — the silent-corruption-prone boundary (mirrors the
 * zhvi-zip-latest parity test). The spread-YoY leg is the trickiest: it looks back in
 * the BOTH-PRESENT series, anchored to the latest both-present period, ±7d MAX-window.
 * The bottom/top YoY legs use the identical ±7d pattern already pinned by the ZHVI test.
 *
 *   1. GAPPED       — no both-present row within ±7d of (latest − 12mo) → both NULL.
 *   2. DRIFTED      — the only candidate sits >7d off target → both NULL.
 *   3. TWO-IN-WINDOW — two both-present rows inside ±7d; both must pick the NEWER
 *                      (MAX-within-window), NOT the closer-to-target (locked rule).
 *
 * The view side runs the view's VERBATIM spread-YoY subquery (see
 * docs/sql/20260614_tier_divergence_views.sql) against a TEMP table in a rolled-back
 * tx via psycopg — touches no live data. Skips (never false-greens) without DB creds.
 */
import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildTierDivergenceSnapshots,
  type TierDivergenceRawRow,
} from "./_tier-divergence-oracle.mts";
import { dbUri, pythonBin, gateDescribe } from "./_db-parity-harness.mts";

/**
 * Run the view's VERBATIM spread-YoY selection SQL for each ZIP against a TEMP table
 * seeded with `rows`, inside a rolled-back tx. Returns { zip: spread_yoy|null }.
 */
function viewSpreadYoyByZip(
  rows: TierDivergenceRawRow[],
  uri: string,
  py: string,
): Record<string, number | null> {
  const dir = mkdtempSync(path.join(tmpdir(), "tier-eqv-"));
  const rowsPath = path.join(dir, "rows.json");
  const outPath = path.join(dir, "out.json");
  writeFileSync(rowsPath, JSON.stringify(rows));

  const script = `
import json, psycopg
uri = ${JSON.stringify(uri)}
rows = json.load(open(${JSON.stringify(rowsPath)}))
out = {}
with psycopg.connect(uri) as conn:
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE _tier_eqv (zip_code text, period_end date, top_tier_value double precision, bottom_tier_value double precision) ON COMMIT DROP")
        cur.executemany("INSERT INTO _tier_eqv (zip_code, period_end, top_tier_value, bottom_tier_value) VALUES (%s,%s,%s,%s)",
                        [(r["zip_code"], r["period_end"], r["top_tier_value"], r["bottom_tier_value"]) for r in rows])
        # latest BOTH-present anchor (DISTINCT ON), mirrors the view's CTE
        cur.execute("""
          WITH latest AS (
            SELECT DISTINCT ON (zip_code)
              zip_code, period_end AS latest_period,
              top_tier_value::float8 AS top_tier_value_latest,
              bottom_tier_value::float8 AS bottom_tier_value_latest
            FROM _tier_eqv
            WHERE top_tier_value IS NOT NULL AND bottom_tier_value IS NOT NULL
            ORDER BY zip_code, period_end DESC
          )
          SELECT l.zip_code,
            ( (l.top_tier_value_latest / NULLIF(l.bottom_tier_value_latest, 0))
              / NULLIF((SELECT z.top_tier_value::float8 / NULLIF(z.bottom_tier_value::float8, 0)
                          FROM _tier_eqv z
                         WHERE z.zip_code = l.zip_code
                           AND z.top_tier_value IS NOT NULL
                           AND z.bottom_tier_value IS NOT NULL
                           AND z.period_end BETWEEN l.latest_period - INTERVAL '12 months' - INTERVAL '7 days'
                                                AND l.latest_period - INTERVAL '12 months' + INTERVAL '7 days'
                         ORDER BY z.period_end DESC LIMIT 1), 0) - 1) * 100 AS tier_spread_yoy_pct
          FROM latest l
        """)
        for zip_code, yoy in cur.fetchall():
            out[zip_code] = None if yoy is None else float(yoy)
    conn.rollback()  # touch no live data
json.dump(out, open(${JSON.stringify(outPath)}, "w"))
`;
  const r = spawnSync(py, ["-c", script], { encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`view-SQL subprocess failed:\n${r.stderr}\n${r.stdout}`);
  }
  return JSON.parse(readFileSync(outPath, "utf-8")) as Record<string, number | null>;
}

/** Run the oracle and pull each ZIP's tier_spread_yoy_pct (null when undefined). */
function oracleSpreadYoyByZip(rows: TierDivergenceRawRow[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of buildTierDivergenceSnapshots(rows)) out[s.zip_code] = s.tier_spread_yoy_pct;
  return out;
}

/**
 * Run the view's VERBATIM 3-month-trailing-average LEVEL ratio SQL (the `smoothed`
 * CTE) for each ZIP against a TEMP table. Returns { zip: tier_spread_ratio|null }.
 */
function viewSpreadRatioByZip(
  rows: TierDivergenceRawRow[],
  uri: string,
  py: string,
): Record<string, number | null> {
  const dir = mkdtempSync(path.join(tmpdir(), "tier-ratio-"));
  const rowsPath = path.join(dir, "rows.json");
  const outPath = path.join(dir, "out.json");
  writeFileSync(rowsPath, JSON.stringify(rows));
  const script = `
import json, psycopg
uri = ${JSON.stringify(uri)}
rows = json.load(open(${JSON.stringify(rowsPath)}))
out = {}
with psycopg.connect(uri) as conn:
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE _tier_eqv (zip_code text, period_end date, top_tier_value double precision, bottom_tier_value double precision) ON COMMIT DROP")
        cur.executemany("INSERT INTO _tier_eqv (zip_code, period_end, top_tier_value, bottom_tier_value) VALUES (%s,%s,%s,%s)",
                        [(r["zip_code"], r["period_end"], r["top_tier_value"], r["bottom_tier_value"]) for r in rows])
        cur.execute("""
          WITH latest AS (
            SELECT DISTINCT ON (zip_code) zip_code, period_end AS latest_period
            FROM _tier_eqv WHERE top_tier_value IS NOT NULL AND bottom_tier_value IS NOT NULL
            ORDER BY zip_code, period_end DESC
          )
          SELECT l.zip_code,
            (SELECT AVG(z.top_tier_value::float8) FROM _tier_eqv z
               WHERE z.zip_code=l.zip_code AND z.top_tier_value IS NOT NULL
                 AND z.period_end <= l.latest_period
                 AND date_trunc('month', z.period_end) > date_trunc('month', l.latest_period) - INTERVAL '3 months')
            / NULLIF((SELECT AVG(z.bottom_tier_value::float8) FROM _tier_eqv z
               WHERE z.zip_code=l.zip_code AND z.bottom_tier_value IS NOT NULL
                 AND z.period_end <= l.latest_period
                 AND date_trunc('month', z.period_end) > date_trunc('month', l.latest_period) - INTERVAL '3 months'), 0) AS tier_spread_ratio
          FROM latest l
        """)
        for zip_code, ratio in cur.fetchall():
            out[zip_code] = None if ratio is None else float(ratio)
    conn.rollback()
json.dump(out, open(${JSON.stringify(outPath)}, "w"))
`;
  const r = spawnSync(py, ["-c", script], { encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`view-ratio-SQL subprocess failed:\n${r.stderr}\n${r.stdout}`);
  }
  return JSON.parse(readFileSync(outPath, "utf-8")) as Record<string, number | null>;
}

/** Oracle's tier_spread_ratio (the 3m-avg LEVEL) per ZIP. */
function oracleSpreadRatioByZip(rows: TierDivergenceRawRow[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of buildTierDivergenceSnapshots(rows)) {
    out[s.zip_code] = Number.isFinite(s.tier_spread_ratio) ? s.tier_spread_ratio : null;
  }
  return out;
}

const META = { metro: "Cape Coral-Fort Myers, FL", county_name: "Lee County", city: "Test City" };
// Bottom held constant at 100000 so the spread scales with the top tier (keeps the
// crafted YoY arithmetic identical to the ZHVI parity test's value cases).
const row = (zip: string, period_end: string, top: number): TierDivergenceRawRow => ({
  zip_code: zip,
  period_end,
  top_tier_value: top,
  bottom_tier_value: 100000,
  ...META,
});

const uri = process.env.RUN_DB_PARITY === "1" ? dbUri() : null;
const py = uri ? pythonBin() : null;

gateDescribe("tier_divergence_zip_latest VIEW ⇆ oracle spread-YoY equivalence", () => {
  // CASE 1 — GAPPED: latest 2026-04-30; the 12-mo target (~2025-04-30) is absent
  // and the nearest both-present row (2025-08-31) is far outside ±7d → both NULL.
  const gapped: TierDivergenceRawRow[] = [
    row("90001", "2025-08-31", 400000),
    row("90001", "2025-12-31", 410000),
    row("90001", "2026-04-30", 264505.672125785),
  ];

  // CASE 2 — DRIFTED: the ONLY 12-mo-back candidate (2025-04-19) is 11d before the
  // 2025-04-30 target (>7d) → outside tolerance → both NULL.
  const drifted: TierDivergenceRawRow[] = [
    row("90002", "2025-04-19", 300000),
    row("90002", "2026-04-30", 330000),
  ];

  // CASE 3 — TWO-IN-WINDOW: target 2025-04-30; two rows inside ±7d:
  //   2025-04-25 (5d before, CLOSER) top 280000 → spread 2.8
  //   2025-05-02 (2d after,  NEWER)  top 250000 → spread 2.5  ← MAX-within-window wins
  // Newer spread 2.5 → YoY = (3.3/2.5 − 1)*100 = +32%. Closer 2.8 → +17.857% (distinct).
  const twoInWindow: TierDivergenceRawRow[] = [
    row("90003", "2025-04-25", 280000),
    row("90003", "2025-05-02", 250000),
    row("90003", "2026-04-30", 330000),
  ];

  const allRows = [...gapped, ...drifted, ...twoInWindow];

  it("agrees on all three crafted cases (gapped / drifted / two-in-window)", () => {
    const oracle = oracleSpreadYoyByZip(allRows);
    const view = viewSpreadYoyByZip(allRows, uri!, py!);

    expect(oracle["90001"]).toBeNull();
    expect(view["90001"]).toBeNull();

    expect(oracle["90002"]).toBeNull();
    expect(view["90002"]).toBeNull();

    // Case 3 — both pick the NEWER row: spread 3.3/2.5 → +32%, not 3.3/2.8 → +17.857%.
    const expectedNewer = (3.3 / 2.5 - 1) * 100; // 32
    const closerWrong = (3.3 / 2.8 - 1) * 100; // ≈17.857
    expect(oracle["90003"]).toBeCloseTo(expectedNewer, 10);
    expect(view["90003"]).toBeCloseTo(expectedNewer, 10);
    expect(oracle["90003"]).not.toBeCloseTo(closerWrong, 3);

    // The load-bearing assertion: oracle == view (float8, within 1e-9).
    for (const zip of ["90001", "90002", "90003"]) {
      const o = oracle[zip];
      const v = view[zip];
      if (o === null || v === null) {
        expect(o).toBe(v);
      } else {
        expect(Math.abs(o - v)).toBeLessThan(1e-9);
      }
    }
  });

  it("tier_spread_ratio LEVEL: view 3-month-avg SQL == oracle 3-month-avg", () => {
    // 3 months for one ZIP; spread ratio must be the 3m-avg-top / 3m-avg-bottom,
    // not the latest-month ratio. top (600k+660k+720k)/3=660k; bottom
    // (300k+290k+280k)/3=290k → 2.2759, vs latest 720k/280k=2.571.
    const mk = (period_end: string, top: number, bottom: number): TierDivergenceRawRow => ({
      zip_code: "90004",
      period_end,
      top_tier_value: top,
      bottom_tier_value: bottom,
      ...META,
    });
    const rows: TierDivergenceRawRow[] = [
      mk("2026-02-28", 600000, 300000),
      mk("2026-03-31", 660000, 290000),
      mk("2026-04-30", 720000, 280000),
    ];
    const oracle = oracleSpreadRatioByZip(rows);
    const view = viewSpreadRatioByZip(rows, uri!, py!);
    const expected = 660000 / 290000;
    expect(oracle["90004"]).toBeCloseTo(expected, 9);
    expect(view["90004"]).toBeCloseTo(expected, 9);
    expect(oracle["90004"]).not.toBeCloseTo(720000 / 280000, 3);
    expect(Math.abs((oracle["90004"] as number) - (view["90004"] as number))).toBeLessThan(1e-9);
  });

  // REGRESSION LOCK (window bug, 2026-06-14): a 4-month-DENSE series must average the
  // 3 NEWEST calendar months, NOT 4. Jan-31 is exactly 3 calendar months before the
  // Apr-30 anchor → excluded. The OLD `- 3 months - 7 days` window resolved to
  // > Jan-23 and silently averaged Jan..Apr (4 months). View and oracle must agree on
  // the 3-month value and BOTH reject the 4-month value.
  it("3-calendar-month window: 4-month-dense averages the 3 newest months, not 4 (view == oracle)", () => {
    const mk = (period_end: string, top: number, bottom: number): TierDivergenceRawRow => ({
      zip_code: "90005",
      period_end,
      top_tier_value: top,
      bottom_tier_value: bottom,
      ...META,
    });
    const rows: TierDivergenceRawRow[] = [
      mk("2026-01-31", 120000, 350000), // 4th month back — MUST be excluded
      mk("2026-02-28", 600000, 300000),
      mk("2026-03-31", 660000, 290000),
      mk("2026-04-30", 720000, 280000), // anchor
    ];
    const oracle = oracleSpreadRatioByZip(rows);
    const view = viewSpreadRatioByZip(rows, uri!, py!);
    const expected = 660000 / 290000; // Feb/Mar/Apr only → 2.2759
    const buggyFourMonth =
      (120000 + 600000 + 660000 + 720000) / 4 / ((350000 + 300000 + 290000 + 280000) / 4); // ≈1.721
    expect(oracle["90005"]).toBeCloseTo(expected, 9);
    expect(view["90005"]).toBeCloseTo(expected, 9);
    expect(oracle["90005"]).not.toBeCloseTo(buggyFourMonth, 3);
    expect(view["90005"]).not.toBeCloseTo(buggyFourMonth, 3);
    expect(Math.abs((oracle["90005"] as number) - (view["90005"] as number))).toBeLessThan(1e-9);
  });

  // GAP CASE: an interior month (Mar) is missing AND a 4th-month-back row (Jan) is
  // present. The calendar window is {Feb,Mar,Apr}; present-in-window = {Feb,Apr}.
  // date_trunc averages ONLY those two (honest partial mean) — it must NOT reach back
  // to the out-of-window Jan row to "complete" three months. View == oracle on it.
  it("3-calendar-month window: a gapped interior month averages only present rows (view == oracle)", () => {
    const mk = (period_end: string, top: number, bottom: number): TierDivergenceRawRow => ({
      zip_code: "90006",
      period_end,
      top_tier_value: top,
      bottom_tier_value: bottom,
      ...META,
    });
    const rows: TierDivergenceRawRow[] = [
      mk("2026-01-31", 999999, 999999), // out-of-window sentinel — MUST NOT leak in
      mk("2026-02-28", 600000, 300000),
      // Mar gap (no row)
      mk("2026-04-30", 800000, 250000), // anchor
    ];
    const oracle = oracleSpreadRatioByZip(rows);
    const view = viewSpreadRatioByZip(rows, uri!, py!);
    const expected = (600000 + 800000) / 2 / ((300000 + 250000) / 2); // Feb+Apr only → 2.5454
    const ifJanLeaked = (999999 + 600000 + 800000) / 3 / ((999999 + 300000 + 250000) / 3); // ≈1.548
    expect(oracle["90006"]).toBeCloseTo(expected, 9);
    expect(view["90006"]).toBeCloseTo(expected, 9);
    expect(oracle["90006"]).not.toBeCloseTo(ifJanLeaked, 3);
    expect(view["90006"]).not.toBeCloseTo(ifJanLeaked, 3);
    expect(Math.abs((oracle["90006"] as number) - (view["90006"] as number))).toBeLessThan(1e-9);
  });
});
