// lib/listings-user/upsert.ts
// THE canonical write path into public.user_listings — mirrors
// lib/contacts/upsert.ts (batching, in-batch dedupe before a single
// .upsert() call so Postgres never sees the same (user_id, address_key)
// twice in one statement). County join happens here so every door (route,
// REST, skill) gets it without remembering to call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { UserListingRow } from "./parse-listings-csv";
import { joinCounty } from "./join-county";

const BATCH_SIZE = 100;

function dedupeSameKey(rows: UserListingRow[]): UserListingRow[] {
  const order: string[] = [];
  const byKey = new Map<string, UserListingRow>();
  for (const r of rows) {
    const prev = byKey.get(r.address_key);
    if (!prev) {
      order.push(r.address_key);
      byKey.set(r.address_key, { ...r, attribs: { ...r.attribs } });
      continue;
    }
    byKey.set(r.address_key, {
      address: r.address || prev.address,
      address_key: r.address_key,
      price: r.price ?? prev.price,
      beds: r.beds ?? prev.beds,
      baths: r.baths ?? prev.baths,
      sqft: r.sqft ?? prev.sqft,
      status: r.status ?? prev.status,
      url: r.url ?? prev.url,
      attribs: { ...prev.attribs, ...r.attribs },
    });
  }
  return order.map((k) => byKey.get(k)!);
}

export async function upsertUserListings(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: UserListingRow[],
): Promise<{ added: number; matchedToCounty: number; error: string | null }> {
  let added = 0;
  let matchedToCounty = 0;
  const deduped = dedupeSameKey(rows);

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE).map((r) => {
      const joined = joinCounty(r);
      if (joined.county) matchedToCounty++;
      return {
        user_id: userId,
        address: r.address,
        address_key: r.address_key,
        price: r.price,
        beds: r.beds,
        baths: r.baths,
        sqft: r.sqft,
        status: r.status,
        url: r.url,
        attribs: r.attribs,
        zip_code: joined.zip_code,
        county: joined.county,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase
      .from("user_listings")
      .upsert(batch, { onConflict: "user_id,address_key" });
    if (error) return { added, matchedToCounty, error: error.message };
    added += batch.length;
  }
  return { added, matchedToCounty, error: null };
}
