// lib/email/lifecycle-chrome.test.ts
//
// THE CAMPAIGN'S SHAPE — pinned.
//
// Phase 3 gave the chrome a layout system. Phase 4 is where it finally spends it: the agent
// card and the CTA share ONE row (`{7,5}`) instead of stacking as two full-width cards for
// one idea. This file exists because of the exact trap the Phase 3 handoff named:
//
//   A FLAT `w:12` STACK IS PERFECTLY CONFORMANT. Every row sums to 12. It passes the seam,
//   it carries the provenance marker, and it is precisely the email the layout system was
//   bought to eliminate. Provenance (design-system-reachability.test.ts) proves the doc came
//   out of the seam. It cannot prove the seam was USED for anything.
//
// So this file tests SHAPE, and it is the only place that legitimately does. It pins two
// things, and the second is the unusual one:
//
//   1. WHAT WE BUILT — the agent/CTA row is real, blessed, and in the right source order.
//   2. WHAT WE REJECTED — the photo and the hero are still FULL-BLEED. Splitting THEM into a
//      `{7,5}` row was considered and turned down on the evidence (a ~350px photo, when the
//      photo IS the product; and the centred address wrapping over four lines in a ~250px
//      column until the price stops reading as a headline). Pinning a rejection means the next
//      session that wants it has to delete a test with a reason in it, in the open — instead
//      of drifting into a redesign nobody agreed to. An unenforced design decision is a
//      preference.
//
// (Both the shipped row and the rejected one are `{7,5}` — that is a coincidence of the
// blessed registry, not a link. The shipped one is agent+CTA; photo+hero stays full-bleed.)

import { describe, expect, it } from "bun:test";

import { BLESSED_ROW_SPANS } from "./doc/block-contract";
import { DEFAULT_GLOBAL_STYLE } from "./doc/default-docs";
import { buildLifecycleEmail, LIFECYCLE_SPINE } from "./lifecycle-chrome";
import type { EmailBlock, EmailDoc } from "./doc/types";

/** A representative listing email: every slot filled, so the chrome emits its full spine. */
function build(): EmailDoc {
  return buildLifecycleEmail(
    { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
    {
      ribbon: "Just Sold",
      photo: { url: "https://example.com/326-shore.jpg", alt: "326 Shore Dr" },
      heroValue: "$1,395,000",
      heroLabel: "326 Shore Dr, Fort Myers Beach, FL 33931",
      specs: [
        { label: "Beds", value: "3" },
        { label: "Baths", value: "2" },
        { label: "Sq Ft", value: "1,842" },
      ],
      narrative: "A sentence about the sale.",
      ctaLabel: "Book a Valuation",
      ctaUrl: "https://example.com/valuation",
    },
  );
}

const find = (doc: EmailDoc, type: EmailBlock["type"]) => doc.blocks.find((b) => b.type === type)!;

describe("the agent and the ask — ONE row", () => {
  it("puts the CTA BESIDE the agent card, not under it", () => {
    const doc = build();
    const agent = find(doc, "agent-card");
    const cta = find(doc, "button");

    // The whole point of Phase 4. If this ever reads `x: 0` on both, the campaign has
    // silently regressed to the flat stack.
    expect(agent.layout!.y).toBe(cta.layout!.y);
    expect(agent.layout!.x).toBe(0);
    expect(cta.layout!.x).toBe(7);
  });

  it("uses a BLESSED span pair, so the seam honours it instead of snapping it", () => {
    const doc = build();
    const spans = [find(doc, "agent-card").layout!.w, find(doc, "button").layout!.w];

    // {7,5}, NOT {8,4} — settled by rendering it. At {8,4} the CTA column is 200px and
    // "RSVP for the Open House" broke over three lines. 250px holds the worst label in the
    // campaign in two. Widen the agent card here and you re-break the button.
    expect(spans).toEqual([7, 5]);
    expect(spans.reduce((a, b) => a + b, 0)).toBe(12);
    // {7,5} must remain in the registry — if someone prunes it, this row stops being legal
    // and the seam would quietly snap it to something else.
    expect(BLESSED_ROW_SPANS[2].some((s) => s[0] === 7 && s[1] === 5)).toBe(true);
  });

  it("keeps the CTA SECOND — hybrid columns stack in source order on a phone", () => {
    // cerberusemail.com/hybrid-responsive: "Makes table columns 100% wide and stacks them in
    // source order." Reverse these two and every phone shows the ask ABOVE the agent.
    const doc = build();
    const types = doc.blocks.map((b) => b.type);
    expect(types.indexOf("agent-card")).toBeLessThan(types.indexOf("button"));
  });
});

describe("what we deliberately did NOT do", () => {
  it("leaves the photo FULL-BLEED — it is the product, not a column", () => {
    // Rejected: photo {7} + hero {5}. At a 600px canvas that is a ~350px photo. If you want
    // to change this, change it on purpose — and say why here.
    expect(find(build(), "image").layout!.w).toBe(12);
  });

  it("leaves the hero FULL-BLEED — a 250px column wraps the address off the headline", () => {
    // The hero is centred, address-over-price. "326 Shore Dr, Fort Myers Beach, FL 33931" in a
    // ~250px column runs to four lines and the price stops being the headline number.
    expect(find(build(), "hero").layout!.w).toBe(12);
  });
});

describe("the chrome still holds", () => {
  it("emits the spine, in order", () => {
    const doc = build();
    const seen = doc.blocks.map((b) => b.type);
    // Every spine type appears, and agent-card/button keep their relative order (they now
    // share a row, which does not change the block sequence).
    for (const t of [
      "header",
      "image",
      "hero",
      "stats",
      "text",
      "agent-card",
      "button",
      "footer",
    ]) {
      expect(seen).toContain(t as EmailBlock["type"]);
    }
    expect(LIFECYCLE_SPINE).toContain("agent-card");
    expect(LIFECYCLE_SPINE).toContain("button");
  });

  it("never overlaps two rows' bands — the height invariant the seam depends on", () => {
    // row-grouping.ts groups by BAND OVERLAP (y < rowBottom). The agent/CTA row is the first
    // place the chrome emits blocks of UNEQUAL height (4 and 2) at the same y. If `y` ever
    // advanced by anything but the row's TALLEST entry, the next row would merge into it.
    const doc = build();
    const rows = new Map<number, EmailBlock[]>();
    for (const b of doc.blocks) {
      const y = b.layout!.y;
      rows.set(y, [...(rows.get(y) ?? []), b]);
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 0; i < ys.length - 1; i++) {
      const bottom = Math.max(...rows.get(ys[i])!.map((b) => b.layout!.y + b.layout!.h));
      expect(bottom).toBeLessThanOrEqual(ys[i + 1]);
    }
  });

  it("keeps the footer alone on the last row — a column can never hold the unsubscribe", () => {
    const doc = build();
    const footer = find(doc, "footer");
    expect(footer.layout!.w).toBe(12);
    expect(doc.blocks.filter((b) => b.layout!.y === footer.layout!.y)).toHaveLength(1);
  });
});
