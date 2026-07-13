// lib/deliverable/recipes/under-contract.test.ts
//
// R4 · UNDER CONTRACT. Every test here drives a PURE function with fixture data —
// ZERO live calls, ZERO clock dependence (the clock is injected).
//
// ── THE ORACLE ───────────────────────────────────────────────────────────────
//
// An earlier suite was 35/35 GREEN ON A WRONG ORACLE. It asserted, at line 387:
//
//     expect(offerClaims("This home went under contract after 75 days on the
//                         market.")).toEqual([])
//
// …and treated that as PASSING — pinning the exact fabricated interval that shipped
// to the rendered email as correct behavior. A green suite over a wrong oracle is
// worse than a red one: it certifies the lie.
//
// The oracle is now TWO propositions, and every test below serves one of them:
//
//   1. NO SOURCE HOLDS THE DAYS-TO-CONTRACT INTERVAL, the contract date, or the
//      ORDER of the price cut against the contract. Any such claim is INVENTED.
//   2. INVENTION IS CLAIM-SHAPED, NOT NUMBER-SHAPED. The sentence that shipped
//      contained no invented number — it drew a false RELATION between three
//      correctly-sourced ones. So the narrator is handed NO raw figure to relate,
//      and `auditClaims` fail-closes on any relation it draws anyway.
//
// The fixtures are the live vendor bodies captured 07/13/2026:
//   • 326 Shore Dr, Fort Myers 33905 — property_id 6951062705
//   • its ZIP's median days on market (72) from the housing-swfl brain
import { describe, expect, it } from "bun:test";
import {
  buildUnderContractGrid,
  daysSinceListed,
  fallbackNote,
  formatListDate,
  inventedAttributes,
  loadAreaTiming,
  narratorSources,
  offerClaims,
  parseActiveListDate,
  proseViolations,
  settleAll,
  settleAreaTiming,
  settleNewConstruction,
  settlePriceCut,
  settleStatus,
  timingClaims,
  timingLine,
  type MarketTiming,
  type NarratorInput,
} from "./under-contract";
import { numeralsIn } from "@/lib/deliverable/claims";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** VERBATIM shape of /property-tax-history for 326 Shore Dr (trimmed to the fields
 *  the parser reads). The current for-sale cycle sits alongside two OLD sold
 *  listings — the parser must never confuse a 2023 sale's list date for today's. */
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

/** The resolved subject, exactly as the dispatcher hands it to the builder. */
const FACTS: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL, 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  isNewConstruction: true,
  isPriceReduced: true,
  priceReduction: "$104,975",
  photos: ["https://example.test/photo.webp"],
  lat: 26.688788,
  lon: -81.805899,
  sourceUrl: "https://www.swfldatagulf.com",
};

/** 33905's median_dom is 72; its Redfin metro is "Cape Coral, FL". The peer set is
 *  every OTHER ZIP IN THAT METRO.
 *  RE-DERIVED BY HAND: strictly > 72 → 96, 88, 73 → THREE. 72 is NOT > 72. Total SIX. */
const PEERS = [96, 88, 73, 72, 51, 34];
const METRO = "Cape Coral, FL";
const TIMING: MarketTiming = {
  areaDom: 72,
  zip: "33905",
  metro: METRO,
  peers: PEERS,
  asOf: "06/29/2026",
};

const LISTED_ISO = "2026-04-29T17:46:36Z";
const LISTED_ON = "04/29/2026";
/** A FIXED "now". 04/29 → 07/13 = 1 + 31 + 30 + 12 = 75 whole days (UTC).
 *  (Apr 29 17:46Z + 75d = Jul 13 17:46Z; our `now` is 18:00Z, so floor() = 75.) */
const NOW = new Date("2026-07-13T18:00:00Z");
const DAYS_LISTED = 75;

const BLANK_DOC: EmailDoc = { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] };

const statsOf = (doc: EmailDoc): StatItem[] =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));
const cellFor = (doc: EmailDoc, label: string): StatItem | undefined =>
  statsOf(doc).find((s) => s.label === label);

const fullDoc = () =>
  buildUnderContractGrid({
    facts: FACTS,
    current: BLANK_DOC,
    listedOn: LISTED_ON,
    daysListed: DAYS_LISTED,
    timing: TIMING,
  });

const INPUT: NarratorInput = { settled: settleAll(FACTS, TIMING), remarks: FACTS.remarks };

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE REFUTATION. These are the EXACT strings that shipped to the rendered
//    email. Not one of them contains an invented NUMBER.
// ─────────────────────────────────────────────────────────────────────────────

/** Screenshot A — 326 Shore Dr, the canonical fixture. */
const REFUTED_A =
  "This home went under contract after 75 days on market, in line with the 72-day median for ZIP 33905. The seller had reduced the asking price by $104,975 before a contract was reached.";
/** Screenshot B — 14550 Carva Ln, the chart branch. */
const REFUTED_B =
  "The home went under contract after 45 days on the market. The current asking price had been adjusted by $4,910 before the contract was accepted.";
