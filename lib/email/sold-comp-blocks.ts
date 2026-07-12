// lib/email/sold-comp-blocks.ts
//
// Pure builders that turn nearby SOLD comps (RenderComp — the comp-helper's
// MLS-scrubbed shape) into email blocks: a bar ChartSpec (subject's asking price
// vs recorded sales) and a linked `list` block ("Recent sales nearby"), one row
// per comp with a "View →" click-through to its CAPTURED realtor.com page
// (operator unlock 07/11/2026). Honest price kinds: an estimate or last-list is
// labeled, never dressed as a sale. No I/O, no invention: a comp without a price
// is dropped; a comp without a captured sourceUrl renders without a link. Sold
// comps justify the asking price without advertising purchasable competitors.

import { mintBlockId } from "./doc/schema";
import type { BlockOf, EmailDoc, ListItem } from "./doc/types";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

export const SOLD_COMPS_LIST_TITLE = "Recent sales nearby";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "2026-05-20" → "05/20/2026"; undefined for anything else. */
function isoToMDY(iso: string | null): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

/** Row lead: "$450,000 · 05/20/2026" (sold) · "$450,000 est." · "$450,000 list". */
function leadFor(c: RenderComp): string {
  const price = usd(c.price as number);
  if (c.priceKind === "sold") {
    const d = isoToMDY(c.priceDate);
    return d ? `${price} · ${d}` : `${price} sold`;
  }
  return c.priceKind === "estimate" ? `${price} est.` : `${price} list`;
}

/** The linked comp rows. Null when no comp carries a price (never an empty shell). */
export function soldCompsListBlock(comps: RenderComp[]): BlockOf<"list"> | null {
  const items: ListItem[] = comps
    .filter((c) => c.price != null)
    .slice(0, 8)
    .map((c) => ({
      lead: leadFor(c),
      text: [c.addressLine, c.city].filter(Boolean).join(", ").slice(0, 200),
      ...(c.sourceUrl ? { linkUrl: c.sourceUrl } : {}),
    }));
  if (items.length === 0) return null;
  return {
    id: mintBlockId(),
    type: "list",
    props: { title: SOLD_COMPS_LIST_TITLE, items },
  };
}

/** Bar spec: subject asking price first, priced comps sorted desc. Null unless
 *  the subject has a price AND >=2 comps are priced (a 2-bar chart is not
 *  informative — same floor the old actives chart used). */
export function buildSoldCompsSpec(
  comps: RenderComp[],
  subject: { street: string; listPrice: number | null },
  asOfIso: string,
): ChartSpec | null {
  const priced = comps.filter((c) => c.price != null);
  if (!subject.listPrice || priced.length < 2) return null;
  const kindSuffix = (c: RenderComp) =>
    c.priceKind === "sold" ? "" : c.priceKind === "estimate" ? " (est.)" : " (list)";
  const rows: (string | number | null)[][] = [
    [`${subject.street} (Subject — asking)`, subject.listPrice],
    ...[...priced]
      .sort((a, b) => (b.price as number) - (a.price as number))
      .map((c) => [`${c.addressLine}${kindSuffix(c)}`, c.price]),
  ];
  return {
    frameId: "bar-table",
    title: `Recent sales near ${subject.street}`,
    columns: ["Property", "Price"],
    rows,
    value_format: "usd",
    chart_type: "bar",
    asOf: asOfIso,
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
  } as ChartSpec;
}

/** Upsert keyed on the reserved title: replace the existing sold-comps list in
 *  place (scheduled rebuilds must never stack), else insert before the first
 *  agent-card/button/footer so the rows sit after the narrative content. */
export function upsertSoldCompsBlock(doc: EmailDoc, block: BlockOf<"list">): EmailDoc {
  const idx = doc.blocks.findIndex(
    (b) => b.type === "list" && b.props.title === SOLD_COMPS_LIST_TITLE,
  );
  if (idx !== -1) {
    const blocks = doc.blocks.map((b, i) =>
      i === idx ? ({ id: b.id, type: "list", props: block.props } as BlockOf<"list">) : b,
    );
    return { ...doc, blocks };
  }
  const anchor = doc.blocks.findIndex(
    (b) => b.type === "agent-card" || b.type === "button" || b.type === "footer",
  );
  const blocks = [...doc.blocks];
  blocks.splice(anchor === -1 ? blocks.length : anchor, 0, block);
  return { ...doc, blocks };
}
