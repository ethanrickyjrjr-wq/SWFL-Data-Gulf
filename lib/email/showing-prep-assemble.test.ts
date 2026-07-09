import { test, expect } from "bun:test";
import { assembleShowingPrepDoc } from "./showing-prep-assemble";
import { SHOWING_PREP_COMMENTARY_BLOCK_ID } from "./showing-prep-doc";
import { SEED_DOCS } from "./doc/default-docs";
import { EmailDocSchema } from "./doc/schema";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";
import type { RenderComp } from "@/lib/assistant/comp-helper";

function currentDoc() {
  return SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
}

function commentaryBody(doc: {
  blocks: Array<{ id: string; type: string; props: Record<string, unknown> }>;
}) {
  const c = doc.blocks.find((b) => b.type === "text" && b.id === SHOWING_PREP_COMMENTARY_BLOCK_ID);
  return (c?.props?.body as string | undefined) ?? "";
}

const DATA: ShowingPrepData = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  subject: {
    address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
    city: "Fort Myers",
    state: "FL",
    zip: "33908",
    price: "$489,000",
    beds: "3",
    baths: "2",
    sqft: "1840",
    photos: [],
    sourceUrl: "https://www.swfldatagulf.com",
  },
  subjectPin: null,
  zip: "33908",
  comps: [],
  oneSheets: [],
  compPins: [],
  snapshot: {
    zip: "33908",
    monthsOfSupply: 2.1,
    activeInventory: 140,
    homesSold: 66,
    medianSalePrice: 489000,
    medianDom: 41,
    marketType: "Seller's market",
    asOf: "07/01/2026",
    lowSample: false,
  },
  asOf: "07/08/2026",
};

test("commentary block never contains an unanchored number (lint gate)", async () => {
  // Force the author to fabricate — the injected model returns a bogus number.
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => "This home is worth $999,999 with 12 offers pending.",
  });
  const body = commentaryBody(doc);
  expect(body).not.toContain("$999,999"); // stripped — never invented
  expect(body).not.toContain("12 offers");
});

test("commentary block keeps a paragraph whose numbers all anchor to the packet", async () => {
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => "Listed at $489,000 in a market running 2.1 months of supply.",
  });
  const body = commentaryBody(doc);
  expect(body).toContain("$489,000");
  expect(body).toContain("2.1");
});

test("no-key / offline build skips the AI paragraph and still returns a valid doc", async () => {
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => null,
  });
  expect(commentaryBody(doc)).toBe("");
  expect(doc.blocks.some((b) => b.type === "footer")).toBe(true);
});

// Regression: the marker used to ride on `caption`, a field TextPropsSchema doesn't
// declare — Zod's default strip-unknown-keys behavior silently dropped it on every
// schema round-trip (proven empirically before this fix), breaking any later attempt
// to relocate the commentary block in a reloaded doc. `id` is never stripped.
test("the commentary block survives an EmailDocSchema round-trip (reload/re-parse)", async () => {
  const doc = await assembleShowingPrepDoc(DATA, currentDoc(), {
    authorCommentary: async () => "Listed at $489,000 in a market running 2.1 months of supply.",
  });
  const parsed = EmailDocSchema.safeParse(doc);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const reloaded = parsed.data.blocks.find(
    (b) => b.type === "text" && b.id === SHOWING_PREP_COMMENTARY_BLOCK_ID,
  );
  expect(reloaded).toBeDefined();
  expect(reloaded?.type === "text" && reloaded.props.body).toContain("$489,000");
});

// Regression (pins the commentary-only lint): with comps AND a snapshot present, an
// authored paragraph that mixes one anchored sentence with one fabrication must strip
// ONLY the fabrication — while the DETERMINISTIC comp-grid rows and the snapshot source
// line (both carrying real dates a whole-doc lint would tokenize + strip) survive intact.
test("lints commentary only — deterministic dated comp rows + source line survive", async () => {
  const COMPS: RenderComp[] = [
    {
      addressLine: "101 A St",
      city: "Fort Myers",
      beds: 3,
      baths: 2,
      sqft: 1800,
      status: "sold",
      price: 475000,
      priceKind: "sold",
      priceDate: "2026-06-01",
    },
    {
      addressLine: "202 B St",
      city: "Fort Myers",
      beds: 4,
      baths: 3,
      sqft: 2200,
      status: "for_sale",
      price: 520000,
      priceKind: "last_list",
      priceDate: null,
    },
  ];
  const data: ShowingPrepData = { ...DATA, comps: COMPS, oneSheets: [], compPins: [] };
  const doc = await assembleShowingPrepDoc(data, currentDoc(), {
    authorCommentary: async () =>
      "Listed at $489,000 in a market running 2.1 months of supply. This home is worth $999,999 with 12 offers pending.",
  });

  // Deterministic comp grid — the dated sold row survived (not stripped by a whole-doc lint).
  const list = doc.blocks.find((b) => b.type === "list");
  const listJson = list?.type === "list" ? JSON.stringify(list.props.items) : "";
  expect(listJson).toContain("475,000");
  expect(listJson).toContain("06/01/2026");
  expect(listJson).toContain("202 B St");

  // Deterministic snapshot source line — its ZIP + as-of date survived.
  const source = doc.blocks.find(
    (b) =>
      b.type === "text" &&
      String((b.props as { body?: string }).body ?? "").includes("Local market snapshot"),
  );
  const sourceBody = source?.type === "text" ? String(source.props.body ?? "") : "";
  expect(sourceBody).toContain("33908");
  expect(sourceBody).toContain("07/01/2026");

  // Commentary — fabrication dropped, anchored sentence kept.
  const body = commentaryBody(doc);
  expect(body).toContain("$489,000");
  expect(body).toContain("2.1");
  expect(body).not.toContain("$999,999");
  expect(body).not.toContain("12 offers");
});
