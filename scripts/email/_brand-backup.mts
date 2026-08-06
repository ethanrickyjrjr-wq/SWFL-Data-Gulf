import { writeFileSync } from "node:fs";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const UID = "37cc6c49-4759-4e07-9686-0a8dcce1f8ff"; // ethanrickyjrjr@gmail.com
const db = createServiceRoleClientUntyped();
const { data, error } = await db
  .from("user_brand_profiles")
  .select("*")
  .eq("user_id", UID)
  .maybeSingle();
if (error || !data) {
  console.error("BACKUP FAILED:", error?.message ?? "no row");
  process.exit(1);
}
const path = "_ASSISTANT/brand-backups/ethanrickyjrjr-brand-2026-08-05.json";
writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
console.log(`BACKED UP -> ${path}`);
console.log(
  `  agent_name=${data.agent_name} | company=${data.company_name} | updated_at=${data.updated_at}`,
);
