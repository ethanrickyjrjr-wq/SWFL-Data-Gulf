import { test, expect } from "bun:test";
import { tryParsePatch, dropSuperseded, unfilledPlaceholderMiss, cityZipsFor } from "./build-doc";
import type { MarketFigure } from "@/lib/email/market-context";

// CHOKEPOINT GUARD: an unfilled recipe [[blank]] must NEVER reach the model. Every
// build path (empty hero fill, recipe auto-built before its address popup, a bot
// POSTing the raw recipe) funnels through buildContentDoc/authorDoc, which call
// this first. It stops with an ask instead of shipping the literal "[[...]]" token
// (the "word the AI didn't know") and building unscoped, place-less content.
test("unfilledPlaceholderMiss stops a prompt still holding a [[blank]]", () => {
  const miss = unfilledPlaceholderMiss(
    "Build a monthly market-pulse email for [[your city or ZIP]] — every ZIP's move.",
  );
  expect(miss).not.toBeNull();
  expect(miss!.payload.applied).toBe(false);
  expect(miss!.payload.message).toContain("your city or ZIP");
  // The literal placeholder token must NEVER be what ships to the author.
  expect(miss!.payload.doc).toBeUndefined();
});

test("unfilledPlaceholderMiss passes a real, filled prompt through (null = build)", () => {
  expect(
    unfilledPlaceholderMiss(
      "Build a monthly market-pulse email for Cape Coral — every ZIP's move.",
    ),
  ).toBeNull();
  expect(unfilledPlaceholderMiss("build me anything")).toBeNull();
});

// The resilient content-patch parser: one over-limit field must NOT nuke the whole
// fill (the bug that returned "try rephrasing" on a real Sonnet response with 4 stats).

test("extracts JSON from a ```json-fenced response", () => {
  const r = tryParsePatch('```json\n{ "b1": { "prose": "hi" } }\n```');
  expect(r).toEqual({ b1: { prose: "hi" } });
});

test("clamps a too-long stats array to 3 instead of rejecting the whole patch", () => {
  const r = tryParsePatch(
    JSON.stringify({
      b1: {
        stats: [
          { value: "1", label: "a" },
          { value: "2", label: "b" },
          { value: "3", label: "c" },
          { value: "4", label: "d" },
          { value: "5", label: "e" },
        ],
      },
    }),
  );
  expect(r).not.toBeNull();
  expect(r!.b1.stats!.length).toBe(3);
});

test("keeps valid blocks and drops only the unsalvageable one", () => {
  // b2's value blows past the 24-char max → b2 dropped, b1 kept (never nuke everything)
  const r = tryParsePatch(JSON.stringify({ b1: { prose: "good" }, b2: { value: "x".repeat(50) } }));
  expect(r).toEqual({ b1: { prose: "good" } });
});

test("strips a style/link key but keeps the block (no-restyle held)", () => {
  const r = tryParsePatch(
    JSON.stringify({ b1: { prose: "ok", bgColor: "#000", url: "http://x" } }),
  );
  expect(r).toEqual({ b1: { prose: "ok" } });
});

test("returns null when there is no JSON object at all", () => {
  expect(tryParsePatch("Sorry, I can't help with that.")).toBeNull();
});

// FRESHNESS: a stale held figure that the web lane refreshed must be DROPPED from the
// held context, so the AI can't see both the stale April number and the fresh web number
// and pick the wrong one. Match is by exact label (the forced request reuses the figure's
// label, so the verified web point carries the same label back).
const figs: MarketFigure[] = [
  {
    key: "home_value",
    label: "Median home value — Cape Coral",
    value: "$390,000",
    source: "Zillow ZHVI",
    as_of: "04/30/2026",
  },
  {
    key: "rent",
    label: "Typical asking rent",
    value: "$2,100/mo",
    source: "Zillow ZORI",
    as_of: "05/31/2026",
  },
  {
    key: "population",
    label: "Population",
    value: "204,000",
    source: "U.S. Census ACS",
    as_of: "12/31/2025",
  },
];

test("dropSuperseded removes held figures the web refreshed, keeps the rest", () => {
  const survivors = dropSuperseded(figs, ["Median home value — Cape Coral"]);
  expect(survivors.map((f) => f.key)).toEqual(["rent", "population"]);
});

test("dropSuperseded is a no-op when nothing was refreshed", () => {
  expect(dropSuperseded(figs, [])).toHaveLength(3);
});

test("dropSuperseded matches by exact label only (no partial collisions)", () => {
  // "Population" must not drop because of an unrelated "Median home value" refresh
  const survivors = dropSuperseded(figs, ["Median home value"]); // not an exact label
  expect(survivors).toHaveLength(3);
});

// cityZipsFor: the fail-closed allowlist gate for the ZIP-by-ZIP city chart. Only an
// allowlisted, USPS+Mapbox-verified multi-ZIP city returns its ZIP set; everything
// else (single-ZIP place, Estero, explicit scope, undefined) → undefined → the
// existing single-scope chart, never a wrong-city chart.
test("cityZipsFor returns the ZIP list for an allowlisted multi-ZIP city", () => {
  const zips = ["33904", "33914", "33990", "33991", "33993", "33909"];
  expect(cityZipsFor({ place: "Cape Coral", zip: "33904", zips })).toEqual(zips);
});

test("cityZipsFor returns undefined for Estero (single ZIP, corrected 07/06/2026)", () => {
  expect(cityZipsFor({ place: "Estero", zip: "33928", zips: ["33928"] })).toBeUndefined();
});

test("cityZipsFor returns undefined for a single-ZIP place, an off-list place, and undefined", () => {
  expect(cityZipsFor({ place: "Sanibel", zip: "33957", zips: ["33957"] })).toBeUndefined();
  // Off the allowlist even though it has multiple zips → fail-closed.
  expect(
    cityZipsFor({ place: "Somewhere", zip: "00001", zips: ["00001", "00002"] }),
  ).toBeUndefined();
  expect(cityZipsFor(undefined)).toBeUndefined();
});
