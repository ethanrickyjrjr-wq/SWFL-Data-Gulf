"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_CAMPAIGNS, type HeroCampaignEntry } from "@/lib/campaigns";
import { heroDestination } from "@/lib/lab-entry/destination";
import type { AddressSuggestion } from "@/lib/geo/search-box";

/**
 * Agent-first hero (spec: 2026-07-05-agent-first-homepage-design.md).
 * One bar + four campaign chips. The chip drives the placeholder; the bar
 * autocompletes via /api/address-suggest (Mapbox Search Box proxied server-side,
 * one session_token per typing session) and a pick calls /api/address-retrieve
 * once, so ZIP + scope are resolved BEFORE the lab opens. Free-typed submit
 * falls back to a bare-ZIP fast path or carries the text as-is — no error
 * states (spec). Full page load on navigate (not router.push): the signed-in
 * lab path is a server redirect, same reason as Hero.tsx's openZipInLab.
 * The word "AI" is deliberately absent from all copy here.
 */
export default function HeroCampaign() {
  const [chip, setChip] = useState<HeroCampaignEntry>(HERO_CAMPAIGNS[0]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  // One Search Box session_token per typing session (never rendered, so the
  // server/client UUIDs differing is harmless — no hydration surface).
  const [session] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timeout hygiene only — fetches/setState live in the change handler below
  // (react-hooks/set-state-in-effect is a hard error in this repo).
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Debounced /suggest per keystroke (300ms, ≥3 chars; a bare ZIP needs no
  // suggestions — it IS the scope). Empty-tolerant end to end.
  const onQueryChange = (value: string) => {
    setQuery(value);
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

  const go = (filled: string, zip: string | null) => {
    window.location.href = heroDestination(chip, { filled, zip });
  };

  const pick = async (s: AddressSuggestion) => {
    setBusy(true);
    setSuggestions([]);
    try {
      const res = await fetch(
        `/api/address-retrieve?id=${encodeURIComponent(s.mapboxId)}&session=${session}`,
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
    go(q, null); // free text: the recipe carries it verbatim (no error states)
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
            onChange={(e) => onQueryChange(e.target.value)}
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
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => void pick(s)}
                >
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
