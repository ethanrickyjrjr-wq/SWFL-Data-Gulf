// scripts/lib/airtable-creds.mjs
// Pure Airtable-credential resolver, same shape as scripts/lib/supabase-creds.mjs.
// TOML (local .dlt/secrets.toml) wins; env vars are the CI fallback.
function tomlStr(toml, key) {
  for (const line of toml.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`));
    if (m) return m[1];
  }
  return null;
}

export function resolveAirtableCreds({ tomlText = "", env = {} }) {
  const token = tomlStr(tomlText, "AIRTABLE_TOKEN") ?? env.AIRTABLE_TOKEN;
  const baseId = tomlStr(tomlText, "AIRTABLE_CHECKS_BASE_ID") ?? env.AIRTABLE_CHECKS_BASE_ID;
  const tableId = tomlStr(tomlText, "AIRTABLE_CHECKS_TABLE_ID") ?? env.AIRTABLE_CHECKS_TABLE_ID;
  if (!token || !baseId || !tableId) return null;
  return { token, baseId, tableId };
}
