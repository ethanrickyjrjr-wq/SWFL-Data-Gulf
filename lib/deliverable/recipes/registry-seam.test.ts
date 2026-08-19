// lib/deliverable/recipes/registry-seam.test.ts
//
// THE REGISTRY-WIDE SEAM ASSERTION — the guard the operator asked for when he said
// "build in place so Claude can't fuck more shit up", and then "ALL EMAILS".
//
// ── WHY THIS EXISTS, AND WHY THE OLD GUARD WAS NOT ENOUGH ────────────────────
//
// `design-system-reachability.test.ts` is a SOURCE-TEXT ledger: it greps recipe files
// for the literal string `layout: {`. That is evadable by renaming a variable, and it
// IS evaded today — `agent-launch.ts` writes `layout: l` and `market-pulse.ts` writes
// `layout: slotLayout`, so both hand-position blocks while the ledger stays green.
// It also cannot see a recipe that was registered five minutes ago.
//
// This test asserts on the OUTPUT instead. For EVERY key in `RECIPE_KEYS` it calls the
// registered builder and checks the doc that comes back:
//
//   1. `wentThroughSeam(doc)` — the Symbol `finalizeDoc` stamps. It survives the
//      `{...doc}` spreads recipes do, and it is dropped by JSON, so it proves
//      PROVENANCE, not shape. A flat hand-built `w:12` stack cannot fake it.
//   2. every block carries a numeric `layout` — no block sank to the y=1_000_000 pit.
//
// Neither check can be dodged by renaming anything, and a new recipe is covered the
// moment its key lands in the registry — which is the point.
//
// ── NO INVISIBLE ALLOWLIST ──────────────────────────────────────────────────
//
// The failure this repo already lived: `showing-prep-doc.ts` sat inside a private
// `KNOWN_BYPASS` const in a test file for weeks and nobody could see it. So every
// exemption here is EXPORTED, carries a reason and a `checks` key, and is printed by
// `scripts/email/playbook.mts`. An exemption you cannot see is an exemption that
// never gets closed.
//
// ── THE HARNESS ─────────────────────────────────────────────────────────────
//
// Stubs sit at the DATA BOUNDARY (`mock.module`), the same pattern
// `new-listing.test.ts` established: the real builder code runs end to end, only the
// network/lake/LLM edges are faked. This is NOT a second campaign simulator —
// `scripts/email/campaign-sim.mts` drives LIVE data through one real listing on a
// schedule; this runs offline, in CI, over every key. Different job, no overlap.
//
// Zero network calls, zero tokens spent.

import { test, expect, describe, mock, afterAll } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import * as realResolve from "@/lib/listings/resolve-subject";
import * as realMirror from "@/lib/media/hero-photo";
import * as realMarketContext from "@/lib/email/market-context";
import * as realCompHelper from "@/lib/assistant/comp-helper";
import * as realSteadyapi from "@/lib/listings/steadyapi";
import * as realFetchBrain from "@/lib/fetch-brain";
import * as realBackOnMarket from "@/lib/back-on-market/load-zip";
import * as realSpecToPng from "@/lib/email/spec-to-png";
import * as realGapFill from "@/lib/assistant/gap-fill";
import * as realApifyComps from "@/lib/listings/apify-comps";
import * as realApifyIdentity from "@/lib/listings/apify-identity";
import * as realCompPhotos from "@/lib/listings/comp-photos";
// Dynamic, not `import *`: the static form trips no-restricted-imports because the
// module exports the deferred-fix hatch `createServiceRoleClientUntyped`. We only
// need it to RESTORE the real module in afterAll, never to call it.
const realServiceRole = await import("@/utils/supabase/service-role");
import { SHORE_DR_FACTS } from "./__fixtures__/shore-dr";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

const NARRATIVE = "A well-kept home on a quiet street, priced for this market.";
const ZIP = "33914";

// ─────────────────────────────────────────────────────────────────────────────
// EXEMPTIONS — exported, reasoned, and each one owns a `checks` key.
// ─────────────────────────────────────────────────────────────────────────────

