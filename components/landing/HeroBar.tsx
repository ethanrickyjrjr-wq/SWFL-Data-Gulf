// components/landing/HeroBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_CAMPAIGNS, type HeroCampaignEntry } from "@/lib/campaigns";
import { heroBarAction, homeAskInput, type HeroBarMode } from "@/lib/landing/hero-bar-action";
import { useConverse } from "@/lib/assistant/use-converse";
import { HeroAskPanel } from "./HeroAskPanel";
import type { AddressSuggestion } from "@/lib/geo/search-box";

/**
 * THE homepage input (spec 2026-07-12-homepage-one-bar): one bar, three
 * labeled modes, every mode wired to an existing tool — the lab, the /r
 * report routes, or the shared assistant engine (inline). Absorbs
 * HeroCampaign's autocomplete + lab-entry logic verbatim; HeroCampaign is
 * deleted in the same build. The word "AI" stays out of all copy here
 * (carried rule from the agent-first spec).
 */

const MODES: { key: HeroBarMode; tab: string; button: string; gets: string }[] = [
  {
    key: "campaign",
    tab: "Campaign",
    button: "Build it",
    gets: "A ready-to-send email + social campaign, built from live figures.",
  },
  {
    key: "report",
    tab: "Market Report",
    button: "Open the report",
    gets: "Every dataset we hold for that place — cited and dated.",
  },
  {
    key: "ask",
    tab: "Ask the Data",
    button: "Ask",
    gets: "A cited answer from live data, right here.",
  },
];

export default function HeroBar() {
  const [mode, setMode] = useState<HeroBarMode>("campaign");
  const [chip, setChip] = useState<HeroCampaignEntry>(HERO_CAMPAIGNS[0]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const { ask, answer, streaming, error, reset } = useConverse();
  // One Search Box session_token per typing session (never rendered — the
  // server/client UUIDs differing is harmless, no hydration surface).
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

  const active = MODES.find((m) => m.key === mode) ?? MODES[0];

  const placeholder =
    mode === "campaign"
      ? chip.input === "address"
        ? "Type your next listing’s address…"
        : "Type a city or ZIP…"
      : mode === "report"
        ? "ZIP, city, or neighborhood…"
        : "Ask anything about the Southwest Florida market…";

  const switchMode = (next: HeroBarMode) => {
    setMode(next);
    setSuggestions([]);
    if (next !== "ask") {
      setAskedQuestion(null);
      reset();
    }
  };

  // Debounced /suggest per keystroke — campaign mode only (a report/ask entry
  // needs no address resolution; /r/search and the engine handle free text).
  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (mode !== "campaign" || q.length < 3 || /^\d{5}$/.test(q)) {
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

  const navigate = (raw: string) => {
    const action = heroBarAction(mode, raw, chip);
    if (action.kind === "navigate") window.location.href = action.href;
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
        navigate(json.name);
        return;
      }
    } catch {
      /* fall through to the suggestion's own text */
    }
    navigate(`${s.name}${s.placeFormatted ? `, ${s.placeFormatted}` : ""}`);
  };

  const submit = () => {
    const q = query.trim();
    if (!q || busy) return;
    if (mode === "campaign" && suggestions.length > 0) {
      void pick(suggestions[0]); // Enter = top suggestion, the standard pattern
      return;
    }
    const action = heroBarAction(mode, q, chip);
    if (action.kind === "ask") {
      setAskedQuestion(action.question);
      void ask(homeAskInput(action.question));
      return;
    }
    if (action.kind === "navigate") window.location.href = action.href;
  };

  return (
    <div className="hero">
      <h1>
        Type a place.
        <br />
        <em>Get the campaign, the report, or the answer.</em>
      </h1>
      <p className="hero-sub">
        Built from live Southwest Florida data — every number names its source. Pick what comes out:
      </p>
      <div className="hero-mode-row" role="tablist" aria-label="What we build for you">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            className={`filter-pill hero-mode-tab${mode === m.key ? " active" : ""}`}
            onClick={() => switchMode(m.key)}
          >
            {m.tab}
          </button>
        ))}
      </div>
      {mode === "campaign" && (
        <div className="hero-chip-row" role="group" aria-label="Campaign type">
          {HERO_CAMPAIGNS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={chip.key === c.key}
              className={`filter-pill${chip.key === c.key ? " active" : ""}`}
              onClick={() => setChip(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="search-wrap hero-addr-wrap">
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button className="search-btn" type="button" disabled={busy} onClick={submit}>
            {busy ? "Building…" : active.button}
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
      <p className="hero-gets">{active.gets}</p>
      {mode === "ask" && (
        <HeroAskPanel
          question={askedQuestion}
          answer={answer}
          streaming={streaming}
          error={error}
        />
      )}
      <p className="hero-note">Free to build — no credit card. Fewer, better sends.</p>
    </div>
  );
}
