// lib/email/address-context.ts — the address spine's email-side adapter (spec:
// 2026-07-05-address-spine-design.md). Converts the chat comp engine's result
// into cited MarketFigures for the builder's ONE data feed (fetchLakeParts), so
// authorDoc/buildContentDoc/social-calendar/scheduled occurrences all inherit
// nearby sold comps when a build carries an address. Hard lines: honest price
// kinds (a recorded sale is "sold", an AVM is an "estimate", a last list is a
// "last list" — never conflated); vendor + property ids never surfaced; empty-
// tolerant (any failure → [], the build proceeds); the SUBJECT property never
// gets a value estimate — comps are the neighbors' records only.
import { compsForAddress, type CompDeps, type RenderComp } from "@/lib/assistant/comp-helper";
import type { MarketFigure } from "@/lib/email/market-context";

const COMP_SOURCE = "SWFL Data Gulf · realtor.com";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Price-kind wording — an estimate or last-list must never read as a sale. */
function kindWording(c: RenderComp): string {
  if (c.priceKind === "sold") return "sold for";
  if (c.priceKind === "estimate") return "current value estimate";
  return "last list price";
}

function specBits(c: RenderComp): string {
  const bits: string[] = [];
  if (c.beds != null) bits.push(`${c.beds}bd`);
  if (c.baths != null) bits.push(`${c.baths}ba`);
  if (c.sqft != null) bits.push(`${c.sqft.toLocaleString("en-US")} sqft`);
  return bits.length ? ` (${bits.join("/")})` : "";
}

/** "2026-05-20" → "05/20/2026"; undefined when the input isn't an ISO date. */
function isoToMDY(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

export interface AddressCompContext {
  figures: MarketFigure[];
  comps: RenderComp[];
}

/**
 * Nearby sold comps for a subject address — ONE compsForAddress call feeding both
 * consumers: cited figures for the AI's data feed AND the raw comps for the linked
 * rows block (sold-comp-blocks). Empty-tolerant: missing address, geocode miss,
 * out-of-footprint, no comps, or any vendor failure → empty context (the build
 * proceeds exactly as without an address). Inherits the ≤3-vendor-call cap —
 * NEVER call compsForAddress separately in the same build.
 */
export async function loadAddressCompContext(
  address: string | null | undefined,
  deps: CompDeps = {},
): Promise<AddressCompContext> {
  const subject = String(address ?? "").trim();
  if (!subject) return { figures: [], comps: [] };
  try {
    const result = await compsForAddress(subject, deps);
    const figures = result.comps.flatMap((c, i) => {
      if (c.price == null) return [];
      return [
        {
          key: `comp_${i + 1}`,
          label: `Nearby comp — ${c.addressLine}, ${c.city}${specBits(c)} — ${kindWording(c)}`,
          value: usd(c.price),
          source: COMP_SOURCE,
          as_of: isoToMDY(c.priceDate) ?? result.asOf,
        },
      ];
    });
    return { figures, comps: result.comps };
  } catch {
    return { figures: [], comps: [] };
  }
}

/** Back-compat wrapper — figure-only callers keep their shape. */
export async function loadAddressFigures(
  address: string | null | undefined,
  deps: CompDeps = {},
): Promise<MarketFigure[]> {
  return (await loadAddressCompContext(address, deps)).figures;
}
