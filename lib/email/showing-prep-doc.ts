// lib/email/showing-prep-doc.ts
//
// Turn ShowingPrepData into the coded-grid Showing Prep Packet EmailDoc — an
// AGENT-FACING prep document (comps + subject + market snapshot), NOT a buyer-facing
// flyer. Its own dedicated build path (Deviation #1): a coded grid like
// listing-flyer.ts, gated later by lintAuthoredProse (Task 6), never the SnapshotItem
// deliverable pipeline. PURE: returns a NEW doc, mutates nothing, invents nothing —
// every section degrades to an empty cell or is omitted, never a broken graphic and
// never a fabricated number. Brand/identity (header, agent card, footer, globalStyle)
// is sticky, lifted from the doc on the canvas.

import { createBlock } from "./doc/default-docs";
import { heroPhotoBlock } from "./inject-photo";
import { listingsMapUrl, type MapPin } from "@/lib/listings/listings-map";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";
import type { MarketSnapshot } from "@/lib/listings/market-snapshot";
import type { BlockLayout, EmailBlock, EmailDoc, StatItem, TextProps } from "./doc/types";

/** Caption sentinel on the empty commentary text block — the assembler (Task 6)
 *  finds the block to fill by this marker, so no positional coupling. */
export const SHOWING_PREP_COMMENTARY_MARKER = "__showing_prep_commentary__";

const DISCLOSURE_LABEL = "Attach seller disclosure (optional)";

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

