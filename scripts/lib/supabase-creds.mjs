// scripts/lib/supabase-creds.mjs
// Pure Supabase-credential resolver shared by scripts/check.mjs (and any CI
// caller). TOML (local .dlt/secrets.toml) wins; env vars are the CI fallback.
function tomlStr(toml, key) {
  for (const line of toml.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`));
    if (m) return m[1];
  }
  return null;
}

export function resolveSupabaseCreds({ tomlText = "", env = {} }) {
  const url =
    tomlStr(tomlText, "SUPABASE_URL") ??
    tomlStr(tomlText, "BRAINS_SUPABASE_URL") ??
    env.SUPABASE_URL ??
    env.BRAINS_SUPABASE_URL;
  const key =
    tomlStr(tomlText, "SUPABASE_SERVICE_KEY") ??
    tomlStr(tomlText, "BRAINS_SUPABASE_SERVICE_KEY") ??
    env.SUPABASE_SERVICE_KEY ??
    env.BRAINS_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}
