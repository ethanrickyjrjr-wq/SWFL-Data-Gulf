// lib/listings/steadyapi.listed-date.test.ts — parity-pinned to the Python
// _pick_listed_date test (test_pick_listed_date_parity_with_ts_fixture) via the
// shared fixture; the two implementations cannot drift silently.
import { describe, expect, test } from "bun:test";
import fixture from "../../ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json";
import { fetchListedDate, parseListedEvent, parseSoldEvent } from "./steadyapi";

describe("parseListedEvent (shared-fixture parity with Python _pick_listed_date)", () => {
  test("most recent Listed event at-or-before `at` — current spell", () => {
    expect(parseListedEvent(fixture, "2026-07-16")).toBe("2026-04-02");
  });
  test("an `at` inside the FIRST spell picks the first spell's date", () => {
    expect(parseListedEvent(fixture, "2025-12-31")).toBe("2025-06-15");
  });
  test("garbage body → null", () => {
    expect(parseListedEvent({}, "2026-07-16")).toBeNull();
    expect(parseListedEvent(null, "2026-07-16")).toBeNull();
  });
});

describe("parseSoldEvent carries the sold spell's listedDate", () => {
  test("listedDate = most recent Listed at-or-before the sold date", () => {
    const ev = parseSoldEvent(fixture);
    expect(ev).not.toBeNull();
    expect(ev!.soldPrice).toBe(372000);
    expect(ev!.soldDate).toBe("2026-06-20");
    expect(ev!.listedDate).toBe("2026-04-02");
  });
});

describe("fetchListedDate", () => {
  test("no key → null, no fetch", async () => {
    const prev = process.env.PHOTOS_API;
    delete process.env.PHOTOS_API;
    try {
      expect(await fetchListedDate("P1")).toBeNull();
    } finally {
      if (prev !== undefined) process.env.PHOTOS_API = prev;
    }
  });
});
