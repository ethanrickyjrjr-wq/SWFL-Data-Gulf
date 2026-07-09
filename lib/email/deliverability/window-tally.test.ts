import { describe, expect, it } from "bun:test";
import { tallyRateEvents } from "./window-tally";

describe("tallyRateEvents", () => {
  it("counts delivered/bounced/complained", () => {
    expect(
      tallyRateEvents([
        { event: "delivered" },
        { event: "delivered" },
        { event: "bounced" },
        { event: "complained" },
      ]),
    ).toEqual({ delivered: 2, bounced: 1, complained: 1 });
  });

  it("ignores opened/clicked mixed into the window — they must not shrink the denominator", () => {
    // A window that, if opens/clicks consumed slots, would undercount delivered
    // (2000 real deliveries but only 400 delivered rows survive a 1000-row
    // window once opens/clicks are interleaved — this is the exact bug the
    // route's query filter + this pure tally both guard against).
    const rows = [
      ...Array(3).fill({ event: "delivered" }),
      ...Array(5).fill({ event: "opened" }),
      ...Array(4).fill({ event: "clicked" }),
      { event: "bounced" },
      { event: "complained" },
    ];
    expect(tallyRateEvents(rows)).toEqual({ delivered: 3, bounced: 1, complained: 1 });
  });

  it("returns zeros for an empty window", () => {
    expect(tallyRateEvents([])).toEqual({ delivered: 0, bounced: 0, complained: 0 });
  });
});
