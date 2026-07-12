import { describe, expect, test } from "bun:test";
import { parseWatchlist, toggleZip, WATCHLIST_CAP } from "./watchlist";

describe("parseWatchlist", () => {
  test("null / empty / garbage → []", () => {
    expect(parseWatchlist(null)).toEqual([]);
    expect(parseWatchlist("")).toEqual([]);
    expect(parseWatchlist("not json")).toEqual([]);
    expect(parseWatchlist('{"a":1}')).toEqual([]);
  });

  test("keeps only 5-digit ZIP strings, deduped, capped", () => {
    expect(parseWatchlist('["33914","bad","339","33914","34102",42]')).toEqual(["33914", "34102"]);
    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => String(33900 + i)));
    expect(parseWatchlist(many)).toHaveLength(WATCHLIST_CAP);
  });
});

describe("toggleZip", () => {
  test("adds, removes, rejects non-ZIP", () => {
    expect(toggleZip([], "33914")).toEqual(["33914"]);
    expect(toggleZip(["33914"], "33914")).toEqual([]);
    expect(toggleZip(["33914"], "banana")).toEqual(["33914"]);
  });

  test("add past cap is a no-op; remove at cap still works", () => {
    const full = Array.from({ length: WATCHLIST_CAP }, (_, i) => String(33900 + i));
    expect(toggleZip(full, "34102")).toEqual(full);
    expect(toggleZip(full, full[0])).toHaveLength(WATCHLIST_CAP - 1);
  });
});
