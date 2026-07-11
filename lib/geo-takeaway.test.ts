import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { makeTakeaway } from "./geo-takeaway";

describe("makeTakeaway", () => {
  test("SWFL-scoped region figure — answer-first with as-of + brand", () => {
    const t = makeTakeaway(
      {
        label: "Median asking price",
        display: "$345,000",
        asOf: "07/10/2026",
        sourceLabel: "SWFL Data Gulf",
      },
      "Southwest Florida",
    );
    assert.equal(
      t,
      "Median asking price in Southwest Florida is $345,000 as of 07/10/2026, per SWFL Data Gulf.",
    );
  });

  test("no scope for a national figure (mortgage) — no false region label", () => {
    const t = makeTakeaway({
      label: "30-yr fixed mortgage",
      display: "6.49%",
      asOf: "07/10/2026",
      sourceLabel: "Freddie Mac",
    });
    assert.equal(t, "30-yr fixed mortgage is 6.49% as of 07/10/2026, per Freddie Mac.");
  });

  test("empty display yields empty string (empty-tolerant)", () => {
    assert.equal(
      makeTakeaway(
        { label: "x", display: "", asOf: "07/10/2026", sourceLabel: "s" },
        "Southwest Florida",
      ),
      "",
    );
  });

  test("omits as-of clause when absent", () => {
    const t = makeTakeaway(
      { label: "Active listings", display: "29,413", sourceLabel: "SWFL Data Gulf" },
      "Southwest Florida",
    );
    assert.equal(t, "Active listings in Southwest Florida is 29,413, per SWFL Data Gulf.");
  });

  test("plural: true uses 'are' instead of 'is'", () => {
    const t = makeTakeaway(
      {
        label: "Active listings",
        display: "29,413",
        asOf: "07/10/2026",
        sourceLabel: "SWFL Data Gulf",
        plural: true,
      },
      "Southwest Florida",
    );
    assert.equal(
      t,
      "Active listings in Southwest Florida are 29,413 as of 07/10/2026, per SWFL Data Gulf.",
    );
  });

  test("report-page takeaway: no scope clause when scope is omitted", () => {
    const t = makeTakeaway({
      label: "Median list price",
      display: "$345,000",
      asOf: "07/10/2026",
      sourceLabel: "SWFL Data Gulf",
    });
    assert.equal(t, "Median list price is $345,000 as of 07/10/2026, per SWFL Data Gulf.");
  });
});
