// lib/listings/apify-record-store.test.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** ONE REPEATED ADDRESS IN A BATCH SILENTLY THREW AWAY THE WHOLE WRITE. ***
// ═══════════════════════════════════════════════════════════════════════════════
//
// Measured live 08/04/2026. The comps email bought ~600 vendor records across three
// dated ZIP pulls and `data_lake.apify_property_records` stayed at 20 rows — the exact
// count it held before. Not one row of ~$6 of paid data landed.
//
// The cause, reproduced against the live table:
//
//     upsert([row("998 Dupe Probe Ln"), row("998 Dupe Probe Ln")], {onConflict:"address_key"})
//     -> 21000  ON CONFLICT DO UPDATE command cannot affect row a second time
//
// Postgres refuses an INSERT ... ON CONFLICT whose *incoming batch* contains the same
// conflict key twice. A 200-record ZIP pull hits that constantly — a relisted home, a
// unit variant, the same house in two months of a window. And `saveApifyRecords`
// returned 0 on error with the error discarded, so the failure was byte-identical to
// "there was nothing to save."
//
// THE COST OF THIS BUG IS THE WHOLE POINT OF THE TABLE: the cache exists so a house we
// already bought is free the second time. While this was broken, every single build
// re-bought every single record at ~$0.01 each, forever.
//
// Tests are named for the failure mode they prevent.

import { describe, expect, test } from "bun:test";
import {
  dedupeRows,
  toRow,
  splitUnitFromStreet,
  unitTokenOf,
  type StoredApifyRecord,
} from "./apify-record-store";
import type { ApifyRecord } from "./apify-comps";

const rec = (street: string, city = "Fort Myers", extra: Record<string, unknown> = {}) =>
  ({ street, city, ...extra }) as unknown as ApifyRecord;

const rows = (...r: ApifyRecord[]): StoredApifyRecord[] =>
  r.map(toRow).filter((x): x is StoredApifyRecord => x !== null);

describe("dedupeRows — the guard for Postgres 21000", () => {
  test("the SAME address twice in one batch collapses to ONE row", () => {
    // The literal shape that killed a ~$6 pull. Before this guard the batch was sent
    // as-is and Postgres rejected ALL of it, not just the duplicate.
    const out = dedupeRows(rows(rec("998 Dupe Probe Ln"), rec("998 Dupe Probe Ln")));
    expect(out).toHaveLength(1);
  });

  test("case and punctuation drift is the SAME house — the vendor is not consistent", () => {
    // `listingAddressKey` already normalises; this asserts dedupe runs on the KEY, not
    // on the raw street string, or the guard would miss the commonest duplicate shape.
    const out = dedupeRows(rows(rec("14503 DOLCE VISTA RD"), rec("14503 Dolce Vista Rd")));
    expect(out).toHaveLength(1);
  });

  test("the LAST record wins — a later pull is the fresher read of the same house", () => {
    const out = dedupeRows(
      rows(
        rec("1 A St", "Naples", { primary_photo: "https://ap.rdcpix.com/old.jpg" }),
        rec("1 A St", "Naples", { primary_photo: "https://ap.rdcpix.com/new.jpg" }),
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.primary_photo).toBe("https://ap.rdcpix.com/new.jpg");
  });

  test("DIFFERENT houses are never collapsed — the guard must not lose paid data", () => {
    const out = dedupeRows(rows(rec("1 A St"), rec("2 B St"), rec("3 C St")));
    expect(out).toHaveLength(3);
  });

  test("same street number and name in a DIFFERENT city stay separate rows", () => {
    const out = dedupeRows(rows(rec("330 5th St", "Naples"), rec("330 5th St", "Fort Myers")));
    expect(out).toHaveLength(2);
  });

  test("an empty batch is an empty batch, never a throw", () => {
    expect(dedupeRows([])).toEqual([]);
  });

  test("a realistic ZIP pull with scattered repeats keeps every DISTINCT house", () => {
    const batch = rows(
      ...["1 A St", "2 B St", "1 A St", "3 C St", "2 B St", "4 D St", "1 A St"].map((s) => rec(s)),
    );
    expect(batch).toHaveLength(7);
    const out = dedupeRows(batch);
    expect(out).toHaveLength(4);
    expect(new Set(out.map((r) => r.address_key)).size).toBe(4);
  });
});

describe("toRow — a row without a key is never written", () => {
  test("no street or no city -> null, never a keyless duplicate", () => {
    expect(toRow(rec("", "Fort Myers"))).toBeNull();
    expect(toRow(rec("1 A St", ""))).toBeNull();
  });

  test("a usable record keeps the photo and the listing URL — the two the email needs", () => {
    const r = toRow(
      rec("1 A St", "Naples", {
        primary_photo: "https://ap.rdcpix.com/a.jpg",
        property_url: "https://www.realtor.com/a",
      }),
    );
    expect(r?.primary_photo).toBe("https://ap.rdcpix.com/a.jpg");
    expect(r?.property_url).toBe("https://www.realtor.com/a");
  });
});

describe("the unit seam — a condo joins its OWN paid row or none (measured 08/09/2026)", () => {
  test("the live miss that motivated this: '8521 Oakshade Cir #422' splits to core + token", () => {
    expect(splitUnitFromStreet("8521 Oakshade Cir #422")).toEqual({
      core: "8521 Oakshade Cir",
      unit: "422",
    });
  });

  test("every spelling of a unit yields the same bare token", () => {
    expect(splitUnitFromStreet("8521 Oakshade Cir Unit 422").unit).toBe("422");
    expect(splitUnitFromStreet("8521 Oakshade Cir Apt 4B").unit).toBe("4b");
    expect(splitUnitFromStreet("120 Main St Ste 100").unit).toBe("100");
    expect(splitUnitFromStreet("8521 Oakshade Cir unit #422").unit).toBe("422");
  });

  test("a street WITHOUT a unit is untouched — no token invented", () => {
    expect(splitUnitFromStreet("12554 Kelly Sands Way")).toEqual({
      core: "12554 Kelly Sands Way",
      unit: null,
    });
  });

  test("a degenerate unit-only line never strips to an empty street", () => {
    expect(splitUnitFromStreet("#422")).toEqual({ core: "#422", unit: null });
  });

  test("the paid row's own unit column normalises to the same token: 'Unit 422' = '#422'", () => {
    expect(unitTokenOf("Unit 422")).toBe("422");
    expect(unitTokenOf("#422")).toBe("422");
    expect(unitTokenOf("Apt 4B")).toBe("4b");
  });

  test("a row with NO unit yields null — it may never satisfy a unit-bearing subject", () => {
    expect(unitTokenOf(null)).toBeNull();
    expect(unitTokenOf("")).toBeNull();
    expect(unitTokenOf("   ")).toBeNull();
    expect(unitTokenOf(422)).toBeNull();
  });
});
