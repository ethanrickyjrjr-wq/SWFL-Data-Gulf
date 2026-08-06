import { readFileSync } from "node:fs";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const UID = "37cc6c49-4759-4e07-9686-0a8dcce1f8ff";
const saved = JSON.parse(
  readFileSync("_ASSISTANT/brand-backups/ethanrickyjrjr-brand-2026-08-05.json", "utf8"),
);

// ── OURS. Restored verbatim from the account backup — never re-typed, never re-invented.
// "BUILD BRAND NEW WITH OUR FUCKING BRAND" means SWFL Data Gulf's brand. The teal, the
// dark, the logo mark and the saved font pair were already on this account and I replaced
// them with a made-up terracotta palette for a fictional brokerage. They come back exactly
// as they were.
const OURS = [
  "primary_color",
  "accent_color",
  "text_color",
  "background_color",
  "surface_color",
  "surface_dark_color",
  "logo_url",
  "company_name",
  "font_display",
  "font_body",
  "website_url",
  "unsubscribe_url",
  "business_address",
  "color_palettes",
  "button_destinations",
] as const;

// ── THEIRS. The fictional agent is an IDENTITY wearing our brand, not a second brand.
const IDENTITY = {
  agent_name: "Marisa Delgado",
  nickname: "Marisa",
  agent_title: "Broker Associate · Fort Myers & Estero",
  brokerage: "SWFL Data Gulf",
  contact_email: "marisa@swfldatagulf.com",
  contact_phone: "(239) 555-0168",
  instagram_url: "https://instagram.com/swfldatagulf",
  facebook_url: "https://facebook.com/swfldatagulf",
  linkedin_url: "https://linkedin.com/in/marisadelgado",
};

const patch: Record<string, unknown> = { ...IDENTITY };
for (const k of OURS) patch[k] = saved[k];

const db = createServiceRoleClientUntyped();
const { error } = await db.from("user_brand_profiles").update(patch).eq("user_id", UID);
if (error) {
  console.error("RESTORE FAILED:", error.message);
  process.exit(1);
}
const { data } = await db.from("user_brand_profiles").select("*").eq("user_id", UID).maybeSingle();
const r = (data ?? {}) as Record<string, unknown>;
console.log("OUR BRAND, RESTORED:");
for (const k of [
  "primary_color",
  "accent_color",
  "text_color",
  "surface_color",
  "logo_url",
  "company_name",
  "font_display",
  "font_body",
  "website_url",
  "business_address",
]) {
  console.log(`  ${k.padEnd(18)} ${r[k]}`);
}
console.log("\nAGENT IDENTITY (fictional):");
for (const k of ["agent_name", "agent_title", "brokerage", "contact_phone", "photo_url"]) {
  console.log(`  ${k.padEnd(18)} ${String(r[k]).slice(0, 70)}`);
}
