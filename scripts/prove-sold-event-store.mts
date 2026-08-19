/**
 * prove-sold-event-store.mts — PROVE commit eeaf3756's claim on a REAL run:
 * "the build path keeps the tax-history body it fetches, and answers from it
 * when the vendor goes quiet."
 *
 * The probe is the fix's own contract: with no vendor key, fetchSoldEvent takes
 * the stored lane (steadyapi.ts:601-602 `if (!key) return stored()`). We delete
 * PHOTOS_API in-process (Bun auto-loads .env.local — memory: bun-env-precedence,
 * a shell unset is not enough), then read REAL bodies the ingest lane landed in
 * data_lake.steadyapi_property_history_raw and demand a Sold event with
 * provenance "stored" + its as-of capture date. Zero vendor quota spent; the DB
 * read is live production data — this is the running comp lane, not a mock.
 *
 * On success, appends one proof record to verification/answer-proofs.jsonl.
 *
 * Run:  bun run scripts/prove-sold-event-store.mts
 */
import { appendFileSync } from "node:fs";
import { createServiceRoleClientUntyped } from "../utils/supabase/service-role";
import { fetchSoldEvent } from "../lib/listings/steadyapi";

// Force the vendor-quiet lane BEFORE any call — this is the exact condition the
// commit claims to survive.
delete process.env.PHOTOS_API;

const db = createServiceRoleClientUntyped();
const { data, error } = await db
  .schema("data_lake")
  .from("steadyapi_property_history_raw")
  .select("property_id,fetched_at")
  .order("fetched_at", { ascending: false })
  .limit(40);
if (error || !Array.isArray(data) || data.length === 0) {
  console.error("Could not list stored history rows:", error?.message);
  process.exit(1);
}

let proven: { propertyId: string; ev: Awaited<ReturnType<typeof fetchSoldEvent>> } | null = null;
for (const row of data) {
  const ev = await fetchSoldEvent(String(row.property_id));
  if (ev && ev.provenance === "stored" && ev.soldPrice > 0 && ev.soldDate) {
    proven = { propertyId: String(row.property_id), ev };
    break;
  }
}
if (!proven || !proven.ev) {
  console.error(
    `NOT PROVEN: none of the ${data.length} newest stored bodies produced a stored-lane ` +
      `sold event. The fallback is not answering — that is a finding, not a pass.`,
  );
  process.exit(1);
}

const { ev } = proven;
const answer =
  `Recorded sale for the requested comp: sold for ${ev.soldPrice.toLocaleString("en-US")} dollars ` +
  `on ${ev.soldDate}. Served from our stored tax-history copy (provenance: ${ev.provenance}) ` +
  `because the vendor returned no body; latest-sale claim is current as of ${ev.asOf}.`;

const record = {
  question:
    "With the vendor quiet (no API key), does the chat comp lane still answer a sold-price " +
    "question from the tax-history body we already own?",
  answer,
  endpoint: "lib/listings/steadyapi.ts fetchSoldEvent (chat comp lane, stored fallback)",
  observed_at: new Date().toISOString(),
  commit_claim:
    "eeaf3756 feat(listings): the build path keeps the tax-history body it fetches, and " +
    "answers from it when the vendor goes quiet — stored lane observed live against " +
    "data_lake.steadyapi_property_history_raw",
};
appendFileSync("verification/answer-proofs.jsonl", JSON.stringify(record) + "\n");
console.log("PROVEN — proof record appended to verification/answer-proofs.jsonl");
console.log(answer);
