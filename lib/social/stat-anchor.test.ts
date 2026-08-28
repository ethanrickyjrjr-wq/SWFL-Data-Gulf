// lib/social/stat-anchor.test.ts
//
// THE FAILURE MODE THIS FILE EXISTS FOR — stated as `lib/deliverable/claims.ts:53-54`
// stated it, verbatim:
//
//   "Liftable on purpose: the SOCIAL path has NO no-invention gate of any kind today
//    (`stat.value` is a free-text field the model writes), and it is the same hole."
//
// A stat tile is the one surface that CANNOT carry its own citation — it is two or three
// words rendered at 12% of the canvas width. So a number in it that no supplied source
// holds is unattributable by construction, and it ships into an image an agent signs.
//
// Every test below is named for the failure mode it stops, not for the function it calls.
import { test, expect, describe } from "bun:test";
import {
  sourceClaims,
  statValueIsAnchored,
  unanchoredNumerals,
  gateDesignStats,
  gateCanvasFillPatch,
} from "./stat-anchor";
import { seedSocialCard, assembleDraft } from "@/lib/email/social-calendar/build-week";
import { DAY_THEMES } from "@/lib/email/social-calendar/themes";
import type { SocialDesign } from "@/lib/social/design/types";

// A realistic slice of what `refreshStaleLakeContext` + `renderListingsBlock` hand the
// model — the "REAL LAKE DATA (cite verbatim)" block, one figure per line.
const LAKE = `REAL LAKE DATA (cite verbatim — value · source · as-of):
- Median list price — Cape Coral: $412,000 · SWFL Data Gulf · 08/2026
- Active for-sale listings — Cape Coral: 1,284, median 47 days on market · SWFL Data Gulf · 08/2026
- For sale — 3BR/2BA Single Family, 1420 SE 8th St, Cape Coral, 33904: $595,000, 23 days on market · SWFL Data Gulf · 08/20/2026`;

const SETTLED = sourceClaims(LAKE);

// ── the core predicate ───────────────────────────────────────────────────────

describe("a social stat carrying a number NOT in the supplied source facts is REJECTED", () => {
  test("FM-SOCSTAT-1: an invented figure the lake never held is unanchored", () => {
    expect(statValueIsAnchored("$438,500", SETTLED)).toBe(false);
    expect(unanchoredNumerals("$438,500", SETTLED)).toEqual(["438500"]);
  });

  test("FM-SOCSTAT-2: a DIGIT-SWAPPED restatement of a real figure is unanchored", () => {
    // The corruption-on-restate shape claims.ts documents: every number was in front of
    // the model, and it typed a different one.
    expect(statValueIsAnchored("$412,900", SETTLED)).toBe(false);
    expect(statValueIsAnchored("47 days", SETTLED)).toBe(true); // the true one still passes
  });

  test("FM-SOCSTAT-3: the figure quoted verbatim from the lake SURVIVES", () => {
    for (const good of ["$412,000", "1,284", "47 days", "$595,000", "23 days", "3BR/2BA"]) {
      expect(statValueIsAnchored(good, SETTLED)).toBe(true);
    }
  });

  test("FM-SOCSTAT-4: separator drift is the SAME anchor — the gate must not eat a true value", () => {
    // numeralsIn's own documented bug class: "412,000" and "412000" are one anchor.
    expect(statValueIsAnchored("412000", SETTLED)).toBe(true);
  });

  test("FM-SOCSTAT-5: a value with no numerals at all is never blocked", () => {
    expect(statValueIsAnchored("Gulf access", SETTLED)).toBe(true);
    expect(statValueIsAnchored("[Need: current median rent]", SETTLED)).toBe(true); // lane 4
  });

  test("FM-SOCSTAT-6: an EMPTY source set anchors nothing — the gate fails CLOSED", () => {
    expect(statValueIsAnchored("$412,000", [])).toBe(false);
    expect(statValueIsAnchored("no data yet", [])).toBe(true);
  });
});

