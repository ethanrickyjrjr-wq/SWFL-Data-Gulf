import { describe, it, expect } from "bun:test";
import { buildHomeWire, type MetroPanelLike } from "./home-wire";
import type { DeskStats } from "@/app/insiders/_lib/desk-stats";

/** Synthetic fixtures — test-only values, never rendered anywhere. */
const desk = (over: Partial<DeskStats> = {}): DeskStats => ({
  listingsTotal: 10432,
  listingsAsOf: "07/11/2026",
  mostActive: { zip: "33914", place: "Cape Coral", count: 812 },
  newsThisMonth: 41,
  newsMonthName: "July",
  topValue: { zip: "34102", place: "Naples", usd: "$2.10M" },
  ...over,
});

const panel = (asOf: string, row: Record<string, unknown>): MetroPanelLike => ({
  asOf,
  data: [{ cape_coral: 1, fort_myers: 1, naples: 1 }, row],
});

describe("buildHomeWire", () => {
  it("builds metro values, rents, and the news count — in that order", () => {
    const { items, note } = buildHomeWire({
      desk: desk(),
      zhvi: panel("2026-05", { cape_coral: 390000, fort_myers: 355000, naples: 610000 }),
      zori: panel("2026-05", { cape_coral: 2100, fort_myers: 1950, naples: 3200 }),
    });
    expect(items.map((i) => i.label)).toEqual([
      "Cape Coral · median home value",
      "Fort Myers · median home value",
      "Naples · median home value",
      "Cape Coral · median rent",
      "Fort Myers · median rent",
      "Naples · median rent",
      "Local stories filed since July 1",
    ]);
    expect(items[0].value).toBe("$390,000");
    expect(items[3].value).toBe("$2,100/mo");
    expect(items[6].value).toBe("41");
    expect(note).toBe(
      "desk updated 07/11/2026 · Zillow ZHVI & ZORI through May 2026 · SWFL Data Gulf",
    );
  });

  it("never repeats the data door's figures (no listings total / most-active / top-value items)", () => {
    const { items } = buildHomeWire({
      desk: desk(),
      zhvi: panel("2026-05", { cape_coral: 390000 }),
    });
    const labels = items.map((i) => i.label).join(" | ");
    expect(labels).not.toContain("Active listings");
    expect(labels).not.toContain("Most active");
    expect(labels).not.toContain("Highest-value");
  });

  it("drops non-numeric metros and hides the news item at zero", () => {
    const { items } = buildHomeWire({
      desk: desk({ newsThisMonth: 0 }),
      zhvi: panel("2026-05", { cape_coral: 390000, fort_myers: null, naples: "n/a" }),
    });
    expect(items).toEqual([{ label: "Cape Coral · median home value", value: "$390,000" }]);
  });

  it("splits the note when values and rents carry different as-of months", () => {
    const { note } = buildHomeWire({
      desk: desk({ listingsAsOf: null }),
      zhvi: panel("2026-05", { cape_coral: 390000 }),
      zori: panel("2026-04", { cape_coral: 2100 }),
    });
    expect(note).toBe("Zillow values through May 2026, rents through April 2026 · SWFL Data Gulf");
  });

  it("returns zero items when every input is empty — the caller hides the ticker", () => {
    const { items, note } = buildHomeWire({
      desk: desk({ listingsAsOf: null, newsThisMonth: null }),
    });
    expect(items).toEqual([]);
    expect(note).toBe("SWFL Data Gulf");
  });
});
