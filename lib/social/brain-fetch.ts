// lib/social/brain-fetch.ts
//
// The ONE live brain-fetch seam for social content. Builds the injectable
// `BuildSocialContentDeps` that `buildSocialContent` (compose core) consumes:
// it fetches the master dossier for a scope from the live API
// (`${siteUrl}/api/b/master?format=json&view=speak&tier=2[&scope_kind&scope_value]`),
// with a 15s timeout + a per-instance, per-scope cache (failures are negative-cached
// so a dead scope is not re-hit within the run).
//
// Extracted VERBATIM from the cron worker's inline `buildContentDeps`
// (scripts/social/run-schedules.mts) — U2 Gap 1. The cron and the U2 PROPOSE
// route now share this exact fetch, so the preview cannot diverge from the post.
//
// Defaults reproduce the cron's prior behavior exactly:
//   - siteUrl  ← NEXT_PUBLIC_SITE_URL (trailing slash stripped) ?? http://localhost:3000
//   - fetchImpl ← the global fetch
// `siteUrl` / `fetchImpl` are an injection superset for unit tests; production
// callers pass no args and behave identically to before the extraction.

import type { BrainDossier, BuildSocialContentDeps } from "./build-content";

export interface BuildContentDepsOptions {
  /** Override the API origin. Defaults to NEXT_PUBLIC_SITE_URL, then localhost. */
  siteUrl?: string;
  /** Override the fetch implementation (tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Resolve the API origin the way the cron always has: env, slash-stripped, localhost fallback. */
function resolveSiteUrl(override?: string): string {
  const raw = override ?? process.env.NEXT_PUBLIC_SITE_URL;
  return raw?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/**
 * Build the injectable BuildSocialContentDeps for a run. Fetches the brain dossier
 * for a scope from the live API (or from a per-instance cache when the same scope
 * is requested multiple times).
 */
export function buildContentDeps(opts: BuildContentDepsOptions = {}): BuildSocialContentDeps {
  const siteUrl = resolveSiteUrl(opts.siteUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cache = new Map<string, BrainDossier | null>();

  return {
    async fetchBrain(scopeKind, scopeValue) {
      const key = `${scopeKind ?? ""}|${scopeValue ?? ""}`;
      if (cache.has(key)) return cache.get(key) ?? null;

      try {
        const params = new URLSearchParams({ format: "json", view: "speak", tier: "2" });
        if (scopeKind && scopeValue) {
          params.set("scope_kind", scopeKind);
          params.set("scope_value", scopeValue);
        }
        const url = `${siteUrl}/api/b/master?${params.toString()}`;
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
          console.warn(`[social] brain fetch ${res.status} for scope ${key}`);
          cache.set(key, null);
          return null;
        }
        const json = (await res.json()) as {
          in_scope?: boolean;
          freshness_token?: string;
          conclusion?: string | null;
          key_metrics?: Array<{ label: string; value: string | number }>;
          brain_id?: string;
        };
        const dossier: BrainDossier = {
          in_scope: json.in_scope ?? false,
          freshness_token: json.freshness_token ?? "",
          conclusion: json.conclusion ?? null,
          key_metrics: json.key_metrics ?? [],
          brain_id: json.brain_id,
        };
        cache.set(key, dossier);
        return dossier;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[social] brain fetch error for scope ${key}: ${reason}`);
        cache.set(key, null);
        return null;
      }
    },
  };
}
