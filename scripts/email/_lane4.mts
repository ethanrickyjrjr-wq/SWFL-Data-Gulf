import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const db = createServiceRoleClientUntyped();
const q = (t: string) => db.schema("data_lake").from(t).select("*", { count: "exact", head: true });
const [ls, ap, cp] = await Promise.all([
  q("listing_state").eq("state", "active").eq("sale_or_rent", "sale"),
  q("apify_property_records"),
  q("community_profiles"),
]);
console.log(`listing_state active-for-sale : ${ls.count}`);
console.log(`apify_property_records        : ${ap.count}`);
console.log(`community_profiles            : ${cp.count}`);
const { data } = await db
  .from("user_brand_profiles")
  .select("font_display,font_body,primary_color,accent_color,logo_url,photo_url,agent_name")
  .eq("user_id", "37cc6c49-4759-4e07-9686-0a8dcce1f8ff")
  .maybeSingle();
console.log("brand row LIVE:", JSON.stringify(data));
