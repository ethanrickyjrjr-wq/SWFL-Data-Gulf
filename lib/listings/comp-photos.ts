// lib/listings/comp-photos.ts
//
// REAL listing photos for comparable homes — the only kind of property visual this
// product ships. Operator decree 08/03/2026, verbatim: "WE CAN'T HAVE FUCKING ARIEL
// VIEWS....AGAIN!!!! PHOTOS OF THE FUCKING LISTING. THAT'S IT AND LINK TO REALTOR.COM
// LISTING OR SOLD LISTING OF THE PROPERTY." There is NO substitute image: no satellite
// aerial, no street-view, no map tile, no placeholder. A comp we cannot photograph
// ships without a picture and keeps its realtor.com link.
//
// SOURCE (lane 1, ours): data_lake.listing_state.photo_url — the nightly listing-lifecycle
// sweep's photo, captured while the home was on the market and RETAINED after it sells.
// Measured live 08/03/2026: 34,673 of 35,202 sale rows carry a photo (98.5%), and 743 of
// 745 rows in state='sold' do (99.7%) — a sold comp inside the sweep window has a real
// photo of the house. Rows outside the sweep window simply do not resolve.
//
// MATCHING: the lake's api_feed rows and the comp feed (/nearby-home-values) are the SAME
// vendor's addresses, so an exact `street_address` match is the common case; the
// canonical `addressKey` core (shared TS/Python normalizer — never a second one) absorbs
// punctuation/suffix drift. City must agree, so "330 5th St, Naples" can never borrow
// "330 5th St, Fort Myers"'s photo.

// KNOWN-DEBT(data_lake: listing_state lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { addressKey } from "./address-key";

/** Street identity WITHOUT the ZIP — comps arrive with no ZIP, so the key is the
 *  normalized street core plus the city, both of which every lane carries. */
export function compPhotoKey(street: string, city: string): string {
  const core = addressKey(street, "").split(":")[0];
  const c = (city || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${core}@${c}`;
}

export interface LakePhotoRow {
  street_address: string | null;
  city: string | null;
  photo_url: string | null;
}

export interface CompPhotoDeps {
  /** Injectable for offline tests; default reads data_lake.listing_state. */
  fetchRows?: (addresses: string[]) => Promise<LakePhotoRow[]>;
}

/** Bounded lake read: the exact comp addresses only (never a city-wide scan — an
 *  unbounded scan is the egress pattern killed 07/21). Empty-tolerant: no creds, no
 *  rows, any error → `[]`, never throws. */
async function fetchLakePhotoRows(addresses: string[]): Promise<LakePhotoRow[]> {
  if (!addresses.length) return [];
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("street_address, city, photo_url")
      .in("street_address", addresses)
      .eq("sale_or_rent", "sale")
      .not("photo_url", "is", null)
      .limit(200);
    return Array.isArray(data) ? (data as unknown as LakePhotoRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Map each comp's `addressLine` to a REAL photo of that home, when we hold one.
 * Absent from the map = no photo exists for that comp; the caller renders no image.
 * Never returns a generated/derived/substitute image of any kind.
 */
export async function resolveCompPhotos(
  comps: { addressLine: string; city: string }[],
  deps: CompPhotoDeps = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = comps.filter((c) => c.addressLine);
  if (!wanted.length) return out;

  const fetchRows = deps.fetchRows ?? fetchLakePhotoRows;
  const rows = await fetchRows([...new Set(wanted.map((c) => c.addressLine))]);

  const byKey = new Map<string, string>();
  for (const r of rows) {
    if (!r.street_address || !r.photo_url) continue;
    const k = compPhotoKey(r.street_address, r.city ?? "");
    if (!byKey.has(k)) byKey.set(k, r.photo_url);
  }
  for (const c of wanted) {
    const hit = byKey.get(compPhotoKey(c.addressLine, c.city));
    if (hit) out.set(c.addressLine, hit);
  }
  return out;
}