/** The OLD deterministic fallback — it fabricated BY CONSTRUCTION, on the
 *  guaranteed-on-API-failure path. */
const REFUTED_FALLBACK =
  "It went under contract after 45 days on the market - 27 days quicker than the 72-day median for ZIP 33905.";

describe("THE REFUTATION — every sentence that actually shipped is now blocked", () => {
  it("blocks the canonical fabricated interval + the invented event ordering", () => {
    // The narrow guards are narrow BY DESIGN. The SHIP GATE is proseViolations.
    expect(offerClaims(REFUTED_A)).toEqual([]); // still narrow — not the gate
    expect(timingClaims(REFUTED_A).length).toBeGreaterThan(0);
    expect(proseViolations(REFUTED_A, "", INPUT.settled)).not.toEqual([]); // THE GATE
  });

  it("blocks the chart-branch fabrication", () => {
    expect(proseViolations(REFUTED_B, "", INPUT.settled)).not.toEqual([]);
  });

  it("blocks the OLD deterministic fallback — the path that lied on every API failure", () => {
    expect(proseViolations(REFUTED_FALLBACK, "", INPUT.settled)).not.toEqual([]);
  });

  it("the interval is blocked even with EVERY number correctly sourced", () => {
    // THE POINT OF THE WHOLE EXERCISE. 75, 72, 33905 and $104,975 are all real. Feed
    // the gate a settled set that contains every one of them as an anchor, so the
    // unanchored-number check CANNOT be what fires — and the sentence is STILL dead,
    // because what is invented is the CLAIM, not the number.
    const everyNumberAnchored = [
      ...INPUT.settled,
      { sentence: "75 72 33905.", anchors: ["75", "72", "33905"] },
    ];
    expect(proseViolations(REFUTED_A, "", everyNumberAnchored)).not.toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE CLAIM GATE — code computes the relation; the narrator restates it.
// ─────────────────────────────────────────────────────────────────────────────

const CITE = "(SWFL Data Gulf, as of 06/29/2026)";

describe("settleAreaTiming — the count is an integer comparison, never a model's guess", () => {
  it("counts the peers ABOVE the subject ZIP — re-derived by hand", () => {
    // peers = [96, 88, 73, 72, 51, 34]; areaDom = 72.
    // STRICTLY greater than 72: 96, 88, 73 → 3.   NOT 72 itself (72 > 72 is FALSE),
    // not 51, not 34.  total peers = 6.  → "3 of 6".
    const claim = settleAreaTiming(TIMING);
    expect(claim?.sentence).toBe(
      `3 of 6 ZIP codes in the Cape Coral, FL metro have a longer typical time-to-sell than 33905 ${CITE}.`,
    );
    // The claim CARRIES ITS OWN SOURCE, because the sentence is what ships.
    expect(claim?.anchors).toEqual(["3", "6", "33905", "06", "29", "2026"]);
  });

  it("says ALL when every peer is above — the market-pulse miscount class", () => {
    // market-pulse wrote "five of those six" over a set whose true answer was four. A
    // word-count carries no digits, so a digit lint sails straight past it.
    const claim = settleAreaTiming({ ...TIMING, areaDom: 10, peers: [11, 12, 13] });
    expect(claim?.sentence).toBe(
      `All 3 ZIP codes in the Cape Coral, FL metro have a longer typical time-to-sell than 33905 ${CITE}.`,
    );
  });

  it("counts ZERO honestly when the ZIP is the region's slowest", () => {
    const claim = settleAreaTiming({ ...TIMING, areaDom: 200, peers: [11, 12, 13] });
    expect(claim?.sentence).toBe(
      `0 of 3 ZIP codes in the Cape Coral, FL metro have a longer typical time-to-sell than 33905 ${CITE}.`,
    );
  });

  it("an unparseable as-of names the SOURCE and no date — never the raw token", () => {
    // Rule 5: MM/DD/YYYY, and the freshness token is INTERNAL. market-snapshot.ts
    // falls back to the raw token; leaking `SWFL-7421-v9-20260629` into an agent's
    // email is not a citation, it is a leak.
    const claim = settleAreaTiming({ ...TIMING, asOf: null });
    expect(claim?.sentence).toContain("(SWFL Data Gulf).");
    expect(claim?.sentence).not.toContain("SWFL-7421");
  });

  it("no timing, or no peers → NO claim (never a benchmark of one)", () => {
    expect(settleAreaTiming(null)).toBeNull();
    expect(settleAreaTiming({ ...TIMING, peers: [] })).toBeNull();
  });

  it("its own sentence survives the ship gate — a settled fact must be shippable", () => {
    const claim = settleAreaTiming(TIMING)!;
    expect(proseViolations(claim.sentence, "", [claim])).toEqual([]);
  });
});

describe("settlePriceCut — the AMOUNT is sourced; the ORDER never was", () => {
  it("states the amount and places it in NO order against anything", () => {
    const claim = settlePriceCut(FACTS)!;
    expect(claim.sentence).toBe("The asking price came down by $104,975, to $595,000.");
    // Both numerals become anchors — the ONLY digits the narrator may then type.
    expect(claim.anchors).toEqual(["104975", "595000"]);
    expect(claim.sentence).not.toMatch(/before|after|then|once/i);
  });

  it("omits the current ask when we do not hold one", () => {
    expect(settlePriceCut({ ...FACTS, price: undefined })?.sentence).toBe(
      "The asking price came down by $104,975.",
    );
  });

  it("no cut → no claim (never a $0, never a 'held firm')", () => {
    expect(settlePriceCut({ ...FACTS, isPriceReduced: false })).toBeNull();
    expect(settlePriceCut({ ...FACTS, priceReduction: undefined })).toBeNull();
  });
});

describe("settleStatus — code authors 'under contract', and that is not cosmetic", () => {
  it("is a settled sentence, so the narrator may restate it", () => {
    expect(settleStatus().sentence).toBe("This home is under contract.");
    expect(settleStatus().anchors).toEqual([]);
  });

  it("the status sentence must PASS the gate — 'under' is a comparative trigger", () => {
    // auditClaims fires on a positional word that relates a QUANTITY. "under" is one,
    // and this email exists to write it. Settling the sentence is what keeps the gate
    // sharp WITHOUT weakening it — the trigger word is spent on a sentence WE wrote.
    expect(proseViolations(settleStatus().sentence, "", [settleStatus()])).toEqual([]);
  });

  it("but 'under contract' bolted onto a QUANTITY is still killed", () => {
    // The narrator merging the status into a price clause is a NEW claim, and dies.
    const merged = "This home is under contract at the full asking price of $595,000.";
    expect(proseViolations(merged, "", INPUT.settled)).not.toEqual([]);
  });

  it("new construction is a FLAG, not a figure", () => {
    expect(settleNewConstruction(FACTS)?.sentence).toBe("It is new construction.");
    expect(settleNewConstruction({ ...FACTS, isNewConstruction: false })).toBeNull();
  });
});

describe("auditClaims is WIRED — proseViolations catches the generic claim shapes", () => {
  const S = INPUT.settled;

  it("a COMPARISON the narrator drew itself (the market-comps inversion class)", () => {
    expect(proseViolations("The ask sits below the median for the area.", "", S)).not.toEqual([]);
  });

  it("a TRAJECTORY invented from a single level (the sphere-weekly class)", () => {
    expect(proseViolations("Interest in this ZIP is widening.", "", S)).not.toEqual([]);
  });

  it("a SEQUENCE of market events (the class that shipped HERE)", () => {
    expect(proseViolations("The price was cut before the contract.", "", S)).not.toEqual([]);
  });

  it("a MOTIVE — we never hold why anyone did anything", () => {
    expect(proseViolations("The seller is motivated.", "", S)).not.toEqual([]);
  });

  it("a LOCATION relation — and it beat a ban on the word 'street' with 'Shore Dr'", () => {
    expect(proseViolations("Two more just like it on Shore Dr.", "", S)).not.toEqual([]);
  });

  it("an UNANCHORED number — a digit no settled fact contains", () => {
    const hits = proseViolations("It drew 14 showings.", "", S);
    expect(hits.some((h) => h.startsWith("unanchored-number:14"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. *** THE DONE-CONDITION *** — the narrator receives no raw set.
// ─────────────────────────────────────────────────────────────────────────────

describe("THE NARRATOR RECEIVES NO RAW SET — structural, and greppable", () => {
  const RICH: NarratorInput = {
    settled: settleAll(FACTS, TIMING),
    remarks: "Direct canal access with a private dock.",
  };
  const shown = narratorSources(RICH).join("\n");

  it("is handed NEITHER number the refuted build compared", () => {
    // WORD-BOUNDARY, not substring: `toContain("75")` passes for "$104,975", which is
    // a legitimately-anchored figure. The claim is that neither number appears AS A
    // NUMBER — and a lazy substring assertion here would have failed for the wrong
    // reason and taught me nothing.
    expect(shown).not.toMatch(new RegExp(`\\b${DAYS_LISTED}\\b`)); // 75 — the home's clock
    expect(shown).not.toMatch(new RegExp(`\\b${TIMING.areaDom}\\b`)); // 72 — the ZIP's median
    // Both are live in `buildUnderContract`'s scope on the very line that builds this
    // input. Neither is passed. IT CANNOT COMPARE TWO NUMBERS IT WAS NEVER GIVEN TWO OF.
    expect(shown).not.toContain(LISTED_ON);
    expect(shown).not.toContain(LISTED_ISO);
  });

  it("is handed NO raw peer set — nothing to draw a new count from", () => {
    for (const p of PEERS) expect(shown).not.toMatch(new RegExp(`\\b${p}\\b`));
  });

  it("EVERY numeral it can see is an ANCHOR — allowedNumerals ⊇ what it was shown", () => {
    // The invariant that makes the unanchored-number check total: the model cannot
    // even COPY a digit that isn't already permitted, because it was never shown one.
    const allowed = new Set(RICH.settled.flatMap((s) => s.anchors));
    for (const n of numeralsIn(shown)) expect(allowed.has(n)).toBe(true);
  });

  it("the TYPE itself carries no figure — this is the greppable part", () => {
    // If someone adds `areaDom`, `daysListed`, `peers` or `facts` to NarratorInput,
    // this fails and they have to justify handing the model something to compare.
    expect(Object.keys(RICH).sort()).toEqual(["remarks", "settled"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The timing facts — a DATE, a RUNNING AGE, and an AREA MEDIAN.
// ─────────────────────────────────────────────────────────────────────────────

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

  it("exposes NO subject-vs-area helper to be re-narrated as an interval", async () => {
    const mod = (await import("./under-contract")) as Record<string, unknown>;
    expect(mod.daysOnMarket).toBeUndefined(); // the old, refuted name
    expect(mod.daysToContract).toBeUndefined();
    expect(mod.compareDom).toBeUndefined();
    expect(mod.domChartSpec).toBeUndefined();
  });
});

describe("loadAreaTiming — the ZIP's median, and its COMMENSURABLE peer set", () => {
  // The REAL token shape (`SWFL-7421-v{n}-{YYYYMMDD}`) — asOfFromToken parses the
  // trailing 8 digits. My first fixture invented an `@2026-06-29` form, the parser
  // returned null, and the old `?? brain.freshness_token` fallback would have shipped
  // the raw token into an email. That is how the Rule-5 bug above got caught.
  const brain = (rows: Array<{ key: string; cells: Record<string, unknown> }>) => ({
    freshness_token: "SWFL-7421-v9-20260629",
    output: { detail_tables: [{ id: "housing_by_zip", rows }] },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = (rows: Parameters<typeof brain>[0]) => (async () => brain(rows)) as any;

  it("splits the subject ZIP from its peers — same metric, same cohort, same source", async () => {
    const t = await loadAreaTiming("33905", {
      load: load([
        { key: "33905", cells: { median_dom: 72, metro: METRO } },
        { key: "33908", cells: { median_dom: 96, metro: METRO } },
        { key: "33916", cells: { median_dom: 51, metro: METRO } },
      ]),
    });
    expect(t?.areaDom).toBe(72);
    expect(t?.metro).toBe(METRO);
    expect(t?.peers.sort((a, b) => a - b)).toEqual([51, 96]);
    expect(t?.asOf).toBe("06/29/2026"); // MM/DD/YYYY — never the raw token
  });

  it("*** COUNTS ONLY THE SUBJECT'S OWN METRO — the population bug ***", async () => {
    // THE FINDING. Live, `housing_by_zip` holds 124 rows across FOUR Redfin metros:
    // Cape Coral (Lee) 39, Naples (Collier) 20, Punta Gorda (CHARLOTTE) 13, and North
    // Port (SARASOTA/MANATEE) 52. My first cut counted over ALL of them and called
    // them "SWFL ZIP codes we track" — a set that is more than half outside our
    // coverage. CLAUDE.md: "Charlotte/Glades/Sarasota are NOT real coverage today."
    //
    // settledCount would have counted that PERFECTLY. The arithmetic was exact and the
    // sentence was false. A gate over the wrong population is a correct number welded
    // to a lie — the refutation wearing a new host.
    const t = await loadAreaTiming("33905", {
      load: load([
        { key: "33905", cells: { median_dom: 72, metro: "Cape Coral, FL" } },
        { key: "33908", cells: { median_dom: 96, metro: "Cape Coral, FL" } },
        { key: "34112", cells: { median_dom: 51, metro: "Naples, FL" } }, // Collier
        { key: "33950", cells: { median_dom: 88, metro: "Punta Gorda, FL" } }, // CHARLOTTE
        { key: "34287", cells: { median_dom: 120, metro: "North Port, FL" } }, // SARASOTA
      ]),
    });
    expect(t?.peers).toEqual([96]); // ONLY the Cape Coral peer. Not Naples, not Sarasota.
    // And the sentence names the metro VERBATIM from the row — never "SWFL", which
    // would claim Charlotte and Sarasota, and never a county name we inferred.
    expect(settleAreaTiming(t)!.sentence).toContain("ZIP codes in the Cape Coral, FL metro");
    expect(settleAreaTiming(t)!.sentence).not.toMatch(/\bSWFL ZIP/);
  });

  it("drops thin-sample and null rows — a benchmark is never built on noise", async () => {
    const t = await loadAreaTiming("33905", {
      load: load([
        { key: "33905", cells: { median_dom: 72, metro: METRO } },
        { key: "33913", cells: { median_dom: 300, low_sample: true, metro: METRO } },
        { key: "33914", cells: { median_dom: null, metro: METRO } },
        { key: "33916", cells: { median_dom: 40, metro: METRO } },
      ]),
    });
    expect(t?.peers).toEqual([40]);
  });

  it("a thin-sample SUBJECT is null too — the same guard, both sides", async () => {
    // The subject and the peers MUST be filtered on identical rules, or the count
    // compares a number we would not have shown against numbers we would.
    expect(
      await loadAreaTiming("33905", {
        load: load([{ key: "33905", cells: { median_dom: 72, low_sample: true, metro: METRO } }]),
      }),
    ).toBeNull();
  });

  it("the subject ZIP missing, or metro-less → null → open slots, never a fabrication", async () => {
    expect(
      await loadAreaTiming("33905", {
        load: load([{ key: "34112", cells: { median_dom: 51, metro: "Naples, FL" } }]),
      }),
    ).toBeNull();
    // No metro on the row → we cannot name the population → NO claim at all.
    expect(
      await loadAreaTiming("33905", { load: load([{ key: "33905", cells: { median_dom: 72 } }]) }),
    ).toBeNull();
    expect(await loadAreaTiming("not-a-zip")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. The grid.
// ─────────────────────────────────────────────────────────────────────────────

/** The doc's block sequence, the way campaign-coherence.test.ts reads it. */
const spineOf = (doc: EmailDoc): string[] =>
  [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });

const heroOf = (doc: EmailDoc, ribbon: boolean) =>
  doc.blocks.find((b) => b.type === "hero" && Boolean(b.props.ribbon) === ribbon);

describe("buildUnderContractGrid — it wears the CAMPAIGN CHROME, not a grid of its own", () => {
  // ── THE MIGRATION (07/13/2026) ─────────────────────────────────────────────
  // This recipe used to emit FOUR STACKED STAT GRIDS — 3 + 3 + 3 + 1, ten chunky
  // 32px cells, a WALL — while New Listing ran one hairline spec strip. Seven
  // lifecycle emails, seven layouts, "one campaign" that read as seven companies.
  // Operator: "EACH EMAIL WOULD HAVE THE SAME LOOK, JUST DIFFERENT INFORMATION."
  // The shape now comes from `buildLifecycleEmail`, and these tests pin that.

  it("*** THE WALL IS GONE *** — the campaign has ONE stat device, and it is the STRIP", () => {
    const s = spineOf(fullDoc());
    // FOUR of these is what shipped. Zero is the contract.
    expect(s.filter((x) => x === "stats:grid")).toEqual([]);
    // The house's spec line, plus this recipe's own TIMING line. Both strips.
    expect(s.filter((x) => x === "stats:strip").length).toBe(2);
  });

  it("wears the campaign spine, in the campaign's order", () => {
    const s = spineOf(fullDoc());
    expect(s.slice(0, 5)).toEqual([
      "header",
      "hero:ribbon", // the ONE element that says which email in the campaign this is
      "image:photo",
      "hero:subject", // centred: ADDRESS over PRICE
      "stats:strip", // ONE hairline spec line — never a wall
    ]);
    expect(s.slice(-3)).toEqual(["agent-card", "button", "footer"]);
    // Exactly one narrative slot and exactly one CTA.
    expect(s.filter((x) => x === "text").length).toBe(1);
    expect(s.filter((x) => x === "button").length).toBe(1);
  });

  it("the RIBBON carries the word; the HERO carries address over price", () => {
    const doc = fullDoc();
    expect(heroOf(doc, true)?.type === "hero" && heroOf(doc, true)!.props.kicker).toBe(
      "Under Contract",
    );
    const hero = heroOf(doc, false);
    expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
    expect(hero?.type === "hero" && hero.props.label).toBe(FACTS.address);
    // The chrome centres it and puts the ADDRESS first — that is how a flyer reads.
    expect(hero?.type === "hero" && hero.props.align).toBe("center");
    expect(hero?.type === "hero" && hero.props.order).toBe("label-first");
  });

  it("SETS THE TWO CLOCKS SIDE BY SIDE — and LABELS them as different quantities", () => {
    const doc = fullDoc();
    expect(cellFor(doc, "Listed")?.value).toBe("04/29/2026");
    // A RUNNING AGE. The label never says "on market" (an MLS term whose clock stops
    // at pending) and never says "to contract" (held by no source — the fabrication).
    expect(cellFor(doc, "Days Since Listed")?.value).toBe("75");
    // A COMPLETED duration over homes that SOLD. The label says TO SELL, because that
    // is what median_dom measures. The two labels name two different quantities on
    // their face — and no sentence anywhere relates them.
    expect(cellFor(doc, "Typical Days to Sell in 33905")?.value).toBe("72");
    expect(cellFor(doc, "Days to Contract")).toBeUndefined();
    expect(cellFor(doc, "Days on Market")).toBeUndefined();
  });

  it("NO TIMING CELL IS EMPHASISED — a comparison drawn in typography is still a claim", () => {
    // `emphasis: "primary"` says WHICH NUMBER WINS THE ARGUMENT. The whole point of the
    // timing line is that these two clocks are NOT commensurable and make NO argument
    // against each other (see THE NON-COMMENSURABILITY). Weighting one over the other
    // would assert the relation the prose is structurally forbidden from writing.
    const timingCells = timingLine({
      listedOn: LISTED_ON,
      daysListed: DAYS_LISTED,
      timing: TIMING,
      zip: "33905",
    });
    const stats = timingCells.type === "stats" ? timingCells.props.stats : [];
    expect(stats.every((c) => c.emphasis === undefined)).toBe(true);
    // …and it is a STRIP. The campaign has exactly one stat device.
    expect(timingCells.type === "stats" && timingCells.props.variant).toBe("strip");
  });

  it("the SPEC STRIP is the shared listing spec line — the same six cells New Listing wears", () => {
    const doc = fullDoc();
    // ONE authority (`listingSpecs`), so a subscriber who got the New Listing email in
    // April sees the identical spec line here in July.
    expect(cellFor(doc, "Beds")?.value).toBe("3");
    expect(cellFor(doc, "Baths")?.value).toBe("3.5");
    expect(cellFor(doc, "Sq Ft")?.value).toBe("2,847");
    expect(cellFor(doc, "Lot")?.value).toBe("0.26 ac");
    expect(cellFor(doc, "$/Sq Ft")?.value).toBe("$209"); // 595000 / 2847 = 208.99…
    expect(cellFor(doc, "$/Sq Ft")?.emphasis).toBe("primary"); // it wins the argument
    expect(cellFor(doc, "Type")?.value).toBe("Residential");
    expect(cellFor(doc, "Type")?.emphasis).toBe("muted"); // context, not competing
  });

  it("the PRICE is stated ONCE — it left the cells when it moved into the hero", () => {
    // The old grid printed the ask in a "List Price" cell AND nowhere else useful; the
    // chrome's hero is the price's home. Two statements of one number is a wall, not a flyer.
    expect(cellFor(fullDoc(), "List Price")).toBeUndefined();
  });

  it("the derived cell states its provenance — the strip carries the footnote", () => {
    const strip = fullDoc().blocks.find((b) => b.type === "stats" && b.props.variant === "strip");
    expect(strip?.type === "stats" && strip.props.footnote).toContain("Computed from list price");
  });

  it("asks for the backup offer — that is the whole point of this email", () => {
    const btn = fullDoc().blocks.find((b) => b.type === "button");
    expect(btn?.type === "button" && btn.props.label).toBe("Submit a Backup Offer");
    // The CTA asks for the NEXT ACTION. It never points at what the reader is already
    // looking at ("See the New Price" on the price-cut email — the operator's example).
  });

  it("leaves the commentary slot EMPTY for the narrator (fillNarrative skips a filled one)", () => {
    const text = fullDoc().blocks.find((b) => b.type === "text");
    expect(text?.type === "text" && text.props.body).toBe("");
  });

  it("builds NO chart slot at all — the registry says chart: none", () => {
    // dom-vs-area needed this home's days-to-contract as its subject bar. That bar can
    // never be honestly drawn, so the box is never BUILT — not reserved then dropped.
    // A fabricated comparison rendered as a PICTURE is worse than in prose: a chart
    // reads as measured.
    const chart = fullDoc().blocks.find((b) => b.type === "image" && b.props.kind === "chart");
    expect(chart).toBeUndefined();
  });

  it("stacks with no void — every block sits directly under the one above it", () => {
    const laid = fullDoc()
      .blocks.map((b) => b.layout!)
      .sort((a, b) => a.y - b.y);
    let cursor = 0;
    for (const l of laid) {
      expect(l.y).toBe(cursor);
      cursor += l.h;
    }
  });

  it("THE BRAND IS STICKY — the chrome is the SHAPE, the user's colours are the SKIN", () => {
    const branded: EmailDoc = {
      globalStyle: { ...DEFAULT_GLOBAL_STYLE, accentColor: "#123456" },
      blocks: [],
    };
    const doc = buildUnderContractGrid({
      facts: FACTS,
      current: branded,
      listedOn: LISTED_ON,
      daysListed: DAYS_LISTED,
      timing: TIMING,
    });
    expect(doc.globalStyle.accentColor).toBe("#123456");
  });
});

describe("THE OPEN-SLOT CONTRACT — a gap is an invitation, never a zero", () => {
  /** Nothing timing-related resolved: no list date AND no ZIP median. */
  const blindDoc = () =>
    buildUnderContractGrid({
      facts: FACTS,
      current: BLANK_DOC,
      listedOn: null,
      daysListed: null,
      timing: null,
    });

  it("an unsourced list date and an unsourced age are OPEN SLOTS, never a 0", () => {
    // THE SLOT RULE (lib/email/CLAUDE.md): the LABEL is the instruction. "Days Since
    // Listed" over an empty value tells the user exactly what to type; on the canvas
    // it wears a dashed "+ Add" affordance. A "0" would read as a real figure.
    const cells = statsOf(blindDoc());
    expect(cells.find((c) => c.label === "Listed")?.value).toBe("");
    expect(cells.find((c) => c.label === "Days Since Listed")?.value).toBe("");
    expect(cells.some((c) => c.value === "0")).toBe(false);
  });

  it("an unsourced area median is an OPEN SLOT, never a fabricated benchmark", () => {
    // No timing → we cannot even name the ZIP off the row, so the label falls back to
    // the generic form. Either way the VALUE is empty: we never invent a benchmark.
    const cells = statsOf(blindDoc());
    expect(cells.find((c) => c.label.startsWith("Typical Days to Sell"))?.value).toBe("");
  });

  it("still leads with the price — the subject hero is never a naked ribbon", () => {
    const hero = heroOf(blindDoc(), false);
    expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
    expect(hero?.type === "hero" && hero.props.label).toBe(FACTS.address);
  });

  it("NO open slot reaches the recipient — it is a canvas affordance only", async () => {
    const html = await renderEmailDocHtml(blindDoc());
    // Every cell in the timing line is unsourced → StatsBlock drops each cell, and a
    // row with no surviving cell does not exist in the sent email at all.
    expect(html).not.toContain("Days Since Listed");
    expect(html).not.toContain("Typical Days to Sell");
    expect(html).not.toContain("Listed");
    // …while the sourced facts DO ship.
    expect(html).toContain("$595,000");
    expect(html).toContain("Under Contract"); // the ribbon always rides
  });

  it("an unsourced spec is an instruction, and the sent email simply omits it", async () => {
    const bare: ListingFacts = {
      address: "1 Nowhere St, Fort Myers, FL, 33905",
      photos: [],
      sourceUrl: "https://www.swfldatagulf.com",
    };
    const doc = buildUnderContractGrid({
      facts: bare,
      current: BLANK_DOC,
      listedOn: null,
      daysListed: null,
      timing: null,
    });
    expect(statsOf(doc).every((c) => c.value === "")).toBe(true);
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("type the bedroom count");
    expect(html).not.toContain("Beds");
    expect(html).not.toMatch(/>0</);
  });
});

describe("THE SENT EMAIL — no interval, no ordering, no comparison", () => {
  it("carries the sourced facts and NONE of the refuted claims", async () => {
    const html = await renderEmailDocHtml(fullDoc());
    expect(html).toContain("$595,000");
    expect(html).toContain("04/29/2026");
    expect(html).not.toMatch(/days?\s+on\s+(the\s+)?market/i);
    expect(html).not.toMatch(/days?\s+to\s+contract/i);
    expect(html).not.toMatch(/went under contract after/i);
    expect(html).not.toMatch(/in line with/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. The recipe-specific invention classes.
// ─────────────────────────────────────────────────────────────────────────────

describe("timingClaims — INVENTION CLASS 3: a claim about time", () => {
  it("catches any duration, numeric or spelled out", () => {
    expect(timingClaims("It was listed for 75 days.")).not.toEqual([]);
    expect(timingClaims("Against a 72-day median.")).not.toEqual([]);
    expect(timingClaims("It found a buyer in three weeks.")).not.toEqual([]);
    expect(timingClaims("On the market barely a month.")).not.toEqual([]);
  });

  it("catches days-on-market phrasing in any form", () => {
    expect(timingClaims("Its days on market tell the story.")).not.toEqual([]);
    expect(timingClaims("Days to contract: well under the norm.")).not.toEqual([]);
    expect(timingClaims("Its time on the market was notable.")).not.toEqual([]);
    expect(timingClaims("75 days since listed.")).not.toEqual([]);
  });

  it("catches an ORDERING of events we do not hold — the price cut vs the contract", () => {
    expect(timingClaims("The seller cut the price before a contract was reached.")).not.toEqual([]);
    expect(timingClaims("A contract was accepted soon after.")).not.toEqual([]);
    expect(timingClaims("Interest picked up after the price cut.")).not.toEqual([]);
    expect(timingClaims("The reduction drew a buyer.")).not.toEqual([]);
  });

  it("catches SPEED characterization — ours to state, and we never state it", () => {
    expect(timingClaims("This one went quickly.")).not.toEqual([]);
    expect(timingClaims("It didn't last.")).not.toEqual([]);
    expect(timingClaims("It was snapped up.")).not.toEqual([]);
    expect(timingClaims("A slow burn, then a contract.")).not.toEqual([]);
  });

  it("catches COMPARING this home to the area — a comparative claim is a factual claim", () => {
    expect(timingClaims("That is in line with the area median.")).not.toEqual([]);
    expect(timingClaims("It beat the typical home in this ZIP.")).not.toEqual([]);
    expect(timingClaims("The typical home here needs 72 days.")).not.toEqual([]);
  });

  it("PASSES an honest transaction paragraph — the guard is sharp, not merely loud", () => {
    const good =
      "This home is under contract. It is new construction. The asking price came down by " +
      "$104,975, to $595,000. Backup offers are still being accepted.";
    expect(timingClaims(good)).toEqual([]);
    expect(proseViolations(good, narratorSources(INPUT).join(" "), INPUT.settled)).toEqual([]);
  });
});

describe("inventedAttributes — INVENTION CLASS 1: the class that is not a number", () => {
  // This guard exists because the SHARED narrator (authorListingNarrative) invented
  // "this three-story home" on these exact facts, live, 07/13/2026.
  const SOURCES = "CONTEXT: under contract. It is new construction.";

  it("catches the storey count the shared narrator actually invented", () => {
    const bad = "New construction on a quarter-acre lot, this three-story home is under contract.";
    expect(inventedAttributes(bad, SOURCES)).toContain("story");
  });

  it("catches the classic unsourced qualities — water, a pool, a view, a renovation", () => {
    expect(inventedAttributes("Waterfront living at its finest.", SOURCES)).toContain("waterfront");
    expect(inventedAttributes("The pool is heated.", SOURCES)).toContain("pool");
    const viewHits = inventedAttributes("Sweeping views of the gulf.", SOURCES);
    expect(viewHits).toContain("views");
    expect(viewHits).toContain("gulf");
    expect(inventedAttributes("Fully renovated in 2024.", SOURCES)).toContain("renovated");
  });

  it("ALLOWS an attribute the agent's own pasted description states (LANE 2)", () => {
    const withRemarks = `${SOURCES} THE AGENT'S OWN LISTING DESCRIPTION:\nDirect canal access with a private dock and a heated pool.`;
    expect(inventedAttributes("A canal-front home with a heated pool.", withRemarks)).toEqual([]);
  });

  it("OUR OWN BYLINE MAY NOT LAUNDER AN ATTRIBUTE — 'SWFL Data Gulf' is not a gulf view", () => {
    // The guard caught this itself the moment the citation started riding inside the
    // settled sentence. It cuts both ways, and both directions are pinned here.
    const citedSources = narratorSources(INPUT).join(" ");
    expect(citedSources).toContain("SWFL Data Gulf"); // the byline IS in the sources…

    // …and it must NOT wave through an invented water view.
    expect(inventedAttributes("Sweeping views of the gulf.", citedSources)).toContain("gulf");

    // …while our own cited sentence must still pass its own gate, or every honest
    // paragraph silently degrades to the fallback forever.
    expect(inventedAttributes(settleAreaTiming(TIMING)!.sentence, "")).toEqual([]);
  });
});

describe("offerClaims — INVENTION CLASS 2: a fabricated contract term", () => {
  it("catches the exact sentence the model actually produced", () => {
    expect(offerClaims("The seller accepted an offer at the current ask of $595,000.")).not.toEqual(
      [],
    );
  });

  it("catches over/under-ask and full-price claims", () => {
    expect(offerClaims("It went over asking.")).not.toEqual([]);
    expect(offerClaims("They took a full-price offer.")).not.toEqual([]);
    expect(offerClaims("An offer of $600,000 was accepted.")).not.toEqual([]);
  });

  it("ALLOWS the sourced price-cut sentence — that is the ASK's history, not the offer", () => {
    expect(offerClaims(settlePriceCut(FACTS)!.sentence)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. The floor. When the model fails twice, THIS is what ships.
// ─────────────────────────────────────────────────────────────────────────────

describe("fallbackNote — deterministic, zero model, and it FABRICATES NOTHING", () => {
  it("PASSES ITS OWN SHIP GATE — the guaranteed path can no longer lie", () => {
    // It is assembled from settled sentences ONLY, so this holds BY CONSTRUCTION.
    const note = fallbackNote(INPUT);
    expect(proseViolations(note, narratorSources(INPUT).join(" "), INPUT.settled)).toEqual([]);
  });

  it("states the status, new construction, the sourced cut, and the settled count", () => {
    const note = fallbackNote(INPUT);
    expect(note).toBe(
      "This home is under contract. It is new construction. " +
        "The asking price came down by $104,975, to $595,000. " +
        `3 of 6 ZIP codes in the Cape Coral, FL metro have a longer typical time-to-sell than 33905 ${CITE}. ` +
        "Backup offers are still being accepted — if this one was on your list, it is " +
        "worth putting your position on paper now.",
    );
    // No interval, no ordering, no speed.
    expect(note).not.toMatch(/\bdays?\b/i);
    expect(note).not.toMatch(/\bbefore\b|\bafter\b/i);
  });

  it("degrades to the bare status when we hold nothing else — never a zero, never a guess", () => {
    const bare: ListingFacts = { address: "1 Nowhere St", photos: [], sourceUrl: "x" };
    const input: NarratorInput = { settled: settleAll(bare, null) };
    expect(fallbackNote(input)).toBe(
      "This home is under contract. Backup offers are still being accepted — if this one " +
        "was on your list, it is worth putting your position on paper now.",
    );
    expect(proseViolations(fallbackNote(input), "", input.settled)).toEqual([]);
  });

  it("asserts nothing about the house itself", () => {
    expect(inventedAttributes(fallbackNote(INPUT), "")).toEqual([]);
  });
});