// ── site 1 — the canvas AUTHOR (lib/social/design/author.ts) ─────────────────

const designWith = (value: string): SocialDesign => ({
  version: 1,
  format: "portrait",
  background: "#0f1d24",
  elements: [
    {
      id: "headline",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: "Cape Coral this week",
      fontSize: 48,
      fontFamily: "sans-serif",
      fill: "#fff",
    },
    {
      id: "stat",
      type: "stat",
      x: 0,
      y: 50,
      width: 100,
      height: 40,
      value,
      label: "Median list price",
      valueFontSize: 96,
      labelFontSize: 32,
      fill: "#fff",
      accent: "#3dc9c0",
    },
  ],
});

describe("site 1 — the canvas AUTHOR blanks an unanchored stat to an OPEN SLOT", () => {
  test("FM-SOCSTAT-AUTHOR-1: the invented figure never reaches the canvas", () => {
    const { design, dropped } = gateDesignStats(designWith("$438,500"), ["stat"], SETTLED);
    const stat = design.elements.find((e) => e.id === "stat") as { value: string };
    expect(stat.value).toBe(""); // open slot — NOT the template's "$0" placeholder
    expect(dropped.map((d) => d.id)).toEqual(["stat"]);
  });

  test("FM-SOCSTAT-AUTHOR-2: a sourced figure is untouched and the build proceeds", () => {
    const { design, dropped } = gateDesignStats(designWith("$412,000"), ["stat"], SETTLED);
    const stat = design.elements.find((e) => e.id === "stat") as { value: string };
    expect(stat.value).toBe("$412,000");
    expect(dropped).toEqual([]);
  });

  test("FM-SOCSTAT-AUTHOR-3: an element the model never patched is left alone", () => {
    // The "$0" template default is CODE-authored, a separate defect — this gate only
    // governs what the MODEL wrote, so an untouched element is not its business.
    const { design, dropped } = gateDesignStats(designWith("$0"), [], SETTLED);
    const stat = design.elements.find((e) => e.id === "stat") as { value: string };
    expect(stat.value).toBe("$0");
    expect(dropped).toEqual([]);
  });

  test("FM-SOCSTAT-AUTHOR-4: TEXT elements are not touched — a caption-class surface can cite", () => {
    const { design } = gateDesignStats(designWith("$438,500"), ["stat", "headline"], SETTLED);
    const head = design.elements.find((e) => e.id === "headline") as { text: string };
    expect(head.text).toBe("Cape Coral this week");
  });
});

// ── site 2 — the canvas FILL (lib/email/social-calendar/build-canvas-fill.ts) ─

describe("site 2 — the canvas FILL strips an unanchored stat value from the patch", () => {
  const skeleton = {
    stat: { type: "stat", value: "$0", label: "metric label" },
    headline: { type: "text", text: "Your headline here" },
  };

  test("FM-SOCSTAT-FILL-1: the invented value is removed BEFORE the patch crosses the wire", () => {
    const { patch, dropped } = gateCanvasFillPatch(
      { stat: { value: "$438,500", label: "Median list price" }, headline: { text: "Hi" } },
      skeleton,
      SETTLED,
    );
    expect(patch.stat.value).toBeUndefined(); // the user's own value stands
    expect(patch.stat.label).toBe("Median list price"); // the label is not the defect
    expect(patch.headline.text).toBe("Hi");
    expect(dropped.map((d) => d.id)).toEqual(["stat"]);
  });

  test("FM-SOCSTAT-FILL-2: a sourced value passes through byte-identical", () => {
    const { patch, dropped } = gateCanvasFillPatch(
      { stat: { value: "$412,000", label: "Median list price" } },
      skeleton,
      SETTLED,
    );
    expect(patch.stat.value).toBe("$412,000");
    expect(dropped).toEqual([]);
  });
});

