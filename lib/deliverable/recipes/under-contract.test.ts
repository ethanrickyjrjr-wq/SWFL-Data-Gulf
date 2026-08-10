// lib/deliverable/recipes/under-contract.test.ts
//
// R4 · UNDER CONTRACT — written NEW 08/06/2026 alongside the recipe it tests. The July
// suite that used to live at this path tested a builder that no longer exists (operator
// decree 08/05/2026: *"There can't be code for this if it is not from today. We are
// building everything new so we build it fucking right."*). Its two surviving describes —
// the vendor list-date chain — moved with that code to `lib/listings/list-date.test.ts`.
//
// ── THE INVARIANT THIS FILE DEFENDS ──────────────────────────────────────────
//
// New Listing's invariant is that the address DOES ship. Coming Soon's is that it does
// NOT. **Ours: the email states a PENDING fact and never a SOLD one.** A pending home has
// not sold, and we do not hold a sold price. Every test below is named for the failure
// mode it targets, per RULE 3.5.
//
// ZERO network calls, on purpose. `loadSpeed` guards on a ZIP, and the narrator only runs
// on honest material (pasted remarks or our own community layers) — so a fixture holding
// none of those exercises the whole structure deterministically.

import { describe, expect, it } from "bun:test";
import {
  buildUnderContract,
  daysToContract,
  SOLD_LANGUAGE,
  speedOpenSlots,
  speedStats,
  UNDER_CONTRACT_FIELDS,
  underContractSpecs,
  underContractSubject,
  type Speed,
} from "./under-contract";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { RECIPES } from "@/lib/deliverable/recipes";
import type { RecipeBuildContext } from "./index";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const SUBJECT = "8348 Southwindbay Cir, Fort Myers, FL 33908";

const FACTS: ListingFacts = {
  address: SUBJECT,
  city: "Fort Myers",
  state: "FL",
  zip: "33908",
  price: "$659,000",
  beds: "3",
  baths: "2",
  sqft: "1978",
  lotSize: "0.23",
  propertyType: "single_family",
  photos: [],
  sourceUrl: "https://www.swfldatagulf.com",
};

/** Every string a recipient could ever read, flattened out of a built doc. */
function allText(doc: EmailDoc): string {
  const out: string[] = [...(doc.subjectVariants ?? []), ...(doc.ctaVariants ?? [])];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  doc.blocks.forEach((b) => walk(b.props));
  return out.join("\n");
}

const statsOf = (doc: EmailDoc): StatItem[] =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? (b.props.stats as StatItem[]) : []));

const ctxFor = (facts: ListingFacts | null): RecipeBuildContext => ({
  recipe: RECIPES["under-contract"],
  prompt: "",
  currentDoc: defaultDoc(),
  facts,
  resolved: Boolean(facts),
});

