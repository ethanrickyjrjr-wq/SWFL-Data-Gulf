import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
const SRC = process.argv[2]!;
const KEY = "showcase-agents/marisa-delgado.png";
// THE WHOLE FIGURE, AS HANDED. Operator, 08/05/2026: "No fucking head and shoulders."
// The ONLY thing done to it is trimming the fully-transparent margin so the subject fills
// its own frame — no square crop, no face crop, aspect ratio preserved. Alpha kept: the
// cut-out sits ON the card surface rather than inside a white rectangle.
const trimmed = await sharp(readFileSync(SRC)).trim().toBuffer();
const t = await sharp(trimmed).metadata();
const buf = await sharp(trimmed)
  .resize({ width: 600, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toBuffer();
const out = await sharp(buf).metadata();
writeFileSync(process.argv[3]!, buf);
console.log(
  `trimmed ${t.width}x${t.height} -> ${out.width}x${out.height} PNG, ${Math.round(buf.length / 1024)}KB, alpha kept, NO crop`,
);
const db = createServiceRoleClientUntyped();
const { error } = await db.storage
  .from("email-media")
  .upload(KEY, buf, { contentType: "image/png", upsert: true });
if (error) {
  console.error("UPLOAD FAILED:", error.message);
  process.exit(1);
}
const { data } = db.storage.from("email-media").getPublicUrl(KEY);
await db
  .from("user_brand_profiles")
  .update({ photo_url: data.publicUrl })
  .eq("user_id", "37cc6c49-4759-4e07-9686-0a8dcce1f8ff");
console.log(`photo_url -> ${data.publicUrl}`);
