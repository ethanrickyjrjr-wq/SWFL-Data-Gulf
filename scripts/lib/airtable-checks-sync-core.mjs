// scripts/lib/airtable-checks-sync-core.mjs
// Pure, network-free helpers for scripts/airtable-checks-sync.mjs. No fetch,
// no Supabase/Airtable creds — easy to unit test in isolation.

// Airtable's per-request record cap on create/update/delete. Sourced from the
// airtable-mcp CLI skill's documented gotcha (Airtable's own docs render this
// figure via client-side JS that a static crawl doesn't surface) — 10 is the
// conservative choice either way.
export const BATCH_SIZE = 10;

/** Split an array into chunks of at most `size`. */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 1:1 by name with the spec's field table — picks the mirrored columns and
// drops null/undefined so an upsert never clears an Airtable cell with an
// explicit null (Airtable's typecast is best-effort on strings, not on null).
const MIRRORED_FIELDS = [
  "check_key",
  "project",
  "label",
  "detail",
  "priority",
  "due_at",
  "created_at",
  "updated_at",
];

export function toAirtableFields(row) {
  const fields = {};
  for (const key of MIRRORED_FIELDS) {
    const v = row[key];
    if (v !== null && v !== undefined) fields[key] = v;
  }
  return fields;
}

/** Request body for one upsert batch (≤BATCH_SIZE rows) against update-multiple-records. */
export function buildUpsertBody(rows) {
  return {
    performUpsert: { fieldsToMergeOn: ["check_key"] },
    typecast: true,
    records: rows.map((row) => ({ fields: toAirtableFields(row) })),
  };
}

/** Full URL (with query string) for a delete-multiple-records batch (≤BATCH_SIZE ids). */
export function buildDeleteUrl({ baseId, tableId }, recordIds) {
  const params = recordIds.map((id) => `records[]=${encodeURIComponent(id)}`).join("&");
  return `https://api.airtable.com/v0/${baseId}/${tableId}?${params}`;
}
