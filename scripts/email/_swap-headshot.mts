import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const SRC = process.argv[2]!;
const KEY = "showcase-agents/marisa-delgado-v2-512.jpg";
const buf = await sharp(readFileSync(SRC))
  .extract({ left: 20, top: 0, width: 985, height: 985 })
  .resize(512, 512, { fit: "cover" })
  .jpeg({ quality: 90 })
  .toBuffer();
writeFileSync(process.argv[3]!, buf);
const db = createServiceRoleClientUntyped();
const { error } = await db.storage
  .from("email-media")
  .upload(KEY, buf, { contentType: "image/jpeg", upsert: true });
if (error) {
  console.error("UPLOAD FAILED:", error.message);
  process.exit(1);
}
const { data } = db.storage.from("email-media").getPublicUrl(KEY);
await db
  .from("user_brand_profiles")
  .update({ photo_url: data.publicUrl })
  .eq("user_id", "37cc6c49-4759-4e07-9686-0a8dcce1f8ff");
console.log(`headshot -> ${data.publicUrl}`);
