/**
 * Storage cache-control — the ONE root. Every `storage.from(...).upload(...)`
 * in this repo passes one of these; a bare upload with no `cacheControl` is the
 * bug this module exists to prevent.
 *
 * WHY THIS EXISTS (07/21/2026 incident, do not delete the reasoning):
 * Supabase egress hit **778.592 / 250 GB = 311% of plan**, which put the whole
 * project under restriction — PostgREST 503'd on every request, auth timed out,
 * /desk rendered blank and /charts showed "Data unavailable" to real visitors.
 * The Supabase dashboard's 24h breakdown showed **Storage serving 30,393
 * requests** at a 99.3% success rate while Postgres was throttled to 1,307.
 * Storage does not sit behind PostgREST, so it kept serving — and kept billing —
 * straight through the outage.
 *
 * At that moment **six upload call sites existed and NOT ONE passed
 * `cacheControl`**, so every fetch of every email image, social card, hero photo
 * and thumbnail was served from origin and billed as egress. Nothing ever told
 * the CDN it was allowed to hold a copy.
 *
 * `cacheControl` is a documented supabase-js `FileOptions` field taking SECONDS
 * AS A STRING (verified against supabase.com/docs/reference/javascript/
 * storage-from-upload on 07/21/2026 — their own example is `cacheControl: '3600'`).
 * A number, or a full header string like "max-age=3600", is not the contract.
 *
 * PICKING ONE — the only question that matters is: can the bytes at this key
 * ever change?
 *  - Key encodes its own content (uuid, content hash, or a date+params stamp)
 *    → new content lands on a NEW key → IMMUTABLE, cache for a year.
 *  - Key is stable and gets overwritten in place → MUTABLE, cache for a day and
 *    accept up to a day of staleness, or give the key a stamp and promote it.
 */

/**
 * One year. For keys that encode their own content — a uuid, a content hash, or
 * a date+params stamp. Changed bytes land on a different key, so a stale hit is
 * not reachable and the TTL costs nothing.
 */
export const MEDIA_CACHE_IMMUTABLE = "31536000";

/**
 * One day. For keys overwritten in place (`upsert: true` on a stable key). Still
 * removes the overwhelming majority of origin fetches versus no header at all;
 * the tradeoff is that a replacement can take up to a day to propagate.
 */
export const MEDIA_CACHE_MUTABLE = "86400";
