import type { SupabaseClient } from "@supabase/supabase-js";
import { ResoClient } from "./client";
import type { BoardSlug } from "./boards";

interface ResoProperty {
  ListingKey: string;
  ListPrice?: number;
  ClosePrice?: number;
  ListingContractDate?: string;
  CloseDate?: string;
  DaysOnMarket?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  PostalCode?: string;
  StandardStatus?: string;
  PropertyType?: string;
}

const MEMBER_MLS_ID_RE = /^[A-Za-z0-9\-\.]{1,64}$/;

export async function pullAgentListings(
  supabase: SupabaseClient,
  slug: BoardSlug,
  memberMlsId: string,
  userId: string,
): Promise<{ count: number; zips: string[] }> {
  if (!MEMBER_MLS_ID_RE.test(memberMlsId)) {
    throw new Error(`Invalid MemberMlsId: ${memberMlsId}`);
  }
  const client = new ResoClient(slug);

  // Note: some boards don't support OData `in()` for enum fields.
  // Using OR chain is always safe per RESO DD 2.0.
  const properties = await client.get<ResoProperty>("Property", {
    $filter: `ListAgentMlsId eq '${memberMlsId}' and (StandardStatus eq 'Active' or StandardStatus eq 'Closed' or StandardStatus eq 'Pending' or StandardStatus eq 'ActiveUnderContract')`,
    $select:
      "ListingKey,ListPrice,ClosePrice,ListingContractDate,CloseDate,DaysOnMarket,BedroomsTotal,BathroomsTotalInteger,LivingArea,PostalCode,StandardStatus,PropertyType",
  });

  if (properties.length === 0) return { count: 0, zips: [] };

  const rows = properties.map((p) => ({
    listing_key: p.ListingKey,
    user_id: userId,
    board_slug: slug,
    list_price: p.ListPrice ?? null,
    close_price: p.ClosePrice ?? null,
    listing_contract_date: p.ListingContractDate ?? null,
    close_date: p.CloseDate ?? null,
    days_on_market: p.DaysOnMarket ?? null,
    bedrooms_total: p.BedroomsTotal ?? null,
    bathrooms_total: p.BathroomsTotalInteger ?? null,
    living_area: p.LivingArea ?? null,
    postal_code: p.PostalCode ?? null,
    standard_status: p.StandardStatus ?? null,
    property_type: p.PropertyType ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .schema("data_lake")
    .from("user_mls_listings")
    .upsert(rows, { onConflict: "listing_key,board_slug" });
  if (error) throw new Error(`upsert listings: ${error.message}`);

  const zips = [...new Set(rows.map((r) => r.postal_code).filter((z): z is string => z !== null))];
  return { count: rows.length, zips };
}
