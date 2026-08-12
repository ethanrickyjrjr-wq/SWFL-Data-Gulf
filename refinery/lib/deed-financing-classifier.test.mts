import { test } from "bun:test";
import assert from "node:assert/strict";
import { classifyPurchaseFinancing } from "./deed-financing-classifier.mts";

// ── FM-1 — pairing window: cash share must not INCREASE as the window widens ────
// (docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md FM-1)

test("FM-1 pairing window: no_recorded_financing share is monotonically non-increasing as window widens", () => {
  const deedRows = [
    { record_date: "2026-07-01", parcel_strap: "strap-A", consideration_usd: 400_000 },
    { record_date: "2026-07-05", parcel_strap: "strap-B", consideration_usd: 350_000 },
  ];
  // strap-A's mortgage is recorded 3 days AFTER the deed — a split pair, not same-day.
  // strap-B has no mortgage at all — a genuine cash purchase.
  const mortgageRows = [{ record_date: "2026-07-04", parcel_strap: "strap-A" }];

  const shares = [0, 1, 2, 3, 7].map((windowDays) => {
    const r = classifyPurchaseFinancing(deedRows, mortgageRows, windowDays);
    return r.no_recorded_financing_share ?? 0;
  });

  for (let i = 1; i < shares.length; i++) {
    assert.ok(
      shares[i] <= shares[i - 1],
      `share must not rise as window widens: ${shares.join(", ")}`,
    );
  }
  // At window 0 the split pair reads as cash (both unpaired) -> share 1.0.
  assert.equal(shares[0], 1);
  // At window >= 3 the split pair is caught -> only strap-B remains unpaired -> share 0.5.
  assert.equal(shares[3], 0.5);
});

// ── FM-2 — unclassifiable suppression floor ──────────────────────────────────────

test("FM-2 unclassifiable suppression: floor rejects publishing a share when strap-absent exceeds 15%", () => {
  const deedRows = [
    { record_date: "2026-07-01", parcel_strap: "strap-1", consideration_usd: 300_000 },
    { record_date: "2026-07-02", parcel_strap: "strap-2", consideration_usd: 300_000 },
    { record_date: "2026-07-03", parcel_strap: "strap-3", consideration_usd: 300_000 },
    { record_date: "2026-07-04", parcel_strap: "strap-4", consideration_usd: 300_000 },
    { record_date: "2026-07-05", parcel_strap: null, consideration_usd: 300_000 },
  ];
  const mortgageRows: { record_date: string; parcel_strap: string | null }[] = [];

  const result = classifyPurchaseFinancing(deedRows, mortgageRows, 0);

  // 1 of 5 = 20% unclassifiable, over the 15% floor.
  assert.equal(result.unclassifiable_share, 0.2);
  assert.equal(result.suppressed, true);
  assert.equal(result.no_recorded_financing_share, null);
});

test("FM-2 unclassifiable suppression: floor does NOT trip when strap-absent is under 15%", () => {
  const deedRows = Array.from({ length: 20 }, (_, i) => ({
    record_date: "2026-07-01",
    parcel_strap: i === 0 ? null : `strap-${i}`, // 1 of 20 = 5% unclassifiable
    consideration_usd: 300_000,
  }));
  const result = classifyPurchaseFinancing(deedRows, [], 0);

  assert.equal(result.unclassifiable_share, 0.05);
  assert.equal(result.suppressed, false);
  assert.ok(result.no_recorded_financing_share !== null);
});

// ── FM-3 — multi-parcel / multi-doc double-count ─────────────────────────────────

test("FM-3 double-count: a strap carrying two mortgages still counts the deed once, as financed", () => {
  const deedRows = [
    { record_date: "2026-07-10", parcel_strap: "strap-Z", consideration_usd: 500_000 },
  ];
  // Two mortgage-family rows on the SAME strap, same day — EXISTS semantics, not a join fan-out.
  const mortgageRows = [
    { record_date: "2026-07-10", parcel_strap: "strap-Z" },
    { record_date: "2026-07-10", parcel_strap: "strap-Z" },
  ];

  const result = classifyPurchaseFinancing(deedRows, mortgageRows, 0);

  assert.equal(result.total_arms_length, 1);
  assert.equal(result.financed, 1);
  assert.equal(result.no_recorded_financing, 0);
});

test("FM-3 double-count: two deed rows on the same (record_date, parcel_strap) dedupe to one", () => {
  const deedRows = [
    { record_date: "2026-07-10", parcel_strap: "strap-Y", consideration_usd: 500_000 },
    { record_date: "2026-07-10", parcel_strap: "strap-Y", consideration_usd: 500_000 }, // duplicate
  ];
  const result = classifyPurchaseFinancing(deedRows, [], 0);

  assert.equal(result.total_arms_length, 1);
});

// ── Headline reproduction shape (not the live numbers — just the arithmetic) ─────

test("no_recorded_financing_share is classifiable-denominator, excludes unclassifiable rows", () => {
  // 10 classifiable rows (5 financed, 5 no-financing) + 1 unclassifiable = 1/11 = 9.1%,
  // safely under the 15% suppression floor, so the share is published.
  const deedRows = [
    ...Array.from({ length: 5 }, (_, i) => ({
      record_date: "2026-07-01",
      parcel_strap: `financed-${i}`,
      consideration_usd: 300_000,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      record_date: "2026-07-02",
      parcel_strap: `unpaired-${i}`,
      consideration_usd: 300_000,
    })),
    { record_date: "2026-07-03", parcel_strap: null, consideration_usd: 300_000 }, // unclassifiable
  ];
  const mortgageRows = Array.from({ length: 5 }, (_, i) => ({
    record_date: "2026-07-01",
    parcel_strap: `financed-${i}`,
  }));

  const result = classifyPurchaseFinancing(deedRows, mortgageRows, 0);

  assert.equal(result.financed, 5);
  assert.equal(result.no_recorded_financing, 5);
  assert.equal(result.unclassifiable, 1);
  assert.equal(result.suppressed, false);
  // denominator is classifiable only (10), not total (11): 5/10 = 0.5
  assert.equal(result.no_recorded_financing_share, 0.5);
});
