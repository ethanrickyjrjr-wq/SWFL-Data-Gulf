# Agent-First Homepage (Build 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 13 files, keywords: schema, architecture

**Goal:** Replace the homepage hero with an address-bar + four campaign chips that open the email lab prebuilt (address → ZIP-grade fallback), and demote the map below the fold — per `docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md`.

**Architecture:** A new client hero (`HeroCampaign`) drives a Mapbox Search Box suggest/retrieve autocomplete through two thin server proxy routes (token stays server-side). Picking a suggestion resolves the ZIP before navigation; the hero fills the recipe's `[[blank]]` with the picked text and lands on `/email-lab/grid?zip=&recipe=&recipeNeeds=`. The grid page's anonymous branch gains the same deterministic ZIP-seed prebuild `/email-lab` already has. Campaign chips resolve to recipes that ALREADY exist in the showcase registry via a new selector in `lib/campaigns.ts` (a showcase carries at most ONE `campaign`, so Just Sold / Coming to Market are exposed from their `listing-to-close` slide recipes — no parallel registry, spec's "no dead chips" goal honored with an adjusted mechanism).

**Tech Stack:** Next.js App Router (nodejs runtime), React 19, bun:test, Mapbox Search Box API (`/suggest` + `/retrieve`, session-token billing), existing `buildZipSeedDoc` / `EmailLabGridShell` / `findPlaceholder`.

## Global Constraints

- Hero copy: headline exactly **"Research done. Send. We'll take care of the rest."**; subline exactly **"Type your next listing's address. We build the campaign from live Southwest Florida data — every number sourced — and send it on your schedule."** The word "AI" must NOT appear anywhere in the hero. (Spec.)
- Chip order exactly: New Listing · Just Sold · Coming to Market · Market Update. Listing chips placeholder: `Type your next listing's address…`; Market Update placeholder: `Type a city or ZIP…`. No second input, no error states — every input resolves. (Spec, settled 07/05/2026.)
- Mapbox: `/suggest` per debounced keystroke, `/retrieve` on selection; one `session_token` (UUIDv4) per typing session, same token on suggest and retrieve; `country=US`; `types=address,postcode,place,locality,neighborhood`; proximity defaults to IP (documented default — do not pass coordinates). Token: server-side `MAPBOX_TOKEN` only — never shipped to the client. (Spec, verified live 07/05/2026.)
- No subject-property value estimates anywhere. No new data-lake gates. Map mechanics (pills, ramps, ZIP-click→lab, stats bar) unchanged. `/r/zip-report` and `/ask` stay reachable from the map section.
- Verify with `bunx next build` (never bare `npx tsc`). Stage explicit paths only (never `git add -A`). SESSION_LOG entry before push; push via `node scripts/safe-push.mjs` as a separate command from the commit; after the final commit STOP and ask the operator before pushing.
- `agent_first_homepage_live_verify` is operator-run — do NOT close it from this plan.
- `lib/email/scheduler.ts`, `scripts/email/run-schedules.mts`, `app/p/[id]/page.tsx`, `lib/email/idempotency.ts` are claimed by a parallel session — this plan must not touch them (it doesn't).

## File Structure

- Create `lib/geo/search-box.ts` — pure URL builders + response parsers for Mapbox Search Box (no fetch, no env).
- Create `lib/geo/search-box.test.ts` — bun:test for the above.
- Create `app/api/address-suggest/route.ts` — GET proxy → Mapbox `/suggest`.
- Create `app/api/address-retrieve/route.ts` — GET proxy → Mapbox `/retrieve`, returns `{ name, zip, inScope }` (scope via existing `resolveZip`).
- Modify `lib/campaigns.ts` — add `HERO_CAMPAIGNS` selector + `heroDestination()` URL builder.
- Modify `lib/campaigns.test.ts` — tests for both.
- Create `components/landing/HeroCampaign.tsx` — the new hero (client component).
- Modify `components/landing/home-explorer.css` — dropdown + chip-active styles (append only).
- Modify `app/email-lab/grid/page.tsx` + `app/email-lab/grid/EmailLabGridClient.tsx` — anonymous ZIP-seed prebuild via optional `seedDoc` prop.
- Modify `components/landing/Hero.tsx` — strip the headline/search block (moves to HeroCampaign); keep badge, metric pills, map, rail, stats; add section heading + relocate the report/ask search into the map section.
- Modify `app/page.tsx` — render `<HeroCampaign />` above `<Hero />`; update metadata copy.

---

### Task 1: `HERO_CAMPAIGNS` selector + `heroDestination` in lib/campaigns.ts

**Files:**
- Modify: `lib/campaigns.ts`
- Test: `lib/campaigns.test.ts`

**Interfaces:**
- Consumes: `SHOWCASES` from `@/lib/showcase/registry`, `findPlaceholder`, `ShowcaseRecipe` from `@/lib/showcase/recipe`.
- Produces: `type HeroCampaignKey = "new-listing" | "just-sold" | "coming-to-market" | "market-update"`; `interface HeroCampaignEntry { key: HeroCampaignKey; label: string; input: "address" | "area"; recipe: ShowcaseRecipe }`; `const HERO_CAMPAIGNS: HeroCampaignEntry[]`; `function heroDestination(entry: HeroCampaignEntry, opts: { filled: string; zip?: string | null }): string` (fills the `[[blank]]`, returns `/email-lab/grid?...`).

- [ ] **Step 1: Write the failing tests** — append to `lib/campaigns.test.ts`:

```ts
import { HERO_CAMPAIGNS, heroDestination } from "./campaigns";
import { findPlaceholder } from "@/lib/showcase/recipe";

describe("HERO_CAMPAIGNS", () => {
  test("exactly four chips in spec order", () => {
    expect(HERO_CAMPAIGNS.map((c) => c.key)).toEqual([
      "new-listing",
      "just-sold",
      "coming-to-market",
      "market-update",
    ]);
  });

  test("every chip resolves a recipe with one [[blank]] and brand needs", () => {
    for (const c of HERO_CAMPAIGNS) {
      expect(findPlaceholder(c.recipe.prompt)).not.toBeNull();
      expect(c.recipe.needs.length).toBeGreaterThan(0);
    }
  });

  test("listing chips take an address; market-update takes an area", () => {
    const byKey = Object.fromEntries(HERO_CAMPAIGNS.map((c) => [c.key, c.input]));
    expect(byKey["new-listing"]).toBe("address");
    expect(byKey["just-sold"]).toBe("address");
    expect(byKey["coming-to-market"]).toBe("address");
    expect(byKey["market-update"]).toBe("area");
  });
});

describe("heroDestination", () => {
  test("fills the blank and carries zip + recipeNeeds to the grid lab", () => {
    const entry = HERO_CAMPAIGNS[0];
    const url = heroDestination(entry, { filled: "123 Main St, Cape Coral", zip: "33904" });
    expect(url.startsWith("/email-lab/grid?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("recipe")).toContain("123 Main St, Cape Coral");
    expect(params.get("recipe")).not.toContain("[[");
    expect(params.get("zip")).toBe("33904");
    expect(params.get("recipeNeeds")).toBe(entry.recipe.needs.join(","));
  });

  test("omits zip when the pick has none (city input)", () => {
    const entry = HERO_CAMPAIGNS[3];
    const url = heroDestination(entry, { filled: "Cape Coral", zip: null });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("recipe")).toContain("Cape Coral");
    expect(params.get("zip")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/campaigns.test.ts`
Expected: FAIL — `HERO_CAMPAIGNS` / `heroDestination` not exported.

- [ ] **Step 3: Implement** — append to `lib/campaigns.ts`:

```ts
import { findPlaceholder, type ShowcaseRecipe } from "@/lib/showcase/recipe";

/** The four homepage hero chips (spec 2026-07-05-agent-first-homepage-design).
 *  Still a thin read over SHOWCASES — a showcase carries at most ONE `campaign`,
 *  so Just Sold / Coming to Market surface their listing-to-close SLIDE recipes
 *  (looked up by slide title; the test suite pins existence). */
export type HeroCampaignKey = "new-listing" | "just-sold" | "coming-to-market" | "market-update";

export interface HeroCampaignEntry {
  key: HeroCampaignKey;
  label: string;
  /** Which placeholder the input bar shows: a listing address or an area. */
  input: "address" | "area";
  recipe: ShowcaseRecipe;
}

function showcaseSeed(showcaseId: string): ShowcaseRecipe {
  const recipe = SHOWCASES.find((s) => s.id === showcaseId)?.campaign?.seedRecipe;
  if (!recipe) throw new Error(`hero campaign: no seedRecipe on showcase "${showcaseId}"`);
  return recipe;
}

function slideRecipe(showcaseId: string, slideTitle: string): ShowcaseRecipe {
  const recipe = SHOWCASES.find((s) => s.id === showcaseId)?.slides.find(
    (sl) => sl.title === slideTitle,
  )?.recipe;
  if (!recipe) throw new Error(`hero campaign: no recipe on slide "${slideTitle}" of "${showcaseId}"`);
  return recipe;
}

export const HERO_CAMPAIGNS: HeroCampaignEntry[] = [
  { key: "new-listing", label: "New Listing", input: "address", recipe: showcaseSeed("listing-to-close") },
  { key: "just-sold", label: "Just Sold", input: "address", recipe: slideRecipe("listing-to-close", "Sold") },
  {
    key: "coming-to-market",
    label: "Coming to Market",
    input: "address",
    recipe: slideRecipe("listing-to-close", "Coming Soon"),
  },
  { key: "market-update", label: "Market Update", input: "area", recipe: showcaseSeed("market-pulse") },
];

/** Hero → grid-lab URL: fill the recipe's [[blank]] with the picked text and
 *  carry zip (when known) + recipeNeeds — the same params the lab already reads. */
export function heroDestination(
  entry: HeroCampaignEntry,
  opts: { filled: string; zip?: string | null },
): string {
  const ph = findPlaceholder(entry.recipe.prompt);
  const prompt = ph
    ? entry.recipe.prompt.slice(0, ph.start) + opts.filled + entry.recipe.prompt.slice(ph.end)
    : entry.recipe.prompt;
  const params = new URLSearchParams({ recipe: prompt });
  if (entry.recipe.needs.length > 0) params.set("recipeNeeds", entry.recipe.needs.join(","));
  if (opts.zip) params.set("zip", opts.zip);
  return `/email-lab/grid?${params.toString()}`;
}
```

(`SHOWCASES` is already imported at the top of `lib/campaigns.ts`; add `findPlaceholder` + the `ShowcaseRecipe` type import to the existing import from `@/lib/showcase/recipe` if not present — the file currently imports types from the registry only.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/campaigns.test.ts`
Expected: PASS (all new + existing).

- [ ] **Step 5: Commit**

```bash
git add lib/campaigns.ts lib/campaigns.test.ts
git commit -m "feat(hero): HERO_CAMPAIGNS selector + heroDestination — four chips over existing registry recipes (agent-first-homepage T1)"
```

---

### Task 2: Pure Mapbox Search Box helpers — `lib/geo/search-box.ts`

**Files:**
- Create: `lib/geo/search-box.ts`
- Test: `lib/geo/search-box.test.ts`

**Interfaces:**
- Consumes: nothing internal (pure).
- Produces: `buildSuggestUrl(q: string, sessionToken: string, accessToken: string): string`; `buildRetrieveUrl(mapboxId: string, sessionToken: string, accessToken: string): string`; `parseSuggestions(json: unknown): AddressSuggestion[]` where `AddressSuggestion = { mapboxId: string; name: string; placeFormatted: string }`; `parseRetrieve(json: unknown): { name: string; zip: string | null } | null`.

- [ ] **Step 1: Write the failing tests** — `lib/geo/search-box.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildSuggestUrl,
  buildRetrieveUrl,
  parseSuggestions,
  parseRetrieve,
} from "./search-box";

describe("buildSuggestUrl", () => {
  test("hits /suggest with q, session_token, US filter, and the type list", () => {
    const url = new URL(buildSuggestUrl("123 Main St", "sess-1", "tok"));
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/searchbox/v1/suggest");
    expect(url.searchParams.get("q")).toBe("123 Main St");
    expect(url.searchParams.get("session_token")).toBe("sess-1");
    expect(url.searchParams.get("access_token")).toBe("tok");
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("types")).toBe("address,postcode,place,locality,neighborhood");
    expect(url.searchParams.get("limit")).toBe("6");
  });
});

describe("buildRetrieveUrl", () => {
  test("hits /retrieve/{id} with the SAME session token", () => {
    const url = new URL(buildRetrieveUrl("abc123", "sess-1", "tok"));
    expect(url.pathname).toBe("/search/searchbox/v1/retrieve/abc123");
    expect(url.searchParams.get("session_token")).toBe("sess-1");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });
});

describe("parseSuggestions", () => {
  test("maps suggestions to id/name/placeFormatted, skipping malformed rows", () => {
    const out = parseSuggestions({
      suggestions: [
        { mapbox_id: "id1", name: "123 Main St", place_formatted: "Cape Coral, Florida 33904, United States" },
        { name: "no-id row" },
      ],
    });
    expect(out).toEqual([
      { mapboxId: "id1", name: "123 Main St", placeFormatted: "Cape Coral, Florida 33904, United States" },
    ]);
  });

  test("empty/garbage input → []", () => {
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({})).toEqual([]);
  });
});