/** Keys with NO builder in `RECIPE_BUILDERS`. A key here degrades to the generic
 *  author at runtime; that is a real product state, not a bug — but it must be
 *  DECLARED, so a key silently losing its builder still turns this suite red. */
export const UNBUILT_KEYS: Readonly<Record<string, string>> = {};

/**
 * THE DEBT, DECLARED — email lanes that are RED against this guard today, each with
 * the reason and its `checks` key. This is NOT a mute: the assertion is INVERTED for
 * these keys, so the moment someone fixes one the suite goes red and tells them to
 * delete the line. An exemption that can rot green is the thing this file exists to
 * prevent.
 *
 * Found by running this guard for the first time, 08/04/2026. Two were predicted by
 * the handoff; two were not.
 */
export const SEAM_BYPASS_KNOWN: Readonly<Record<string, string>> = {
  "agent-launch":
    "Hand-positions its blocks (`layout: l`, agent-launch.ts) and never calls finalizeDoc. " +
    "Predicted by the 08/04 handoff §2 as one of two seam bypasses. Moving it is walk-order " +
    "step 7. Check: email_seam_bypass_agent_launch",
  "market-pulse":
    "Hand-positions its blocks (`layout: slotLayout`, market-pulse.ts) and never calls " +
    "finalizeDoc — the second predicted bypass, and the one that evades the source-text " +
    "ledger by naming a variable. Check: email_seam_bypass_market_pulse",
  // "back-on-market" — REMOVED 08/06/2026, because this guard's own inverted assertion went
  // red and demanded it. It used to return null when its zip lane missed
  // (loadBackOnMarketZip -> null), refusing the build instead of landing the grid with open
  // slots (RULE 0.7). Area mode now degrades to an open-slot grid, and property mode never
  // reads a zip rate at all, so both paths go through the seam. Check
  // email_back_on_market_refuses_on_data_miss closed with this.
  "default-grid":
    "The TERMINAL FALLBACK — every keyless ask lands here — rides fillSkeletonFromSources, " +
    "which patches a committed seed grid in place and never re-finalizes, so the doc carries " +
    "no seam stamp. Its blocks DO have layouts (inherited from the seed), so this is a " +
    "provenance gap, not a broken email. NOT predicted by the handoff. " +
    "Check: email_default_grid_no_seam_stamp",
};

/** Keys this harness cannot exercise, with the reason. `social-pack`/`social-cut`
 *  are a genuinely different renderer (Konva / buildWeek) and are not
 *  `RecipeBuilder`-shaped at all — they are excluded by `target: "social"`, not by
 *  this list. Anything landing HERE is an email lane we could not prove. */
export const HARNESS_EXEMPT: Readonly<Record<string, string>> = {};

// ─────────────────────────────────────────────────────────────────────────────
// THE DATA BOUNDARY — every edge stubbed, every builder's own logic left alone.
// mock.module is process-global and mock.restore() does NOT undo it, so snapshot
// and restore (the repo's established pattern).
// ─────────────────────────────────────────────────────────────────────────────

const ORIG: Record<string, unknown> = {
  "@/refinery/agents/anthropic.mts": { ...realAnthropic },
  "@/lib/listings/resolve-subject": { ...realResolve },
  "@/lib/media/hero-photo": { ...realMirror },
  "@/lib/email/market-context": { ...realMarketContext },
  "@/lib/assistant/comp-helper": { ...realCompHelper },
  "@/lib/listings/steadyapi": { ...realSteadyapi },
  "@/lib/fetch-brain": { ...realFetchBrain },
  "@/lib/back-on-market/load-zip": { ...realBackOnMarket },
  "@/utils/supabase/service-role": { ...realServiceRole },
  "@/lib/email/spec-to-png": { ...realSpecToPng },
  "@/lib/assistant/gap-fill": { ...realGapFill },
  "@/lib/listings/apify-comps": { ...realApifyComps },
  "@/lib/listings/apify-identity": { ...realApifyIdentity },
  "@/lib/listings/comp-photos": { ...realCompPhotos },
};
afterAll(() => {
  for (const [path, orig] of Object.entries(ORIG)) mock.module(path, () => orig);
});