/** The recipe's own source, for the guards that are about what the code MAY NOT READ. */
const SOURCE = await Bun.file(
  new URL("./under-contract.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
).text();

/**
 * SOURCE WITH COMMENTS STRIPPED — what the code actually DOES, not what it explains.
 *
 * Caught by its own test 08/06/2026: the "never reads the sold-side median" guard went red
 * against a prose comment that names `redfin_swfl.median_dom` precisely to say we do NOT
 * use it. A guard that fires on the documentation of a rule punishes writing the rule down,
 * and the next person's fix is to delete the explanation — which is exactly backwards.
 * Forbidden-token checks read THIS; required-token checks may read either.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 1 — the email claims a SALE. It has not sold.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: sold language renders on a home that has not sold", () => {
  it("ships none of the banned sold phrasings anywhere a reader can see", async () => {
    const doc = await buildUnderContract(ctxFor(FACTS));
    expect(doc).not.toBeNull();
    const text = allText(doc!).toLowerCase();
    for (const phrase of SOLD_LANGUAGE) {
      expect(text).not.toContain(phrase);
    }
  });

  it("keeps the banned list as ONE exported root, so the recipe and the acceptance script cannot drift", () => {
    // The bytes assertion in scripts/email/render-under-contract.mts imports THIS array.
    // A second hand-typed copy is how a guard silently stops guarding.
    expect(SOLD_LANGUAGE).toContain("sold for");
    expect(SOLD_LANGUAGE).toContain("sold price");
    expect(SOLD_LANGUAGE).toContain("closed at");
    expect(SOLD_LANGUAGE).toContain("final sale");
    expect(SOLD_LANGUAGE).toContain("sale price");
    expect(Object.isFrozen(SOLD_LANGUAGE)).toBe(true);
  });

  it("the ribbon says the status and the status is not a sale", () => {
    expect(UNDER_CONTRACT_FIELDS.ribbon).toBe("Under Contract");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 2 — the price shown is not the LIST price.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the printed price is not the list price", () => {
  it("prints facts.price verbatim as the hero value", async () => {
    const doc = await buildUnderContract(ctxFor(FACTS));
    expect(allText(doc!)).toContain("$659,000");
  });

  it("never derives, rounds, or discounts the price", () => {
    // The only thing the recipe may do with a price is print it and divide it by sqft.
    expect(CODE).not.toMatch(/sold_price|salePrice|sale_price/);
  });

  it("no price at all → an open slot, never a zero", async () => {
    const doc = await buildUnderContract(ctxFor({ ...FACTS, price: undefined }));
    expect(doc).not.toBeNull();
    expect(allText(doc!)).not.toMatch(/\$0\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 3 — the speed number is ESTIMATED instead of dropped.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the speed line estimates instead of dropping", () => {
  it("computes days-to-contract from our own listing clock when it is real", () => {
    expect(daysToContract({ ...FACTS, daysOnMarket: 18 })).toBe(18);
  });

  it("DROPS to null when the listing clock has no real count — never an estimate", () => {
    // `resolve-subject.ts` attaches `daysOnMarket` ONLY when the count is not a
    // first-seen floor. Absent therefore means "we do not honestly hold this".
    expect(daysToContract(FACTS)).toBeNull();
    expect(daysToContract({ ...FACTS, daysOnMarket: undefined })).toBeNull();
  });

  it("refuses a negative or nonsense count rather than printing it", () => {
    expect(daysToContract({ ...FACTS, daysOnMarket: -3 })).toBeNull();
    expect(daysToContract({ ...FACTS, daysOnMarket: Number.NaN })).toBeNull();
  });

  it("a build with no real clock ships OPEN SLOTS whose labels are the instruction", async () => {
    const doc = await buildUnderContract(ctxFor(FACTS));
    const labels = statsOf(doc!).map((s) => s.label);
    const slots = speedOpenSlots().map((s) => s.label);
    // EVERY open-slot label must actually be on the doc, carrying an empty value.
    // This used to read `if (cell) expect(...)` with a trailing
    // `expect(labels.length).toBeGreaterThan(0)` — which asserted nothing: the guard
    // skipped when the cell was missing, and the length check passed off the spec strip
    // whether or not the open-slot path had fired at all. A test that cannot fail is a
    // comment.
    expect(labels).toEqual(expect.arrayContaining(slots));
    for (const slot of slots) {
      const cell = statsOf(doc!).find((s) => s.label === slot);
      expect(cell).toBeDefined();
      expect(cell!.value).toBe("");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 4 — `days_in_state` is read and printed as an interval.
//
// TRAP 1 from the build handoff, and the reason the July recipe was refuted. The column
// ages only while `state` is unchanged, and `flag_pending` is NOT part of `state` — so it
// is days-in-ACTIVE. A live Lee row reads flag_pending true, state active, days_in_state
// 34, listed 09/13/2024. Printing "under contract in 34 days" off it is a fabricated
// number built from a real column.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: days_in_state is read as time-under-contract", () => {
  it("the recipe never names the column at all", () => {
    expect(CODE).not.toMatch(/days_in_state/);
  });

  it("the recipe never selects it from the lake", () => {
    expect(CODE).not.toMatch(/daysInState/);
  });

  it("never emits a 'days on market' cell — that cell is for ACTIVE listings only", async () => {
    // `listing-flyer.ts` says it in as many words: "this cell is for ACTIVE listings
    // ONLY. Never pass it on under-contract or just-sold." The market clock stopped.
    const doc = await buildUnderContract(ctxFor({ ...FACTS, daysOnMarket: 18 }));
    const labels = statsOf(doc!).map((s) => s.label);
    expect(labels).not.toContain("DOM");
    expect(allText(doc!).toLowerCase()).not.toContain("days on market");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 5 — the address does not ship.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the address does not ship", () => {
  it("prints the full street line in the hero — this is a public, celebrated status", async () => {
    const doc = await buildUnderContract(ctxFor(FACTS));
    expect(allText(doc!)).toContain("8348 Southwindbay Cir");
  });

  it("carries the ZIP too", async () => {
    const doc = await buildUnderContract(ctxFor(FACTS));
    expect(allText(doc!)).toContain("33908");
  });

  it("falls through to the terminal author rather than shipping a headless email", async () => {
    expect(await buildUnderContract(ctxFor(null))).toBeNull();
    expect(
      await buildUnderContract(ctxFor({ ...FACTS, address: undefined, city: undefined })),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 6 — the comparand is the SOLD-side median.
//
// `docs/standards/data-roots.md:69-71` — list-side is `listing_dom`, sold-side is
// `redfin_swfl.median_dom`, "never interchange." The July build compared against the
// sold-side median. That is a second, separate error from the date error.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the comparand is the sold-side median", () => {
  it("never reads the sold-side Redfin table", () => {
    expect(CODE).not.toMatch(/housing_by_zip|redfin/i);
  });

  it("reads the list-side median through the ONE root that already owns it", () => {
    expect(SOURCE).toMatch(/zip-benchmark|fetchZipBenchmark/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 7 — a degenerate median ships as if it meant something.
//
// The open `coming_soon_degenerate_funnel_floor` failure shape, arriving on a different
// email. A median over a handful of listings is not a market fact.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: a degenerate comparand ships anyway", () => {
  const speed = (over: Partial<Speed>): Speed => ({
    daysToContract: 18,
    medianDom: 96,
    sampleSize: 250,
    scopeLabel: "ZIP 33908",
    rung: 1,
    asOfIso: "2026-08-06",
    ...over,
  });

  it("ships BOTH numbers when the sample is real", () => {
    const cells = speedStats(speed({}));
    expect(cells.some((c) => c.value === "18")).toBe(true);
    expect(cells.some((c) => c.value === "96")).toBe(true);
  });

  it("drops the comparison below the sample floor — this home's number still ships", () => {
    const cells = speedStats(speed({ sampleSize: 3, medianDom: 12 }));
    expect(cells.some((c) => c.value === "18")).toBe(true);
    expect(cells.some((c) => c.value === "12")).toBe(false);
  });

  it("the floor is a FIELD, not a magic number", () => {
    expect(UNDER_CONTRACT_FIELDS.minMedianSample).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 8 — the printed scope is not the scope that was counted.
//
// §2.2.2's rung-3 lesson, verbatim: widening the scope CHANGES THE DISCLOSED CRITERION.
// A reader who re-runs the stated criterion must reproduce the printed number.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the label claims a scope the count did not use", () => {
  it("every consumer prints scopeLabel, never a ZIP of its own", () => {
    const cells = speedStats({
      daysToContract: 18,
      medianDom: 96,
      sampleSize: 250,
      scopeLabel: "Lee County",
      rung: 2,
      asOfIso: "2026-08-06",
    });
    const text = cells.map((c) => `${c.value} ${c.label}`).join(" ");
    expect(text).toContain("Lee County");
    expect(text).not.toContain("33908");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 9 — one row, three type sizes.
//
// Playbook §2.1.6 defects 4 and 5, re-committed on the very next email (§2.2.6 item 2).
// Operator: *"Why the fuck would you have so many different sizes."*
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: mixed emphasis inside one horizontal row", () => {
  it("the spec strip carries ONE weight across the row", () => {
    const cells = underContractSpecs(FACTS);
    expect(new Set(cells.map((c) => c.emphasis ?? "none")).size).toBe(1);
  });

  it("the speed row carries ONE weight across the row", () => {
    const cells = speedStats({
      daysToContract: 18,
      medianDom: 96,
      sampleSize: 250,
      scopeLabel: "ZIP 33908",
      rung: 1,
      asOfIso: "2026-08-06",
    });
    expect(new Set(cells.map((c) => c.emphasis ?? "none")).size).toBe(1);
  });

  it("the open-slot row carries ONE weight too", () => {
    expect(new Set(speedOpenSlots().map((c) => c.emphasis ?? "none")).size).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 10 — the CTA asks for a backup offer.
//
// Redfin cites NAR: only 6% of home sales fall through. That is a 1-in-17 ask. The
// honest recapture CTA is "here's what else," never "get in line."
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the CTA invites backup offers", () => {
  it("the label never asks the reader to queue behind a signed contract", () => {
    const label = UNDER_CONTRACT_FIELDS.ctaLabel.toLowerCase();
    expect(label).not.toContain("backup");
    expect(label).not.toContain("back-up");
    expect(label).not.toContain("get in line");
  });

  it("the registry prompt does not request one either — it is what a keyless ask seeds from", () => {
    const prompt = RECIPES["under-contract"].prompt.toLowerCase();
    expect(prompt).not.toContain("backup offer");
  });

  it("ships exactly ONE call to action", () => {
    expect(UNDER_CONTRACT_FIELDS.ctaLabel.split(/\s+/).length).toBeLessThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 11 — the subject line smuggles a claim or runs long.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the subject line is model-authored or overlong", () => {
  it("leads with the status and is deterministic", () => {
    expect(underContractSubject(FACTS, 18)).toBe("Under contract: 8348 Southwindbay Cir");
  });

  it("always resolves — there is no rung 4", () => {
    expect(underContractSubject({ ...FACTS, address: undefined }, null)).toContain("Fort Myers");
    expect(
      underContractSubject({ ...FACTS, address: undefined, city: undefined }, null).length,
    ).toBeGreaterThan(0);
  });

  it("never claims a sale in the subject", () => {
    const s = underContractSubject(FACTS, 18).toLowerCase();
    for (const phrase of SOLD_LANGUAGE) expect(s).not.toContain(phrase);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 12 — the recipe builds a pending DETECTOR.
//
// TRAP 2. The agent tells us. There is no under-contract state, pending is a flag on an
// otherwise-active row, and the flag is stale on 462 sold rows.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the recipe detects pending instead of being told", () => {
  it("never reads the pending flag or the transitions table", () => {
    expect(CODE).not.toMatch(/flag_pending|listing_transitions|to_state/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 13 — the community never reaches the writer.
//
// Operator decree 08/10/2026, verbatim: "UNDER CONTRACT HAS NO DESCRIPTION!!! WE ARE
// SENDING OUT EMAILS TO PEOPLE WHO MAY BUY IF THE DEAL FALLS THROUGH... WHY WOULD WE NOT
// HAVE A FUCKING DESCRIPTION AND COMMUNITY INFORMATION MAYBE." The 08/06 recipe wrote
// "the community rides" in a comment and then stripped `neighborhood` and
// `communityStats` from the writer's fact sheet — and refused to run the writer at all
// without a pasted description, so a house whose community layers sat sourced in our own
// lake (lane 1, free) still shipped a wall of numbers. The ladder read upside down.
// ─────────────────────────────────────────────────────────────────────────────

describe("FAILURE MODE: the community is stripped from the writer's fact sheet", () => {
  it("never strips neighborhood or communityStats from narratorFacts", () => {
    expect(CODE).not.toMatch(/neighborhood:\s*undefined/);
    expect(CODE).not.toMatch(/communityStats:\s*undefined/);
  });

  it("the writer gates on community material as well as a pasted description", () => {
    expect(CODE).toContain("hasCommunityMaterial");
    for (const layer of [
      "facts.community",
      "facts.insideTheGate",
      "facts.communityStats",
      "facts.neighborhood",
    ]) {
      expect(CODE).toContain(layer);
    }
  });

  it("still strips the costs and the stopped clock — the decree is positives, not a firehose", () => {
    // Costs are the realtor's conversation (same-day polish decree), and daysOnMarket /
    // lotSize stay stripped for the claim-gate reasons the recipe documents.
    expect(CODE).toMatch(/daysOnMarket:\s*undefined/);
    expect(CODE).toMatch(/lotSize:\s*undefined/);
    expect(CODE).toMatch(/yearBuilt:\s*undefined/);
    expect(CODE).toMatch(/hoaFee:\s*undefined/);
  });

  it("a house with neither material still builds — the paragraph stays an open slot", async () => {
    // FACTS holds no remarks and no community layers, so the writer must not fire and the
    // build must still land (this is also what keeps this suite offline).
    const doc = await buildUnderContract(ctxFor(FACTS));
    expect(doc).not.toBeNull();
  });
});
