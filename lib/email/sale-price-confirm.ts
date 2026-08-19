// lib/email/sale-price-confirm.ts — the send-time SALE-PRICE CONFIRM, pure half.
//
// Operator decree 08/19/2026, verbatim: "FUCKING POP UP A CONFIRM FOR THE GOD DAMN
// USER ON SALE PRICE, SEND IF THEY DON'T ANSWER. THEY ANSWER, THE MOTHERFUCKING
// PRICE PER SQUARE FOOTAGE FUCKING CHANGES AUTOMATICALLY SINCE IT'S SIMPLE FUCKING
// MATH." This module is the SIMPLE MATH half: given the agent's answered price, it
// updates the price hero and recomputes the "$/Sq Ft" cell from the sq ft already
// on the page. The popup itself lives in the lab shell; NOTHING here ever blocks a
// send — no answer means the prefilled build ships exactly as it stands (the same
// default the just-sold ledger's Unenforced note said belonged at SEND, now built).
//
// This closes the loop the 08/06 decree opened ("SOLD PRICE IS ENTERED AS LAST
// LISTED PRICE WE HAVE. USER CAN CHANGE IT IF THEY WANT"): the change point is the
// confirm, and the derived rate follows the price automatically.

import { pricePerSqft } from "@/lib/email/listing-flyer";
import { withCommas } from "@/lib/format-number";
import type { EmailDoc } from "./doc/types";

type AnyBlock = EmailDoc["blocks"][number];

/** The PRICE hero — the non-ribbon hero (the ribbon hero is the band with only a
 *  kicker; lifecycle-chrome mints both). Its value may be an OPEN SLOT ("") — the
 *  acceptance house live 08/19/2026 held neither a recorded close nor a last-list
 *  price, and that empty hero is exactly when asking the agent matters most. */
function priceHero(doc: EmailDoc): AnyBlock | undefined {
  return doc.blocks.find((b) => b.type === "hero" && !(b.props as { ribbon?: boolean }).ribbon);
}

/** The current sale price on the doc, or null when the hero is an open slot. */
export function salePriceFor(doc: EmailDoc): string | null {
  const hero = priceHero(doc);
  const value = (hero?.props as { value?: string } | undefined)?.value?.trim();
  return value || null;
}

/** Only a JUST SOLD build confirms — the decree is about the sale price under a
 *  SOLD headline; every other recipe's hero is an ask, already the agent's own.
 *  An OPEN hero still asks (their answer fills it); no hero at all has nothing
 *  to confirm. */
export function needsSalePriceConfirm(
  recipeKey: string | null | undefined,
  doc: EmailDoc,
): boolean {
  return recipeKey === "just-sold" && priceHero(doc) !== undefined;
}

/** "$1,234,567" from whatever the agent typed; null when no digits survive. */
export function normalizePriceInput(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${withCommas(digits) ?? digits}`;
}

/**
 * The agent answered: set the hero to their price and recompute "$/Sq Ft" from the
 * "Sq Ft" cell already on the page — two figures in, one rate out, zero fetches.
 * Unparseable input or a doc with no price hero returns the doc UNCHANGED (the
 * send proceeds either way — the confirm never blocks).
 */
export function applySalePrice(doc: EmailDoc, rawPrice: string): EmailDoc {
  const price = normalizePriceInput(rawPrice);
  const hero = priceHero(doc);
  if (!price || !hero) return doc;

  const blocks = doc.blocks.map((b): AnyBlock => {
    if (b === hero) return { ...b, props: { ...b.props, value: price } } as AnyBlock;
    if (b.type !== "stats") return b;
    const stats = (b.props as { stats?: { label?: string; value?: string | number }[] }).stats;
    if (!stats?.some((s) => s.label === "$/Sq Ft")) return b;
    const sqft = stats.find((s) => s.label === "Sq Ft")?.value;
    const ppsf = pricePerSqft(price, typeof sqft === "number" ? String(sqft) : sqft);
    if (!ppsf) return b;
    return {
      ...b,
      props: {
        ...b.props,
        stats: stats.map((s) => (s.label === "$/Sq Ft" ? { ...s, value: ppsf } : s)),
      },
    } as AnyBlock;
  });

  return { ...doc, blocks };
}