/** The narrator: deterministic prose, zero tokens. Covers every recipe that writes
 *  commentary — the model may never write a figure, so a fixed string is honest. */
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...realAnthropic,
  getAnthropic: () => ({
    messages: {
      create: async () => ({ content: [{ type: "text", text: NARRATIVE }] }),
    },
  }),
}));

// The address spine: one real committed listing (326 Shore Dr), no geocode, no vendor.
mock.module("@/lib/listings/resolve-subject", () => ({
  ...realResolve,
  resolveSubjectListing: async () => structuredClone(SHORE_DR_FACTS),
}));
mock.module("@/lib/media/hero-photo", () => ({
  ...realMirror,
  mirrorHeroPhoto: async (url: string) => url,
}));

// The area spine's lake read — real SHAPE, fixed values, every one carrying a source.
mock.module("@/lib/email/market-context", () => ({
  ...realMarketContext,
  loadMarketFigures: async () => [
    {
      key: "home_value",
      label: "Typical home value",
      value: "$412,000",
      source: "Zillow ZHVI",
      as_of: "07/01/2026",
    },
    {
      key: "days_on_market",
      label: "Days on market",
      value: "62",
      source: "SWFL listing feed",
      as_of: "07/01/2026",
    },
    {
      key: "active_inventory",
      label: "Homes for sale",
      value: "1,204",
      source: "SWFL listing feed",
      as_of: "07/01/2026",
    },
  ],
}));

// Comps: three real-shaped nearby homes, each with beds AND sqft (the land filter).
const COMP = (addressLine: string, price: number, sqft: number) => ({
  addressLine,
  city: "Cape Coral",
  beds: 3,
  baths: 2,
  sqft,
  status: "sold",
  priceKind: "sold",
  price,
  priceDate: "2026-06-15",
  soldInDays: 41,
  sourceUrl: "https://www.realtor.com/example",
});
mock.module("@/lib/assistant/comp-helper", () => ({
  ...realCompHelper,
  // `compSources` is a SECOND network edge (market-comps reads it for the source
  // line). Leaving it real is what made this suite hang for 5s and time out —
  // stub every edge of a module you stub, not just the one you noticed.
  compSources: async () => ["SWFL listing feed"],
  compsForAddress: async () => ({
    comps: [
      COMP("1200 SE 1st St", 415000, 1750),
      COMP("1310 SE 2nd Ter", 448000, 1920),
      COMP("1425 SE 3rd Pl", 392000, 1610),
    ],
    sources: ["SWFL listing feed"],
  }),
}));

// The listing feeds (showcase / digest / under-contract).
const LISTING = (id: string, addressLine1: string, price: number) => ({
  id,
  addressLine1,
  formattedAddress: addressLine1,
  city: "Cape Coral",
  state: "FL",
  zipCode: ZIP,
  county: "Lee",
  latitude: 26.6,
  longitude: -81.9,
  propertyType: "Single Family",
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 1800,
  lotSize: 0.25,
  yearBuilt: 2004,
  status: "Active",
  price,
  listedDate: "2026-07-01",
  removedDate: null,
  lastSeenDate: "2026-08-03",
  daysOnMarket: 30,
  mlsName: "steadyapi",
  mlsNumber: id,
  photoUrl: `https://cdn.example.com/${id}.jpg`,
  listingUrl: `https://www.realtor.com/realestateandhomes-detail/${id}`,
});
mock.module("@/lib/listings/steadyapi", () => ({
  ...realSteadyapi,
  fetchPhotoListings: async () => [
    LISTING("a1", "1500 Cape Coral Pkwy", 429000),
    LISTING("a2", "1620 SE 8th St", 515000),
    LISTING("a3", "1733 NW 12th Ave", 388000),
    LISTING("a4", "1845 SW 4th Ln", 602000),
    LISTING("a5", "1901 NE 9th Ct", 349000),
    LISTING("a6", "2012 SW 22nd Ter", 468000),
  ],
  fetchNearbyValues: async () => [],
}));