function withCommas(n?: string): string | undefined {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

function usd(n: number | null): string {
  return n == null ? "" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function isoToMDY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/** "sold $475,000 · 06/01/2026" / "list $520,000" / "est. $480,000" — labeled by
 *  kind so an AVM/last-list is never called a sale (comp-helper's honesty rule). */
function compPricePhrase(c: RenderComp): string {
  if (c.price == null) return "price n/a";
  const money = usd(c.price);
  if (c.priceKind === "sold") {
    const d = c.priceDate ? isoToMDY(c.priceDate) : null;
    return `sold ${money}${d ? ` · ${d}` : ""}`;
  }
  if (c.priceKind === "estimate") return `est. ${money}`;
  return `list ${money}`;
}

/** A short (<24 char) status tag for a comp row's `lead` — the ListItem `lead` cap
 *  is 24 chars, and a full street address does not belong there (it goes in `text`). */
function compLeadTag(c: RenderComp): string {
  if (c.priceKind === "sold") return "Sold";
  if (c.priceKind === "estimate") return "Est.";
  return "Active";
}

function compSpec(c: RenderComp): string {
  return [
    c.beds != null ? `${c.beds} bd` : "",
    c.baths != null ? `${c.baths} ba` : "",
    c.sqft != null ? `${c.sqft.toLocaleString("en-US")} sqft` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function snapshotCells(s: MarketSnapshot): StatItem[] {
  const cells: StatItem[] = [];
  if (s.marketType) cells.push({ value: s.marketType, label: "Market" });
  cells.push({ value: String(s.monthsOfSupply), label: "Months supply" });
  if (s.homesSold != null) cells.push({ value: String(s.homesSold), label: "Sold (90d)" });
  if (s.activeInventory != null) cells.push({ value: String(s.activeInventory), label: "Active" });
  return cells.slice(0, 3); // stats block caps at 3 cells
}

export function buildShowingPrepDoc(data: ShowingPrepData, current: EmailDoc): EmailDoc {
  const { subject } = data;
  const blocks: EmailBlock[] = [];
  let y = 0;
  const at = <T extends EmailBlock>(b: T, h: number, opts?: Partial<BlockLayout>): T => ({
    ...b,
    layout: { x: 0, y, w: 12, h, ...opts },
  });
  const push = (b: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(b, h, opts));
    y += h;
  };

  const addressLine =
    subject?.address ??
    ([subject?.city, subject?.state].filter(Boolean).join(", ") || data.address || undefined);

  // 1. Header — sticky brand.
  push(keepOrDefault(current, "header"), 2);

  // 2. Subject hero photo — real photo, else empty drag-drop image slot.
  push(
    subject?.photos[0]
      ? heroPhotoBlock({
          url: subject.photos[0],
          alt: subject.address ?? "Subject property",
          linkUrl: subject.sourceUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: { url: "", kind: "photo", alt: subject?.address ?? "Subject property" },
        },
    6,
  );

  // 3. Subject hero — kicker + price + address (address-only when no subject; no invented price).
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: { kicker: "Showing Prep", value: subject?.price ?? "", label: addressLine ?? "" },
    },
    3,
  );

  // 4. Subject spec strip — empty cells, never a 0, never invented.
  const specCells: StatItem[] = [
    { value: subject?.beds ?? "", label: "Beds" },
    { value: subject?.baths ?? "", label: "Baths" },
    { value: withCommas(subject?.sqft) ?? "", label: "Sq Ft" },
  ];
  push({ id: createBlock("stats").id, type: "stats", props: { stats: specCells } }, 2);

  // 5. Comp/subject MAP — omitted entirely when no pin resolves (never a broken graphic).
  const pins: MapPin[] = [...(data.subjectPin ? [data.subjectPin] : []), ...data.compPins];
  const mapUrl = listingsMapUrl(pins);
  if (mapUrl) {
    push(
      {
        id: createBlock("image").id,
        type: "image",
        props: {
          url: mapUrl,
          kind: "chart",
          alt: "Subject and nearby comps",
          caption: "Subject (★) and nearby comps",
        },
      },
      5,
    );
  }

  // 6. Per-comp ONE-SHEETS — the photo-enriched top comps (a `listing` card each).
  for (const { comp, photoUrl } of data.oneSheets) {
    push(
      {
        id: createBlock("listing").id,
        type: "listing",
        props: {
          photoUrl,
          price: usd(comp.price),
          beds: comp.beds != null ? String(comp.beds) : undefined,
          baths: comp.baths != null ? String(comp.baths) : undefined,
          sqft: comp.sqft != null ? String(comp.sqft) : undefined,
          address: [comp.addressLine, comp.city].filter(Boolean).join(", "),
          badge: comp.priceKind === "sold" ? "Sold comp" : "Comp",
        },
      },
      6,
    );
  }

  // 7. Comparison GRID — every comp NOT already a one-sheet (source scrubbed by comp-helper).
  const oneSheetKeys = new Set(data.oneSheets.map((o) => o.comp.addressLine));
  const gridComps = data.comps.filter((c) => !oneSheetKeys.has(c.addressLine));
  if (gridComps.length) {
    push(
      {
        id: createBlock("list").id,
        type: "list",
        props: {
          title: "Nearby comps",
          // `lead` is a short status tag (cap 24); the address + spec + price go in
          // `text` (cap 200) — a full street address overflows the `lead` cap and would
          // make the persisted doc fail EmailDocSchema on load.
          items: gridComps.slice(0, 8).map((c) => ({
            lead: compLeadTag(c),
            text: [
              [c.addressLine, c.city].filter(Boolean).join(", "),
              compSpec(c),
              compPricePhrase(c),
            ]
              .filter(Boolean)
              .join(" — "),
          })),
        },
      },
      5,
    );
  }

  // 8. Market snapshot — stat strip + a source line; omitted when null (never stale).
  if (data.snapshot) {
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: { stats: snapshotCells(data.snapshot) },
      },
      2,
    );
    push(
      {
        id: createBlock("text").id,
        type: "text",
        props: {
          body: `Local market snapshot for ${data.snapshot.zip}, as of ${data.snapshot.asOf}. Source: SWFL Data Gulf.`,
          align: "left",
        },
      },
      2,
    );
  }

  // 9. Commentary — empty; the assembler (Task 6) authors + lints one paragraph in here.
  // The marker rides on `caption` (an open prop — TextProps doesn't declare it, so the
  // props are typed as the intersection to stay compile-clean; the field is present at
  // runtime, which is what the assembler's marker finder reads).
  const commentaryProps: TextProps & { caption: string } = {
    body: "",
    align: "left",
    caption: SHOWING_PREP_COMMENTARY_MARKER,
  };
  push({ id: createBlock("text").id, type: "text", props: commentaryProps }, 4);

  // 10. Disclosure slot — empty image block (the drag-drop mechanic; Deviation #4).
  push(
    {
      id: createBlock("image").id,
      type: "image",
      props: { url: "", kind: "photo", alt: DISCLOSURE_LABEL, caption: DISCLOSURE_LABEL },
    },
    3,
  );

  // 11. Agent card — sticky.
  push(keepOrDefault(current, "agent-card"), 4);

  // 12. Footer — sticky, CAN-SPAM, static.
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle: { ...current.globalStyle }, blocks };
}