describe("parseRetrieve", () => {
  test("pulls name + postcode from the feature's context", () => {
    const out = parseRetrieve({
      features: [
        {
          properties: {
            name: "123 Main St",
            full_address: "123 Main St, Cape Coral, Florida 33904, United States",
            context: { postcode: { name: "33904" } },
          },
        },
      ],
    });
    expect(out).toEqual({ name: "123 Main St, Cape Coral, Florida 33904, United States", zip: "33904" });
  });

  test("no postcode (city pick) → zip null; no feature → null", () => {
    const out = parseRetrieve({
      features: [{ properties: { name: "Cape Coral", context: {} } }],
    });
    expect(out).toEqual({ name: "Cape Coral", zip: null });
    expect(parseRetrieve({ features: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/geo/search-box.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `lib/geo/search-box.ts`:

```ts
// lib/geo/search-box.ts — pure URL builders + parsers for the Mapbox Search Box
// API (interactive autocomplete: /suggest per keystroke, /retrieve on pick).
// Contract verified live 07/05/2026 against docs.mapbox.com/api/search/search-box:
// both endpoints REQUIRE the same customer-generated session_token (UUIDv4) —
// that's what folds a whole typing session into one billed search session
// (≤50 suggests + 1 retrieve, 2-min idle expiry). Proximity is deliberately
// omitted: the documented default is IP proximity, which is the right bias for
// visitors already in Southwest Florida. No fetch and no env in this module —
// the API routes own both, so these stay trivially testable.

const BASE = "https://api.mapbox.com/search/searchbox/v1";
const TYPES = "address,postcode,place,locality,neighborhood";

export interface AddressSuggestion {
  mapboxId: string;
  name: string;
  placeFormatted: string;
}

export function buildSuggestUrl(q: string, sessionToken: string, accessToken: string): string {
  const p = new URLSearchParams({
    q: q.slice(0, 256),
    session_token: sessionToken,
    access_token: accessToken,
    country: "US",
    types: TYPES,
    limit: "6",
    language: "en",
  });
  return `${BASE}/suggest?${p.toString()}`;
}

export function buildRetrieveUrl(mapboxId: string, sessionToken: string, accessToken: string): string {
  const p = new URLSearchParams({ session_token: sessionToken, access_token: accessToken });
  return `${BASE}/retrieve/${encodeURIComponent(mapboxId)}?${p.toString()}`;
}

export function parseSuggestions(json: unknown): AddressSuggestion[] {
  const rows = (json as { suggestions?: unknown[] } | null)?.suggestions;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const row = r as { mapbox_id?: unknown; name?: unknown; place_formatted?: unknown };
    if (typeof row.mapbox_id !== "string" || typeof row.name !== "string") return [];
    return [
      {
        mapboxId: row.mapbox_id,
        name: row.name,
        placeFormatted: typeof row.place_formatted === "string" ? row.place_formatted : "",
      },
    ];
  });
}

export function parseRetrieve(json: unknown): { name: string; zip: string | null } | null {
  const feature = (json as { features?: unknown[] } | null)?.features?.[0] as
    | {
        properties?: {
          name?: unknown;
          full_address?: unknown;
          context?: { postcode?: { name?: unknown } };
        };
      }
    | undefined;
  const props = feature?.properties;
  if (!props) return null;
  const name =
    typeof props.full_address === "string"
      ? props.full_address
      : typeof props.name === "string"
        ? props.name
        : null;
  if (!name) return null;
  const zipRaw = props.context?.postcode?.name;
  const zip = typeof zipRaw === "string" && /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : null;
  return { name, zip };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/geo/search-box.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/geo/search-box.ts lib/geo/search-box.test.ts
git commit -m "feat(geo): pure Mapbox Search Box suggest/retrieve builders + parsers (agent-first-homepage T2)"
```

---

### Task 3: Proxy API routes — `/api/address-suggest` + `/api/address-retrieve`

**Files:**
- Create: `app/api/address-suggest/route.ts`
- Create: `app/api/address-retrieve/route.ts`

**Interfaces:**
- Consumes: Task 2's builders/parsers; `resolveZip` from `@/refinery/lib/zip-resolver.mts`; server env `MAPBOX_TOKEN`.
- Produces: `GET /api/address-suggest?q=&session=` → `{ suggestions: AddressSuggestion[] }`; `GET /api/address-retrieve?id=&session=` → `{ name: string; zip: string | null; inScope: boolean }` (404 when Mapbox returns no feature). The hero (Task 4) calls both.

- [ ] **Step 1: Implement suggest route** — `app/api/address-suggest/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildSuggestUrl, parseSuggestions } from "@/lib/geo/search-box";

export const runtime = "nodejs";

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server proxy for the hero autocomplete — the URL-restricted MAPBOX_TOKEN never
// ships to the browser. Empty-tolerant: any upstream failure → { suggestions: [] }
// (the hero degrades to free-typed submit; spec: no error states).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const session = req.nextUrl.searchParams.get("session") ?? "";
  const token = process.env.MAPBOX_TOKEN;
  if (q.length < 3 || !SESSION_RE.test(session) || !token) {
    return NextResponse.json({ suggestions: [] });
  }
  try {
    const res = await fetch(buildSuggestUrl(q, session, token), {
      headers: { Referer: req.nextUrl.origin },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });
    return NextResponse.json({ suggestions: parseSuggestions(await res.json()) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
```

- [ ] **Step 2: Implement retrieve route** — `app/api/address-retrieve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildRetrieveUrl, parseRetrieve } from "@/lib/geo/search-box";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

export const runtime = "nodejs";

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Second half of the autocomplete pair: called once when the visitor picks a
// suggestion. Resolves the pick to { name, zip, inScope } — inScope via the
// same zip-resolver the rest of the platform gates on (6-county footprint).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const session = req.nextUrl.searchParams.get("session") ?? "";
  const token = process.env.MAPBOX_TOKEN;
  if (!id || !SESSION_RE.test(session) || !token) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const res = await fetch(buildRetrieveUrl(id, session, token), {
      headers: { Referer: req.nextUrl.origin },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const parsed = parseRetrieve(await res.json());
    if (!parsed) return NextResponse.json({ error: "no feature" }, { status: 404 });
    const inScope = parsed.zip ? (resolveZip(parsed.zip)?.in_scope ?? false) : false;
    return NextResponse.json({ ...parsed, inScope });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
```

Before writing, open `refinery/lib/zip-resolver.mts` and confirm the `resolveZip` return shape (`in_scope` field) — `lib/geo/geocode-address.ts:59-61` uses `resolution?.in_scope` and `resolution.primary_county`, so mirror exactly what that file does. If the route can't import an `.mts` from a route handler cleanly (build error), re-export `resolveZip` through `lib/geo/geocode-address.ts` instead and import from there.

- [ ] **Step 3: Typecheck via build**

Run: `bunx next build 2>&1 | tail -20`
Expected: build completes; both routes listed in the route manifest. (If the `.mts` import trips the build, apply the re-export fallback from Step 2 and rebuild.)

- [ ] **Step 4: Commit**

```bash
git add app/api/address-suggest/route.ts app/api/address-retrieve/route.ts
git commit -m "feat(api): address-suggest + address-retrieve proxies — MAPBOX_TOKEN server-side, scope check on pick (agent-first-homepage T3)"
```

---

### Task 4: The hero component — `components/landing/HeroCampaign.tsx`

**Files:**
- Create: `components/landing/HeroCampaign.tsx`
- Modify: `components/landing/home-explorer.css` (append styles)

**Interfaces:**
- Consumes: `HERO_CAMPAIGNS`, `heroDestination`, `HeroCampaignEntry` (Task 1); `/api/address-suggest`, `/api/address-retrieve` (Task 3); existing CSS classes `hero`, `search-wrap`, `search-bar`, `search-input`, `search-btn`, `filter-pill`.
- Produces: `<HeroCampaign />` — self-contained client component; navigates with `window.location.href` (full load — the signed-in lab path is a server redirect, same reason as `openZipInLab` in `Hero.tsx:32-35`).

- [ ] **Step 1: Implement the component**:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_CAMPAIGNS, heroDestination, type HeroCampaignEntry } from "@/lib/campaigns";
import type { AddressSuggestion } from "@/lib/geo/search-box";

/**
 * Agent-first hero (spec: 2026-07-05-agent-first-homepage-design.md).
 * One bar + four campaign chips. The chip drives the placeholder; the bar
 * autocompletes via /api/address-suggest (Mapbox Search Box proxied server-side,
 * one session_token per typing session). Picking a row calls /api/address-retrieve
 * once (ZIP + scope resolved BEFORE the lab opens); free-typed submit falls back
 * to a bare-ZIP fast path or carries the text as-is (no error states — spec).
 * The word "AI" is deliberately absent from all copy here.
 */
export default function HeroCampaign() {
  const [chip, setChip] = useState<HeroCampaignEntry>(HERO_CAMPAIGNS[0]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!sessionRef.current && typeof crypto !== "undefined") {
    sessionRef.current = crypto.randomUUID();
  }

  // Debounced /suggest per keystroke (300ms, ≥3 chars). Empty-tolerant.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3 || /^\d{5}$/.test(q)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address-suggest?q=${encodeURIComponent(q)}&session=${sessionRef.current}`,
        );
        const json = (await res.json()) as { suggestions: AddressSuggestion[] };
        setSuggestions(json.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const go = (filled: string, zip: string | null) => {
    window.location.href = heroDestination(chip, { filled, zip });
  };

  const pick = async (s: AddressSuggestion) => {
    setBusy(true);
    setSuggestions([]);
    try {
      const res = await fetch(
        `/api/address-retrieve?id=${encodeURIComponent(s.mapboxId)}&session=${sessionRef.current}`,
      );
      if (res.ok) {
        const json = (await res.json()) as { name: string; zip: string | null };
        go(json.name, json.zip);
        return;
      }
    } catch {
      /* fall through to the suggestion's own text */
    }
    go(`${s.name}${s.placeFormatted ? `, ${s.placeFormatted}` : ""}`, null);
  };

  const submit = () => {
    const q = query.trim();
    if (!q || busy) return;
    if (/^\d{5}$/.test(q)) {
      go(q, q); // bare ZIP: it IS the scope
      return;
    }
    if (suggestions.length > 0) {
      void pick(suggestions[0]); // Enter = top suggestion, the standard pattern
      return;
    }
    go(q, null); // free text: recipe carries it verbatim (no error states)
  };

  return (
    <div className="hero">
      <h1>
        Research done. Send.
        <br />
        <em>We&rsquo;ll take care of the rest.</em>
      </h1>
      <p className="hero-sub">
        Type your next listing&rsquo;s address. We build the campaign from live Southwest Florida
        data — every number sourced — and send it on your schedule.
      </p>
      <div className="hero-chip-row" role="tablist" aria-label="Campaign type">
        {HERO_CAMPAIGNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={chip.key === c.key}
            className={`filter-pill${chip.key === c.key ? " active" : ""}`}
            onClick={() => setChip(c)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="search-wrap hero-addr-wrap">
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            value={query}
            placeholder={
              chip.input === "address" ? "Type your next listing’s address…" : "Type a city or ZIP…"
            }
            aria-label={
              chip.input === "address" ? "Your next listing's address" : "A city or ZIP code"
            }
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button className="search-btn" type="button" disabled={busy} onClick={submit}>
            {busy ? "Building…" : "Build it"}
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="hero-suggest" role="listbox" aria-label="Address suggestions">
            {suggestions.map((s) => (
              <li key={s.mapboxId}>
                <button type="button" role="option" aria-selected="false" onClick={() => void pick(s)}>
                  <span className="hero-suggest-name">{s.name}</span>
                  <span className="hero-suggest-place">{s.placeFormatted}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hero-note">Free to build — no credit card. Fewer, better sends.</p>
    </div>
  );
}
```

- [ ] **Step 2: Append styles** to `components/landing/home-explorer.css`:

```css
/* Agent-first hero (spec 2026-07-05): chip row + autocomplete dropdown */
.hero-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin: 14px 0 4px;
}
.hero-addr-wrap {
  position: relative;
}
.hero-suggest {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0d1b21;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
.hero-suggest li + li {
  margin-top: 2px;
}
.hero-suggest button {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 10px;
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.hero-suggest button:hover,
.hero-suggest button:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}
.hero-suggest-name {
  font-weight: 600;
}
.hero-suggest-place {
  font-size: 0.8rem;
  opacity: 0.7;
}
.hero-note {
  margin-top: 10px;
  font-size: 0.85rem;
  opacity: 0.75;
}
```

(Match the file's existing color variables if it uses CSS custom properties — open the file first and reuse its tokens for the dropdown background/border instead of the literals above if tokens exist.)

- [ ] **Step 3: Typecheck via build**

Run: `bunx next build 2>&1 | tail -10`
Expected: clean build. (Component isn't rendered anywhere yet — that's Task 6.)

- [ ] **Step 4: Commit**

```bash
git add components/landing/HeroCampaign.tsx components/landing/home-explorer.css
git commit -m "feat(hero): HeroCampaign — address bar + chip-driven placeholder + suggest dropdown (agent-first-homepage T4)"
```

---

### Task 5: ZIP-seed prebuild in the anonymous grid lab

**Files:**
- Modify: `app/email-lab/grid/page.tsx:47-49`
- Modify: `app/email-lab/grid/EmailLabGridClient.tsx`

**Interfaces:**
- Consumes: `buildZipSeedDoc(zip: string): Promise<EmailDoc | null>` from `@/lib/email/zip-seed` (exact pattern: `app/email-lab/page.tsx:50`).
- Produces: `EmailLabGridClient` accepts optional `seedDoc?: EmailDoc | null` prop; when present it becomes the shell's `initialDoc` (shell already takes `initialDoc: EmailDoc` — `components/email-lab/EmailLabGridShell.tsx:182-183`).

- [ ] **Step 1: Thread the seed doc through the anonymous branch** — in `app/email-lab/grid/page.tsx`, add the import and replace the anonymous return:

```ts
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
```

```tsx
  // Anonymous + ?zip= (homepage hero / map click): same deterministic prebuild
  // as /email-lab — the visitor lands on a branded email already on canvas, $0
  // until they engage the builder. EmailLabGridClient still reads ?recipe=
  // itself; only the seed doc is server-built.
  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
  return <EmailLabGridClient seedDoc={seedDoc} />;
```

- [ ] **Step 2: Accept the prop in the client** — in `app/email-lab/grid/EmailLabGridClient.tsx`:

```tsx
import type { EmailDoc } from "@/lib/email/doc/schema";

export function EmailLabGridClient({ seedDoc }: { seedDoc?: EmailDoc | null }) {
  const [initialDoc] = useState(
    () => seedDoc ?? (seedById("luxury-market-report") ?? SEED_DOCS[0]).build(),
  );
```

(Leave the rest of the component untouched. Confirm the `EmailDoc` type's import path by checking what `app/email-lab/page.tsx` / `lib/email/zip-seed.ts` use — `lib/email/doc/schema` per the audit; adjust if the type lives elsewhere.)

- [ ] **Step 3: Typecheck via build, then behavior check**

Run: `bunx next build 2>&1 | tail -10`
Expected: clean.
Then run the existing zip-seed tests to make sure nothing upstream moved: `bun test lib/email/zip-seed.test.ts` — expected PASS.

- [ ] **Step 4: Commit**

```bash
git add app/email-lab/grid/page.tsx app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(grid-lab): anonymous ?zip= opens the grid on the deterministic ZIP-seed prebuild (agent-first-homepage T5)"
```

---

### Task 6: Homepage assembly — hero swap + map demotion

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/landing/Hero.tsx`

**Interfaces:**
- Consumes: `<HeroCampaign />` (Task 4). `Hero` keeps its `payload` prop unchanged.
- Produces: the final page order — HeroCampaign → (map section, retitled, with the report/ask search + metric pills) → ProofStrip → the rest unchanged.

- [ ] **Step 1: Strip Hero.tsx down to the map section.** In `components/landing/Hero.tsx`, replace the `<div className="hero">…</div>` block (lines 252-305 — badge, h1, hero-sub, search-wrap, filter-row) with a compact map-section header that keeps the badge, the metric pills, AND the report/ask search bar (spec: those paths stay reachable here):

```tsx
    <section>
      <div className="map-section" id="data">
        <div className="map-intro">
          <div className="hero-badge">{badge}</div>
          <h2 className="map-heading">The data your campaigns are built on</h2>
          <p className="map-sub">
            Live Southwest Florida market signals, cited to the source. Click any ZIP — map or
            list — and it opens in the email lab, prebuilt with that ZIP&rsquo;s live figures.
          </p>
          <div className="search-wrap">
            <div className="search-bar">
              {/* keep the existing svg icon + input + button JSX exactly as-is */}
            </div>
          </div>
          <div className="filter-row">
            {availableMetrics.map((k) => (
              <button
                key={k}
                className={`filter-pill${metric === k ? " active" : ""}`}
                type="button"
                onClick={() => setMetric(k)}
              >
                {data.metrics[k]?.label}
              </button>
            ))}
          </div>
        </div>
        {/* existing .map-layout, legend, tooltip, stats-bar JSX unchanged below */}
```

Keep `submitSearch` (Hero.tsx:243-248) exactly as-is — ZIP → `/r/zip-report/`, text → `/ask`. Add `.map-intro`, `.map-heading`, `.map-sub` styles to `home-explorer.css` (reuse the h1/hero-sub styling at reduced scale — h2 around 1.6rem, centered, same palette). Delete nothing else.

- [ ] **Step 2: Assemble the page.** In `app/page.tsx`:

```tsx
import HeroCampaign from "@/components/landing/HeroCampaign";
```

```tsx
    <main className="home-explorer relative">
      <HeroCampaign />
      <Hero payload={payload} />
      <ProofStrip items={proofItems} zipCount={Object.keys(data.placeNames).length} />
```

And update the metadata block (keep "SWFL Data Gulf" in the title; no "AI" in either field):

```tsx
export const metadata: Metadata = {
  title: "SWFL Data Gulf — Your listing's marketing, built and sent for you",
  description:
    "Type your next listing's address and pick a campaign — new listing, just sold, coming to market, or a market update. We build the emails and socials from live Southwest Florida data, every number sourced, and send them on your schedule. Free to build, no credit card.",
};
```

- [ ] **Step 3: Full build + landing tests**

Run: `bunx next build 2>&1 | tail -10`
Expected: clean.
Run: `bun test components/landing lib/landing 2>&1 | tail -5` (if landing tests exist; skip silently if none match).
Expected: PASS.

- [ ] **Step 4: Live flow check (dev server)**

Run: `bun run dev` (background), then verify in the browser:
- `/` shows the new hero; chips swap the placeholder text; typing 3+ chars of a real Lee/Collier street shows the dropdown (requires `MAPBOX_TOKEN` in `.env.local` — present as of 07/05/2026).
- Picking an address navigates to `/email-lab/grid?zip=…&recipe=…` and the canvas opens on the ZIP-seed doc with the Build box pre-filled — the address text sits where the `[[blank]]` was.
- Typing a bare ZIP (e.g. one from the map rail) + Enter lands the same way.
- Map section: pills recolor the map, ZIP click still opens the lab, search still routes ZIP → `/r/zip-report/…` and text → `/ask`.
Kill the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/landing/Hero.tsx components/landing/home-explorer.css
git commit -m "feat(homepage): agent-first hero live — address bar + campaign chips; map demoted to proof-of-data section (agent-first-homepage T6)"
```

---

### Task 7: Wrap-up — session log, push gate, verify hand-off

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: SESSION_LOG entry** (top of file) — what shipped (T1–T6 one-liners + commit range), what's NOT in this build (address spine = build 2; sequences = build 3), and that `agent_first_homepage_live_verify` stays open for the operator's prod check.

- [ ] **Step 2: Commit the log**

```bash
git add SESSION_LOG.md
git commit -m "docs(session): agent-first homepage build 1 shipped locally — hero + chips + grid zip-seed"
```

- [ ] **Step 3: Pre-push checks, then STOP.**

Run: `git log origin/main..HEAD --oneline` — name any foreign commits; if present, ask the operator before pushing anything.
Then STOP and ask the operator for push approval (standing rule: a question is not push authorization). On approval: `node scripts/safe-push.mjs` as its own command — never compounded with a commit.

- [ ] **Step 4: Offer the live verify.** After the operator pushes + Vercel deploys, the operator runs the flow on production and closes the check themselves (`node scripts/check.mjs close agent_first_homepage_live_verify`). Do not close it from this session.

---

## Self-Review (done at write time)

- **Spec coverage:** hero copy/chips/placeholder (T4), autocomplete vendor contract (T2/T3), scope-resolved-before-lab (T3 retrieve + T4 pick), ZIP-grade fallback prebuild (T5), no-dead-chips (T1 resolves all four from live registry recipes; Just Sold + Coming to Market via slide recipes — mechanism deviation from the spec's `campaign.status` wording, same goal, forced by the one-campaign-per-showcase constraint discovered in `lib/showcase/registry.ts:71`), map demotion + report/ask retained (T6), metadata re-flip (T6), live-verify stays operator-run (T7). Not in scope, per spec: address spine, sequences, social chips.
- **Placeholder scan:** clean — every code step carries complete code; the two "confirm before writing" notes (zip-resolver shape, EmailDoc import path) name the exact fallback.
- **Type consistency:** `HeroCampaignEntry`/`heroDestination` (T1) match T4's imports; `AddressSuggestion` (T2) matches T3 responses and T4's fetch typing; `seedDoc` prop (T5) matches the shell's `initialDoc: EmailDoc`.
