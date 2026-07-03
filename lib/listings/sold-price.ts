// lib/listings/sold-price.ts
//
// THE one root for turning a sold/close price into display copy (spec:
// invention-surface-guards §A). Resolution chain, in lane order:
//   1. Lake: a NONZERO recorded sold price we already hold.
//   2. Live recorded event: fetchSoldEvent (property tax history — a recorded
//      deed event). PAID call: injectable, fired only for a real build.
//   3. Sold, price pending: we HOLD a confirmed sold date but no positive price
//      (county deed record lags the close by days; luxury sales via land trust
//      may never post one). Says the sale is confirmed; shows the list price,
//      disclosed as a list price.
//   4. Last list price, DISCLOSED — labeled as a list price, never a sale.
// A 0/null/negative price is MISSING by definition — it never binds. If no lane
// resolves, returns null and the caller omits the slot entirely.

import { fetchSoldEvent, type SoldEvent } from "./steadyapi";

export interface SoldPriceInput {
  /** Lake value (e.g. listing_transitions.sold_price). 0 = not yet recorded. */
  soldPrice?: number | null;
  /** ISO date of the lake sold event, when held. */
  soldDate?: string | null;
  /** Internal join key for the live recorded-event lookup. NEVER surfaced. */
  propertyId?: string | null;
  lastListPrice?: number | null;
  lastListDate?: string | null;
}

export interface SoldPriceDisplay {
  kind: "sold" | "sold_price_pending" | "last_list";
  /** Always > 0. For "sold_price_pending" this is the LAST LIST price, never a sale. */
  value: number;
  /** MM/DD/YYYY when a date is held. For "sold_price_pending": the confirmed sold date. */
  asOf?: string;
  /** "SWFL Data Gulf" | "Public record" — never a vendor name. */
  source: string;
  /** Present unless kind === "sold" — code-owned wording, model never writes it. */
  disclosure?: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function toMdY(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/** A price is a price only when finite and positive. */
function pos(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export async function resolveSoldPrice(
  input: SoldPriceInput,
  deps: { fetchSold?: (propertyId: string) => Promise<SoldEvent | null> } = {},
): Promise<SoldPriceDisplay | null> {
  if (pos(input.soldPrice)) {
    return {
      kind: "sold",
      value: input.soldPrice,
      asOf: toMdY(input.soldDate),
      source: "SWFL Data Gulf",
    };
  }

  if (input.propertyId) {
    const fetchSold = deps.fetchSold ?? fetchSoldEvent;
    const ev = await fetchSold(input.propertyId).catch(() => null);
    if (ev && pos(ev.soldPrice)) {
      return {
        kind: "sold",
        value: ev.soldPrice,
        asOf: toMdY(ev.soldDate),
        source: "Public record",
      };
    }
  }

  // Sold with the price not yet recorded: the confirmed sold date is real held data —
  // say so, instead of downgrading to a bare list-price line that hides the sale.
  const soldAsOf = toMdY(input.soldDate);
  if (soldAsOf && pos(input.lastListPrice)) {
    return {
      kind: "sold_price_pending",
      value: input.lastListPrice,
      asOf: soldAsOf,
      source: "SWFL Data Gulf",
      disclosure:
        `Sold — confirmed ${soldAsOf}. Closing price not yet in the county record; ` +
        `last listed at ${usd(input.lastListPrice)}.`,
    };
  }

  if (pos(input.lastListPrice)) {
    return {
      kind: "last_list",
      value: input.lastListPrice,
      asOf: toMdY(input.lastListDate),
      source: "SWFL Data Gulf",
      disclosure: `Last listed at ${usd(input.lastListPrice)}; closing price not yet recorded.`,
    };
  }

  return null;
}
