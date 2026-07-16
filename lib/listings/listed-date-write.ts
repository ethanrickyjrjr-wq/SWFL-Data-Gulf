// lib/listings/listed-date-write.ts — the ONE write path from the web app into
// data_lake.listing_state, deliberately a single column: probe-on-use healing of
// censored DOM floors (spec 2026-07-16-listing-dom-design.md §3). Guarded
// null-or-older so a re-probe after a relist can advance the spell but a stale
// concurrent probe can never regress a newer date.
//
// KNOWN-DEBT: untyped client — database.types.ts does not carry the data_lake
// schema (same debt as every data_lake reader in this allowlist, e.g. select.ts);
// the write stays single-column and test-guarded until data_lake types exist.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface ListingStateKey {
  sourceName: string;
  addressKey: string;
  saleOrRent: string;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function persistListedDate(
  key: ListingStateKey,
  isoDate: string,
  deps: { sb?: ReturnType<typeof createServiceRoleClientUntyped> } = {},
): Promise<boolean> {
  if (!ISO_DATE_ONLY.test(isoDate)) return false;
  try {
    const sb = deps.sb ?? createServiceRoleClientUntyped();
    const { error } = await sb
      .schema("data_lake")
      .from("listing_state")
      .update({ listed_date: isoDate })
      .eq("source_name", key.sourceName)
      .eq("address_key", key.addressKey)
      .eq("sale_or_rent", key.saleOrRent)
      .or(`listed_date.is.null,listed_date.lt.${isoDate}`);
    return !error;
  } catch {
    return false;
  }
}
