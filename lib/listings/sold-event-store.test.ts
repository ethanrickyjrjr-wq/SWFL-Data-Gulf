import { describe, expect, test } from "bun:test";
import { toHistoryRow } from "./sold-event-store";

// The build path drops a paid `/property-tax-history` body on the floor; the ingest lane
// lands the identical body in data_lake.steadyapi_property_history_raw. These pin the
// row shape the build path must write into THAT SAME table — one property, one body,
// whichever lane probed it.

describe("toHistoryRow — the row that survives the request", () => {
  const body = { meta: { property_id: "1" }, body: { property_history: [] } };

  test("keeps the vendor envelope VERBATIM — never a re-parse", () => {
    const row = toHistoryRow("6601838911", body);
    expect(row?.body).toBe(body); // same object, not a copy of the three fields we read
    expect(row?.property_id).toBe("6601838911");
  });

  test("no property id -> no row (never a keyless duplicate)", () => {
    expect(toHistoryRow("", body)).toBeNull();
    expect(toHistoryRow("   ", body)).toBeNull();
  });

  test("a non-body never lands — a gap response is not data", () => {
    expect(toHistoryRow("123", null)).toBeNull();
    expect(toHistoryRow("123", undefined)).toBeNull();
    expect(toHistoryRow("123", "not json")).toBeNull();
  });

  // THE NULL-WIPE GUARD. 18,319 rows already carry address_key/county written by the
  // ingest lane, which knows them; the build path usually does not. If an unknown field
  // were emitted as null, PostgREST would put it in the UPDATE SET list and every
  // re-probe would erase a real key.
  test("unknown address/county are OMITTED, never nulled", () => {
    const row = toHistoryRow("123", body);
    expect(row).not.toBeNull();
    expect("address_key" in row!).toBe(false);
    expect("county" in row!).toBe(false);
  });

  test("a street with no zip cannot make a key — still omitted", () => {
    const row = toHistoryRow("123", body, { street: "1229 Carlene Ave" });
    expect("address_key" in row!).toBe(false);
  });

  test("a zip with no digits is not a zip", () => {
    const row = toHistoryRow("123", body, { street: "1229 Carlene Ave", zip: "FL" });
    expect("address_key" in row!).toBe(false);
  });

  // CONFORMANCE, not invention: these are keys read LIVE out of
  // data_lake.steadyapi_property_history_raw on 08/19/2026. A TS row whose key does not
  // match the Python grammar byte-for-byte is the "two spellings, one house, no join"
  // defect, arriving in a table that already holds 18,319 correctly-keyed rows.
  test.each([
    ["1229 Carlene Ave", "33901", "1229CARLENEAVE:33901"],
    ["4113 Amelia Way", "34119", "4113AMELIAWAY:34119"],
    ["12095 Wicklow Ln", "34120", "12095WICKLOWLN:34120"],
    ["810 Elm Ct", "34145", "810ELMCT:34145"],
  ])("address_key(%s, %s) matches the landed row's key", (street, zip, expected) => {
    const row = toHistoryRow("123", body, { street, zip });
    expect(row?.address_key).toBe(expected);
  });

  test("county rides along when the caller knows it", () => {
    const row = toHistoryRow("123", body, { county: "Lee" });
    expect(row?.county).toBe("Lee");
  });

  test("fetched_at is an ISO instant — the as-of every stored read reports", () => {
    const row = toHistoryRow("123", body, {}, new Date("2026-08-19T04:00:00.000Z"));
    expect(row?.fetched_at).toBe("2026-08-19T04:00:00.000Z");
  });
});