// ⚠️ APIFY IS A PAID, PER-CALL SOURCE. `market-comps` reaches it through
// `fetchApifyComps` / `resolveCompEnrichment`. An unstubbed edge here does not just
// hang the suite — it SPENDS MONEY on every CI run. Stub it, and never let a test
// reach a metered vendor.
mock.module("@/lib/listings/apify-comps", () => ({
  ...realApifyComps,
  fetchApifyComps: async () => [],
}));
mock.module("@/lib/listings/apify-identity", () => ({
  ...realApifyIdentity,
  resolveCompEnrichment: async () => null,
}));
mock.module("@/lib/listings/comp-photos", () => ({
  ...realCompPhotos,
  resolveCompPhotos: async () => new Map(),
}));

// Charts: the PNG pipeline is a Supabase storage round-trip. Identity-shaped stub.
mock.module("@/lib/email/spec-to-png", () => ({
  ...realSpecToPng,
  chartSpecToEmailImage: async () => ({
    url: "https://cdn.example.com/chart.png",
    alt: "Chart",
    caption: "Chart — SWFL listing feed · as of 07/01/2026",
  }),
}));

// Everything below returns EMPTY on purpose: a recipe whose data lane misses must
// still land its grid with OPEN SLOTS (RULE 0.7 — never refuse a build). If a recipe
// only survives when its data is rich, this suite finds out.
mock.module("@/lib/fetch-brain", () => ({
  ...realFetchBrain,
  fetchBrain: async () => null,
  loadParsedBrain: async () => null,
}));
mock.module("@/lib/back-on-market/load-zip", () => ({
  ...realBackOnMarket,
  loadBackOnMarketZip: async () => null,
}));
mock.module("@/lib/assistant/gap-fill", () => ({
  ...realGapFill,
  fillExternalPoint: async () => null,
}));

