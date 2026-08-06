import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
// THE PLAYBOOK IS THE AUTHORITY, NOT THE STALE ACCOUNT ROW.
// §2.1.6 defect 1: the serif editorial pair was DELETED. §2.1.6 defect 2: the type
// conformance guard now DENIES a bare Playfair/Georgia/Times/serif on fontFamily or
// displayFontFamily. The handoff, §6: MONTSERRAT_SANS + LATO_SANS both carry live-verified
// webfontUrls (network-checked 08/05/2026) and Montserrat's fallback stack was corrected
// off two legacy desktop fonts. That is the pair. Restoring `PLAYFAIR_SERIF` off the
// backup put back the exact font defect the finish pass had just removed.
const db = createServiceRoleClientUntyped();
const { error } = await db
  .from("user_brand_profiles")
  .update({ font_display: "MONTSERRAT_SANS", font_body: "LATO_SANS" })
  .eq("user_id", "37cc6c49-4759-4e07-9686-0a8dcce1f8ff");
if (error) {
  console.error(error.message);
  process.exit(1);
}
const { data } = await db
  .from("user_brand_profiles")
  .select("font_display,font_body,primary_color,accent_color,logo_url")
  .eq("user_id", "37cc6c49-4759-4e07-9686-0a8dcce1f8ff")
  .maybeSingle();
console.log(JSON.stringify(data, null, 2));
