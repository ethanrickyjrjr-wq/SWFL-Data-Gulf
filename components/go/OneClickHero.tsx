// components/go/OneClickHero.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { heroDestination } from "@/lib/lab-entry/destination";
import { areaFromGoQuery } from "@/lib/lab-entry/area-from-query";
import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";
import type { AddressSuggestion } from "@/lib/geo/search-box";
import { GO_BRAND } from "./brand";

/**
 * The /go one-click page (operator decree 08/10/2026): a Google-simple hero —
 * "Address to email in one click." One bar, one New Listing button. Type the
 * address, click New Listing, the 7 lifecycle options drop, pick one, land in
 * the email lab with that recipe + address riding the SAME lab door the
 * homepage hero uses (heroDestination — [[blank]] fill + rkey + addr).
 *
 * Layout only for now — wiring depth (auto-build on arrival, signed-in addr
 * carry) is a separate brainstorm. Nothing here is new machinery: the
 * address-suggest/retrieve APIs, the recipe registry, and the lab door all
 * exist; this page just points them at one another.
 */

/** The 7 listing-lifecycle emails, in arc order (registry labels, never retyped). */
const LIFECYCLE_KEYS: readonly RecipeKey[] = [
  "new-listing",
  "coming-soon",
  "open-house",
  "market-comps",
  "price-reduced",
  "under-contract",
  "just-sold",
];

/** Area-keyed options after the lifecycle 7 (operator decree 08/11/2026: the
 *  "28 homes in Fort Myers" listings digest gets a /go door too). These fill
 *  the recipe's [[your city or ZIP]] with the CITY sliced from whatever the
 *  bar holds — a full listing address still works. */
const AREA_KEYS: readonly RecipeKey[] = ["listings-digest"];

// The palette moved to ./brand.ts on 08/11/2026 so the top bar and the hero read
// ONE root — a color can no longer drift between them. Alias kept so the JSX below
// is untouched.
const BRAND = GO_BRAND;

export default function OneClickHero() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // One Search Box session_token per typing session (same pattern as HeroBar).
  const [session] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timeout hygiene only (react-hooks/set-state-in-effect is a hard error here).
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    setMenuOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 3 || /^\d{5}$/.test(q)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/address-suggest?q=${encodeURIComponent(q)}&session=${session}`,
        );
        const json = (await res.json()) as { suggestions?: AddressSuggestion[] };
        setSuggestions(json.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pick = async (s: AddressSuggestion) => {
    setBusy(true);
    setSuggestions([]);
    try {
      const res = await fetch(
        `/api/address-retrieve?id=${encodeURIComponent(s.mapboxId)}&session=${session}`,
      );
      if (res.ok) {
        const json = (await res.json()) as { name: string };
        setQuery(json.name);
        setMenuOpen(true);
        return;
      }
    } catch {
      /* fall through to the suggestion's own text */
    }
    setQuery(`${s.name}${s.placeFormatted ? `, ${s.placeFormatted}` : ""}`);
    setMenuOpen(true);
  };

  const openMenu = () => {
    if (suggestions.length > 0) {
      void pick(suggestions[0]).finally(() => setBusy(false));
      return;
    }
    setMenuOpen((v) => !v);
  };

  const build = (key: RecipeKey) => {
    const recipe = RECIPES[key];
    const raw = query.trim();
    // Area-keyed options (Listings Digest) fill with the city sliced from the
    // bar; address options carry the bar verbatim. Empty/unsliceable text keeps
    // the [[blank]] so the lab asks instead of building unscoped.
    const area = recipe.subject === "area";
    window.location.assign(
      heroDestination(
        { input: area ? "area" : "address", recipe },
        { filled: area ? areaFromGoQuery(raw) : raw },
      ),
    );
  };

  return (
    <main className="flex grow flex-col items-center bg-white px-4" style={{ color: BRAND.text }}>
      <div className="flex w-full max-w-2xl grow flex-col items-center justify-center pb-24">
        <h1
          className="mt-4 text-center font-bold"
          style={{
            color: BRAND.primary,
            fontFamily: "var(--go-font-display), sans-serif",
            fontSize: "clamp(2rem, 6vw, 3.25rem)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
          }}
        >
          Address to email
          <br />
          in one click.
        </h1>

        <div className="relative mt-10 w-full">
          <div
            className="flex w-full items-center rounded-full border bg-white py-2 pl-6 pr-2 shadow-sm focus-within:shadow-md"
            style={{ borderColor: BRAND.hairline }}
          >
            <input
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
              type="text"
              value={query}
              placeholder="Type your listing's address…"
              aria-label="Listing address"
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openMenu();
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={openMenu}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="ml-3 shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: BRAND.accent, color: BRAND.primary }}
            >
              {busy ? "One sec…" : "New Listing ▾"}
            </button>
          </div>

          {suggestions.length > 0 && (
            <ul
              className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border bg-white shadow-lg"
              style={{ borderColor: BRAND.hairline }}
              role="listbox"
              aria-label="Address suggestions"
            >
              {suggestions.map((s) => (
                <li key={s.mapboxId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="flex w-full flex-col items-start px-5 py-3 text-left hover:bg-slate-50"
                    onClick={() => void pick(s).finally(() => setBusy(false))}
                  >
                    <span className="text-sm font-medium" style={{ color: BRAND.primary }}>
                      {s.name}
                    </span>
                    <span className="text-xs text-slate-500">{s.placeFormatted}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {menuOpen && suggestions.length === 0 && (
            <div
              className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border bg-white shadow-lg"
              style={{ borderColor: BRAND.hairline }}
              role="menu"
              aria-label="New Listing lifecycle emails"
            >
              {[...LIFECYCLE_KEYS, ...AREA_KEYS].map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className="w-full px-5 py-3 text-left text-sm font-semibold hover:bg-slate-50"
                  style={{ color: BRAND.primary }}
                  onClick={() => build(key)}
                >
                  {RECIPES[key].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
