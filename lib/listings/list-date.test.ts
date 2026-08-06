// lib/listings/list-date.test.ts
//
// The vendor list-date chain, tested where it now lives. These cases were written for
// `recipes/under-contract.test.ts` (07/2026) and MOVED WITH THE CODE 08/06/2026 when the
// July under-contract recipe was rewritten from scratch — the lane survived the rewrite,
// so its tests do too. Verbatim except for the import path and one case dropped: it
// asserted the OLD recipe module exposed no `daysToContract`, which was a statement about
// that file, not about this one.
//
// Pure and clock-injected. No network.

import { describe, expect, it } from "bun:test";
import { daysSinceListed, formatListDate, parseActiveListDate } from "./list-date";

const TAX_HISTORY = {
  body: {
    property_history: [
      {
        date: "2026-07-01",
        event_name: "Price Changed",
        listing: { status: "for_sale", list_date: "2026-04-29T17:46:36Z" },
      },
      {
        date: "2026-04-29",
        event_name: "Listed",
        listing: { status: "for_sale", list_date: "2026-04-29T17:46:36Z" },
      },
      {
        date: "2023-03-17",
        event_name: "Sold",
        listing: { status: "sold", list_date: "2023-08-25T06:36:25Z" },
      },
      {
        date: "2020-11-01",
        event_name: "Listing removed",
        listing: { status: "off_market", list_date: "2020-08-02T20:52:24Z" },
      },
    ],
  },
};

const LISTED_ISO = "2026-04-29T17:46:36Z";
const LISTED_ON = "04/29/2026";
/** A FIXED "now". 04/29 → 07/13 = 1 + 31 + 30 + 12 = 75 whole days (UTC).
 *  (Apr 29 17:46Z + 75d = Jul 13 17:46Z; our `now` is 18:00Z, so floor() = 75.) */
const NOW = new Date("2026-07-13T18:00:00Z");

describe("parseActiveListDate — the list date /search does not carry", () => {
  it("reads the ACTIVE for-sale listing's list date", () => {
    expect(parseActiveListDate(TAX_HISTORY)).toBe(LISTED_ISO);
  });

  it("never mistakes an old SOLD listing's list date for the current cycle", () => {
    const onlySold = {
      body: {
        property_history: [
          { event_name: "Sold", listing: { status: "sold", list_date: "2023-08-25T06:36:25Z" } },
        ],
      },
    };
    expect(parseActiveListDate(onlySold)).toBeNull();
  });

  it("returns null on a body with no history (never throws, never invents)", () => {
    expect(parseActiveListDate({})).toBeNull();
    expect(parseActiveListDate(null)).toBeNull();
    expect(parseActiveListDate({ body: { property_history: "nope" } })).toBeNull();
  });
});

describe("formatListDate + daysSinceListed — a DATE, and a RUNNING AGE", () => {
  it("renders the vendor's list date as MM/DD/YYYY (Rule 5), in UTC", () => {
    expect(formatListDate(LISTED_ISO)).toBe(LISTED_ON);
    expect(formatListDate(null)).toBeNull();
    expect(formatListDate("not a date")).toBeNull();
  });

  it("counts whole days from the list date — CLOCK INJECTED, so it is deterministic", () => {
    // RE-DERIVED BY HAND, UTC: Apr 29 → Apr 30 is 1 day. May = 31, June = 30, and
    // Jul 1 → Jul 13 = 12. 1 + 31 + 30 + 12 = 74 calendar-day boundaries… but the
    // interval is timestamp-to-timestamp: 2026-04-29T17:46:36Z → 2026-07-13T18:00:00Z
    // is 75 days and 13 minutes. floor() = 75.
    expect(daysSinceListed(LISTED_ISO, NOW)).toBe(75);
    // One second BEFORE the 75-day mark is still 74. floor(), not round().
    expect(daysSinceListed(LISTED_ISO, new Date("2026-07-13T17:46:35Z"))).toBe(74);
  });

  it("null / unparseable / a FUTURE list date → null → an open slot, never a 0", () => {
    expect(daysSinceListed(null, NOW)).toBeNull();
    expect(daysSinceListed("not a date", NOW)).toBeNull();
    expect(daysSinceListed("2026-12-01T00:00:00Z", NOW)).toBeNull();
  });
});
