// lib/buyer-leverage/dom-read.ts
import type { DomRead } from "./types";
// KNOWN-DEBT(data_lake): listing_dom lives in the data_lake schema, outside the typed
// Supabase client — same untyped service-role read as lib/back-on-market/relist-fact.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface RawDomRow {
  dom_days: number | null;
  dom_is_floor: boolean | null;
  cdom_days: number | null;
  state: string | null;
}

export interface DomDeps {
  fetchRow?: (addressKey: string) => Promise<RawDomRow | null>;
}

/** Default read: the home's listing_dom row (our own api_feed inventory). Any error → null. */
async function defaultFetchRow(key: string): Promise<RawDomRow | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_dom")
      .select("dom_days, dom_is_floor, cdom_days, state")
      .eq("address_key", key)
      .eq("sale_or_rent", "sale")
      .limit(1)
      .maybeSingle();
    return (data as RawDomRow) ?? null;
  } catch {
    return null;
  }
}

/** Resolve a home's DOM + state, or null on any miss. Never throws. */
export async function fetchDomRead(
  addressKey: string,
  deps: DomDeps = {},
): Promise<DomRead | null> {
  const fetchRow = deps.fetchRow ?? defaultFetchRow;
  let row: RawDomRow | null;
  try {
    row = await fetchRow(addressKey);
  } catch {
    return null;
  }
  if (!row) return null;
  return {
    domDays: row.dom_days,
    isFloor: row.dom_is_floor === true,
    cdomDays: row.cdom_days,
    state: row.state,
  };
}