// Supabase: a chainable no-rows stub. Every recipe that reads the lake directly
// (review-reply, community-info, coming-soon) lands on open slots instead.
function emptyQuery(): unknown {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of [
    "select",
    "eq",
    "in",
    "gte",
    "lte",
    "gt",
    "lt",
    "not",
    "or",
    "ilike",
    "like",
    "order",
    "limit",
    "range",
    "filter",
    "neq",
    "contains",
    "overlaps",
    "is",
  ]) {
    q[m] = self;
  }
  q.single = async () => ({ data: null, error: null });
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (resolve: (v: { data: never[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return q;
}
mock.module("@/utils/supabase/service-role", () => ({
  ...realServiceRole,
  createServiceRoleClientUntyped: () => ({ from: () => emptyQuery() }),
  createServiceRoleClient: () => ({ from: () => emptyQuery() }),
}));

// ── Product modules, imported AFTER the stubs are installed ──────────────────
const { RECIPE_KEYS, RECIPES } = await import("@/lib/deliverable/recipes");
const { builderFor } = await import("./index");
const { wentThroughSeam } = await import("@/lib/email/doc/finalize-doc");
const { seedById, SEED_DOCS } = await import("@/lib/email/doc/default-docs");

/** The canvas a build starts from — the blank skeleton every recipe arrival opens. */
function baseDoc(): EmailDoc {
  return (seedById("skeleton-clean-white") ?? SEED_DOCS[0]!).build();
}

/** The seed prompt with its one `[[blank]]` filled the way a door fills it. */
function promptFor(key: string): string {
  const raw = RECIPES[key as keyof typeof RECIPES].prompt;
  const spine = RECIPES[key as keyof typeof RECIPES].subject;
  const fill = spine === "address" ? (SHORE_DR_FACTS.address ?? "326 Shore Dr") : "Cape Coral";
  return raw.replace(/\[\[[^\]]*\]\]/g, fill);
}

function ctxFor(key: string): RecipeBuildContext {
  const recipe = RECIPES[key as keyof typeof RECIPES];
  const isAddress = recipe.subject === "address";
  return {
    recipe,
    prompt: promptFor(key),
    currentDoc: baseDoc(),
    facts: isAddress ? structuredClone(SHORE_DR_FACTS) : null,
    resolved: isAddress,
    zip: ZIP,
  };
}

/** Every email key we OFFER. Social is a different renderer with a different
 *  contract — excluded by its declared `target`, never by a hand-kept list. */
const EMAIL_KEYS = RECIPE_KEYS.filter((k) => RECIPES[k].target !== "social");

// ─────────────────────────────────────────────────────────────────────────────

describe("REGISTRY-WIDE — every email recipe key", () => {
  test("the email/social split is DECLARED on the recipe, not hand-kept here", () => {
    const social = RECIPE_KEYS.filter((k) => RECIPES[k].target === "social");
    expect(social.length + EMAIL_KEYS.length).toBe(RECIPE_KEYS.length);
    // A regression here means someone added an email key with target:"social" (or
    // vice versa) and this suite silently stopped covering a lane.
    expect(social).toEqual(["social-pack", "social-cut"]);
  });

  test("every exemption names a reason — an empty reason is an invisible allowlist", () => {
    const all = { ...UNBUILT_KEYS, ...HARNESS_EXEMPT, ...SEAM_BYPASS_KNOWN };
    for (const [key, reason] of Object.entries(all)) {
      expect(reason.trim().length, `${key} exemption has no reason`).toBeGreaterThan(20);
    }
  });

  for (const key of EMAIL_KEYS) {
    describe(key, () => {
      test("has a registered builder", () => {
        const builder = builderFor(key);
        if (UNBUILT_KEYS[key]) {
          expect(
            builder,
            `${key} is declared UNBUILT but HAS a builder — drop the exemption`,
          ).toBeNull();
          return;
        }
        expect(builder, `${key} has no builder and is not declared in UNBUILT_KEYS`).not.toBeNull();
      });

      test("builds through the SEAM, and every block carries a layout", async () => {
        if (UNBUILT_KEYS[key] || HARNESS_EXEMPT[key]) return;
        const builder = builderFor(key);
        if (!builder) return; // the previous test already failed on this

        const doc = await builder(ctxFor(key));

        // NO SOURCES BLOCK, FLEET-WIDE (operator decree 08/19/2026: "get rid of
        // whatever this shit is in all emails = Sources (1): …"). Applies to every
        // key, seam bypasses included — SourcesBlock also renders null on the email
        // paths, but a recipe must not even EMIT one.
        if (doc) {
          expect(
            doc.blocks.some((b) => b.type === "sources"),
            `${key} emitted a sources block — banned from all emails by the 08/19/2026 decree`,
          ).toBe(false);
        }

        // INVERTED — a declared bypass must STILL be broken. Fix the lane and this
        // fails, telling you to delete its SEAM_BYPASS_KNOWN line in the same commit.
        if (SEAM_BYPASS_KNOWN[key]) {
          const clean = doc !== null && wentThroughSeam(doc);
          expect(
            clean,
            `${key} now goes through the seam — delete its SEAM_BYPASS_KNOWN entry and ` +
              `close its check in this same commit.`,
          ).toBe(false);
          return;
        }

        // A null return is a legitimate product state (fall through to the generic
        // author) — but it is NOT proof of anything, so it may not pass silently.
        expect(
          doc,
          `${key} returned null on the fixture context. That falls through to the ` +
            `generic author and this guard proves nothing about its layout. Either fix ` +
            `the builder's open-slot path (RULE 0.7 — a data miss lands the grid with ` +
            `open slots, it never refuses) or declare it in HARNESS_EXEMPT with a reason.`,
        ).not.toBeNull();
        if (!doc) return;

        expect(wentThroughSeam(doc), `${key} did not go through finalizeDoc`).toBe(true);

        expect(doc.blocks.length, `${key} built an empty doc`).toBeGreaterThan(0);
        for (const block of doc.blocks) {
          const l = (block as { layout?: Record<string, unknown> }).layout;
          expect(l, `${key}: block ${block.type} has no layout`).toBeTruthy();
          for (const axis of ["x", "y", "w", "h"] as const) {
            expect(
              typeof l![axis],
              `${key}: block ${block.type} layout.${axis} is not a number`,
            ).toBe("number");
          }
          // The pit: a block that skipped the seam sinks here in row-grouping.ts.
          expect(
            l!.y as number,
            `${key}: block ${block.type} sank to the un-positioned pit`,
          ).toBeLessThan(1_000_000);
        }
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REPRODUCIBLE BY BUILDER — the acceptance test the operator named, 08/05/2026:
// "MAKE SURE WE ARE TRACKING WHERE AND HOW EVERYTHING GETS BUILT SO WE CAN
// REPRODUCE EXACTLY."
//
// WHAT "EXACTLY" SCOPES TO, DECLARED UP FRONT rather than discovered when this
// goes flaky. Two inputs are non-deterministic BY DESIGN and are normalised out
// below — anything else that differs between two runs is a real defect:
//
//   1. BLOCK IDS — minted per build. They are addresses within one document, not
//      content; two runs that differ only by id produced the same email.
//   2. THE NARRATIVE — an LLM writes it. Here the model call is stubbed, so the
//      prose IS stable and is NOT normalised; against the live model it is not,
//      and that is the declared boundary. Structure, cells and sourcing
//      reproduce; the sentence does not.
//
// The clock (`new Date()` in the days-on-market lane) is not normalised either:
// the fixture carries `daysOnMarket`, so the vendor list-date lane never fires.
//
// ⚠️ CORRECTED 08/06/2026 — this used to say "so NO BUILDER reads the clock on
// this path. If one starts to, this test goes red." **The second sentence was
// never true, and the first stopped being true.** `under-contract`'s `loadSpeed`
// calls `todayIso()` for the comparand's as-of date. This test would NOT have
// gone red: it runs each builder twice milliseconds apart, so both reads return
// the same date. A once-a-day UTC-midnight window is the only way it could flake.
//
// Exposure is nil HERE because that date reaches the doc only through the sources
// note, which needs a median, and there are no DB creds in this environment — a
// property of the test env, not a guarantee. `loadSpeed` therefore takes an
// injectable `deps.asOf`. **Do not read this comment as a working clock guard.**
//
// WHY THIS AND NOT A SCREENSHOT: a screenshot proves one build rendered. This
// proves the SAME INPUTS PRODUCE THE SAME DOCUMENT, which is the property that
// makes a recipe a recipe instead of a one-time result.

/** Strip the declared-volatile fields (block ids) so the comparison is content. */
function reproducibleShape(doc: EmailDoc): string {
  return JSON.stringify(
    {
      subjectVariants: doc.subjectVariants ?? null,
      globalStyle: doc.globalStyle,
      blocks: doc.blocks.map((b) => {
        const { id: _id, ...rest } = b as { id?: string } & Record<string, unknown>;
        return rest;
      }),
    },
    // Key order is an artifact of object construction, never of content.
    (_k, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
        : v,
  );
}

describe("REPRODUCIBLE BY BUILDER — same inputs, same document", () => {
  for (const key of EMAIL_KEYS) {
    test(`${key} builds the SAME doc twice from the same context`, async () => {
      if (UNBUILT_KEYS[key] || HARNESS_EXEMPT[key]) return;
      const builder = builderFor(key);
      if (!builder) return;

      // Two INDEPENDENT contexts, not the same object reused — a builder that
      // mutates its input would otherwise pass by contaminating run two.
      const first = await builder(ctxFor(key));
      const second = await builder(ctxFor(key));
      if (first === null && second === null) return; // stable miss is still stable
      expect(first, `${key}: run 1 built, run 2 did not (or vice versa)`).not.toBeNull();
      expect(second, `${key}: run 2 built, run 1 did not`).not.toBeNull();

      expect(
        reproducibleShape(second!),
        `${key} is NOT reproducible: two runs over identical inputs produced different ` +
          `documents. Block ids and the LLM sentence are already normalised out, so the ` +
          `difference is real — a clock read, a random pick, or state leaking between builds.`,
      ).toBe(reproducibleShape(first!));
    });
  }
});
