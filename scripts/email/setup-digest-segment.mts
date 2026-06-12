/**
 * One-time setup: create (or find) the Resend Segment that holds the daily-digest
 * subscriber list, then print its id. Copy the id into the env as
 * RESEND_DIGEST_SEGMENT_ID (Vercel + .env.local).
 *
 * Idempotent: re-running finds the existing segment by name, never duplicates it.
 * Requires a full_access key (RESEND_AUDIENCES_KEY or the bare `full_access`).
 *
 *   bun scripts/email/setup-digest-segment.mts
 */
import { Resend } from "resend";

const SEGMENT_NAME = "SWFL Data Gulf Daily Digest";

const key = process.env.RESEND_AUDIENCES_KEY ?? process.env.full_access;
if (!key) {
  console.error(
    "Missing full_access key — set RESEND_AUDIENCES_KEY (or `full_access`) in .env.local",
  );
  process.exit(1);
}

const resend = new Resend(key);

const existing = await resend.segments.list();
if (existing.error) {
  console.error("segments.list failed:", existing.error);
  process.exit(1);
}

const found = existing.data?.data.find((s) => s.name === SEGMENT_NAME);
if (found) {
  console.log(`Segment already exists.\nRESEND_DIGEST_SEGMENT_ID=${found.id}`);
  process.exit(0);
}

const created = await resend.segments.create({ name: SEGMENT_NAME });
if (created.error || !created.data) {
  console.error("segments.create failed:", created.error);
  process.exit(1);
}

console.log(`Segment created.\nRESEND_DIGEST_SEGMENT_ID=${created.data.id}`);
