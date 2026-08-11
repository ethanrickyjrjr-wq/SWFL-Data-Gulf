# Caching + KV — what we have, and what the vendor actually says (07/21/2026)

> **Recommended model:** ⚡ Sonnet — 16 files, keywords: migration

Crawled in-session via crawl4ai (RULE 0.4). Prior in-repo "research" on this
(`docs/_archive/superseded/site-audits/2026-06-21-.../web-nextjs-production-checklist.md`) is a
scraped nav sidebar with no content — it was useless, which is why this file exists.

Installed: **next 16.2.9**, react 19.2.7 (from `package.json`).

---

## A. What we have today — tool-verified

| Surface | State | How verified |
|---|---|---|
| Vercel KV / Upstash / Redis | **None.** `redis` in `bun.lock` is transitive only (`mcp-handler`, `natural`) | grep over repo + lockfile |
| `cacheComponents` flag | **NOT set** in `next.config.ts` | read the file |
| `use cache` / `cacheLife` / `cacheTag` | **Unavailable** — they require the flag above | vendor docs + config read |
| `unstable_cache` | Present in installed Next 16.2.9, exported from `next/cache` | `node_modules/next/cache.d.ts` |
| Route-segment `revalidate` | 6 surfaces: `/desk` 300, `/charts` 300, `/insiders` 3600, `/embed/charts` 3600, `/embed/cards/asking-rent` 3600, `/embed/desk/pulse` 300 | grep `export const revalidate` |
| `next: { revalidate }` on fetch | 4 call sites: `lib/email/build-doc.ts`, `lib/deliverable/recipes/under-contract.ts`, `lib/listings/steadyapi.ts`, `app/embed/footer-token` | grep |
| CDN `s-maxage` | 3 routes only: `/api/zip-shape/[zip]`, `/c/[id]/card`, `/api/og/should-i-sell/[zip]` | grep Cache-Control |
| `force-dynamic` pages | 37 | grep over `app/**/page.tsx` |
| In-process memo caches | 2: `lib/fetch-brain.ts` `brainCache` (no TTL, keyed slug:tier:origin), `lib/welcome/dossier-cache.ts` (5-min TTL, 200-entry LRU + per-process daily cap) | read both files |
| `/api/b/*` | `Cache-Control: no-store` + `force-dynamic`. Code comment: *"Phase 0 tests cache-invalidation behavior explicitly."* | read `app/api/b/[slug]/route.ts` |

---

## B. Vendor contract — verbatim, crawled 07/21/2026

### `use cache` (nextjs.org/docs/app/api-reference/directives/use-cache, doc dated May 13 2026)

- Requires `cacheComponents: true` in `next.config.ts`. **The flag is named `cacheComponents`** —
  not `dynamicIO` (the older name). Verbatim from the doc.
- Cache key = build ID + function ID (hash of location/signature) + serializable arguments +
  HMR hash (dev only). Closure variables are captured and become part of the key.
- Arguments and return values must be serializable. Class instances, functions, symbols,
  WeakMap/Set, and **URL instances** are unsupported. JSX can be returned but not accepted.
- Cannot read `cookies()`/`headers()` inside the scope — read outside, pass as arguments.
- **Stores entries in-memory.** Verbatim: *"In serverless environments, memory is not shared
  between instances and is typically destroyed after serving a request, leading to frequent cache
  misses for runtime caching."*

### `cacheLife` preset profiles (nextjs.org/docs/app/api-reference/functions/cacheLife)

Three properties: `stale` (client router reuse window), `revalidate` (background regen interval),
`expire` (max age before synchronous regen).

| Profile | stale | revalidate | expire |
|---|---|---|---|
| `default` | 5 min | 15 min | never |
| `seconds` | 30 sec | 1 sec | 1 min |
| `minutes` | 5 min | 1 min | 1 hour |
| `hours` | 5 min | 1 hour | 1 day |
| `days` | 5 min | 1 day | 1 week |
| `weeks` | 5 min | 1 week | 30 days |
| `max` | 5 min | 30 days | 1 year |

Custom profiles are declarable under `nextConfig.cacheLife`. `expire` must exceed `revalidate` or
Next raises a build error. `cacheLife` cannot be called at module scope.

### `use cache: remote` — the KV question (nextjs.org/docs/app/api-reference/directives/use-cache-remote, doc dated March 3 2026)

This is Next's own framing of "put a KV in front of your data." The doc names when NOT to:

- *"If you already have a server-side cache key-value store wrapping your data layer, `use cache`
  may be sufficient."*
- *"If operations are already fast (< 50ms) due to proximity or local access, the remote cache
  lookup might not improve performance."*
- *"If cache keys have mostly unique values per request (search filters, price ranges,
  user-specific parameters), cache utilization will be near-zero."*
- *"If data changes frequently (seconds to minutes), cache hits will quickly go stale."*

When it DOES make sense, verbatim: rate-limited APIs, protecting slow backends under high traffic,
expensive repeated operations, flaky external services.

Cost line, verbatim from the comparison table: `use cache` additional costs = **None**;
`use cache: remote` additional costs = **Infrastructure (storage, network)**, plus
*"Cache handler lookup"* latency. The `use cache` doc adds that remote *"typically incurs platform
fees."*

Third directive `use cache: private` — per-client (browser), no server cache, CAN read
cookies/headers directly.

---

## C. Reading — labelled (B), my conclusion, not tool output

1. **A KV store is ruled out for our profile, by the vendor's own when-to-avoid list.** We are not
   rate-limited, not high-traffic, and Supabase is not a flaky external service. RULE 11 applies:
   this is a hyperscaler pattern. Adding a paid network hop in front of a database we barely hit
   would add cost and latency, not remove it.
2. **`cacheComponents: true` is a repo-wide migration, not a per-page toggle.** Flipping it makes
   the app cache-opt-in — uncached dynamic access outside a Suspense boundary becomes a build
   error, across all 124 route files. Not proportionate to the problem.
3. **The brains ARE our cache and we are bypassing them.** Static markdown, rebuilt nightly,
   immutable for a deployment's lifetime, bundled on disk, zero egress. The 07/21 egress handoff
   documents `lib/desk/loaders.ts` reading the lake live with zero brain reads. Routing public
   reads back through brains beats any cache layer we could add on top of the lake.

---

## D. Open, NOT verified

- Actual cache hit rates / request volume per surface — never measured. No number here is a
  traffic claim.
- Whether "Phase 0" (the reason `/api/b/*` is `no-store`) is over. That was a deliberate choice;
  it needs an operator call, not a silent flip.
- Which of the 37 `force-dynamic` pages are dynamic by necessity vs by copy-paste default.
