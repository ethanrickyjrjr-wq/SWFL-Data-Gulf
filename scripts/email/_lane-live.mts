import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const db = createServiceRoleClientUntyped();
// LIVE: the funnel counts behind the email, re-run right now against the lake.
const base = () =>
  db
    .schema("data_lake")
    .from("listing_state")
    .select("listing_id", { count: "exact", head: true })
    .eq("county", "Lee")
    .eq("state", "active")
    .eq("sale_or_rent", "sale")
    .eq("source_name", "api_feed")
    .not("beds", "is", null)
    .not("sqft", "is", null)
    .not("list_price", "is", null);
const [all, band, like] = await Promise.all([
  base(),
  base().gte("list_price", 198000).lte("list_price", 242000),
  base().gte("list_price", 198000).lte("list_price", 242000).gte("beds", 2).gte("sqft", 1150),
]);
console.log(`LIVE Lee active homes (land excluded): ${all.count}`);
console.log(`LIVE in band $198K-$242K            : ${band.count}`);
console.log(`LIVE + 2 beds & 1,150+ sqft         : ${like.count}`);