// ── site 3 — Generate Week (lib/email/social-calendar/build-week.ts) ──────────

describe("site 3 — Generate Week drops an unanchored card figure to an OPEN SLOT", () => {
  const monday = DAY_THEMES[0]; // hero + stats

  test("FM-SOCSTAT-WEEK-1: an invented hero value is blanked, the draft still ships", () => {
    const card = seedSocialCard(monday);
    const heroId = card.blocks[0].id;
    const draft = assembleDraft(
      monday,
      card,
      {
        caption: "Cape Coral this week.",
        hashtags: ["SWFLDataGulf"],
        patch: { [heroId]: { value: "$438,500", label: "Median Sale Price" } },
      },
      undefined,
      SETTLED,
    );
    expect(draft).not.toBeNull(); // NEVER blocks the build — same semantics as the email path
    const props = draft!.card.blocks[0].props as { value?: string; label?: string };
    expect(props.value).toBe("");
    expect(props.label).toBe("Median Sale Price");
  });

  test("FM-SOCSTAT-WEEK-2: a sourced hero value is kept verbatim", () => {
    const card = seedSocialCard(monday);
    const heroId = card.blocks[0].id;
    const draft = assembleDraft(
      monday,
      card,
      {
        caption: "Cape Coral this week.",
        hashtags: [],
        patch: { [heroId]: { value: "$412,000", label: "Median Sale Price" } },
      },
      undefined,
      SETTLED,
    );
    expect((draft!.card.blocks[0].props as { value?: string }).value).toBe("$412,000");
  });

  test("FM-SOCSTAT-WEEK-3: an unanchored cell inside stats[] is blanked, siblings survive", () => {
    const card = seedSocialCard(monday);
    const statsId = card.blocks[1].id;
    const draft = assembleDraft(
      monday,
      card,
      {
        caption: "Cape Coral this week.",
        hashtags: [],
        patch: {
          [statsId]: {
            stats: [
              { value: "1,284", label: "Active listings" },
              { value: "61 days", label: "Days on market" },
            ],
          },
        },
      },
      undefined,
      SETTLED,
    );
    const cells = (draft!.card.blocks[1].props as { stats: { value: string; label: string }[] })
      .stats;
    expect(cells[0].value).toBe("1,284");
    expect(cells[1].value).toBe(""); // 61 is in no source
    expect(cells[1].label).toBe("Days on market");
  });

  test("FM-SOCSTAT-WEEK-3b: an EMPTY source set anchors NOTHING — opted in is not opted out", () => {
    // The caller-side twin of FM-SOCSTAT-6. `buildSocialPost` can hand over an empty set
    // when the lake read degrades, and a `?.length` guard would silently read that as
    // \"this caller has no sources\" and turn the gate OFF — the caller disagreeing with a
    // predicate that fails closed. Passing `[]` means opted in with nothing to anchor to.
    const card = seedSocialCard(monday);
    const heroId = card.blocks[0].id;
    const draft = assembleDraft(
      monday,
      card,
      {
        caption: "Cape Coral this week.",
        hashtags: [],
        patch: { [heroId]: { value: "$412,000", label: "Median Sale Price" } },
      },
      undefined,
      [],
    );
    expect(draft).not.toBeNull();
    expect((draft!.card.blocks[0].props as { value?: string }).value).toBe("");
  });

  test("FM-SOCSTAT-WEEK-4: NO sources passed = the pre-gate behavior, byte-identical", () => {
    // The gate is opt-in at the caller. Callers that hold no source text must not have
    // their build silently emptied.
    const card = seedSocialCard(monday);
    const heroId = card.blocks[0].id;
    const draft = assembleDraft(monday, card, {
      caption: "Cape Coral this week.",
      hashtags: [],
      patch: { [heroId]: { value: "$438,500", label: "Median Sale Price" } },
    });
    expect((draft!.card.blocks[0].props as { value?: string }).value).toBe("$438,500");
  });
});
