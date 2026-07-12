# Homepage One-Bar Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 14 files, keywords: architecture

**Goal:** Replace the homepage's three-inputs-plus-one-fake-bar collage with ONE bar in three labeled modes (Campaign / Market Report / Ask the Data), delete the demo theater, restore the Guides card strip, and make the stats-bar figures tappable facts.

**Architecture:** A pure router (`heroBarAction`) decides what each mode does with the typed text; a new `HeroBar` client component owns the single input + mode tabs and absorbs HeroCampaign's autocomplete/lab-entry logic verbatim; Ask mode streams inline through the EXISTING `useConverse` → `/api/assistant` engine (no new endpoint); the map section loses its own search input and gains FactChips on its stats bar via the existing highlighter context.

**Tech Stack:** Next.js App Router, React 19, bun:test (+ `renderToStaticMarkup` for component markup tests), existing libs only: `lib/campaigns`, `lib/lab-entry/destination`, `lib/assistant/{use-converse,converse}`, `components/highlighter/FactChip`, `components/answer/AnswerText`.

**Spec:** `docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md`

## Global Constraints

- **One system, not fifty (operator, 07/12/2026):** every control wires to an existing tool. No new endpoints, no new engines, no decorative controls.
- The word "AI" never appears in hero copy (carried rule). Mode label is "Ask the Data".
- Coverage wording (locked 07/07/2026): "We cover Lee and Collier County in depth — and fill wider Southwest Florida asks from named sources." Never claim six counties. Never frame the product as "ZIP-level".
- Layout: `h-full`/`dvh`, never `h-screen`.
- Every commit: explicit paths only (`git add <paths>` — the index is shared with parallel sessions). NEVER `git add -A`. NEVER push — the operator pushes.
- Deno-style imports do NOT apply here (this is the Next app, not `supabase/functions`).
- Run tests with `bun test <path>`. Verify the whole build with `bunx next build` (never `npx tsc`).
- `react-hooks/set-state-in-effect` is a hard ESLint error: never call a state setter (or a hook's `ask`/`reset`) from an effect — event handlers only.
- Prettier runs on commit; if a diff looks bigger than your edit, check `git diff -w` before panicking.

---

### Task 1: Pure mode router — `heroBarAction` + `homeAskInput`

**Files:**
- Create: `lib/landing/hero-bar-action.ts`
- Test: `lib/landing/hero-bar-action.test.ts`

**Interfaces:**
- Consumes: `heroDestination(entry, {filled})` and `openZipLab(zip)` from `@/lib/lab-entry/destination`; `HeroCampaignEntry` from `@/lib/campaigns`; `ConverseInput` + `streamConverse` from `@/lib/assistant/converse` (test only).
- Produces (Tasks 3 uses these exact names):
  - `type HeroBarMode = "campaign" | "report" | "ask"`
  - `type HeroBarAction = { kind: "navigate"; href: string } | { kind: "ask"; question: string } | { kind: "none" }`
  - `heroBarAction(mode: HeroBarMode, raw: string, campaign: HeroCampaignEntry): HeroBarAction`
  - `homeAskInput(question: string): ConverseInput`

- [ ] **Step 1: Write the failing test**

```ts
// lib/landing/hero-bar-action.test.ts
import { describe, expect, test } from "bun:test";
import { heroBarAction, homeAskInput } from "./hero-bar-action";
import { HERO_CAMPAIGNS } from "@/lib/campaigns";
import { streamConverse } from "@/lib/assistant/converse";

const newListing = HERO_CAMPAIGNS[0]; // input: "address"

describe("heroBarAction", () => {
  test("empty input is a no-op in every mode", () => {
    expect(heroBarAction("campaign", "  ", newListing)).toEqual({ kind: "none" });
    expect(heroBarAction("report", "", newListing)).toEqual({ kind: "none" });
    expect(heroBarAction("ask", "   ", newListing)).toEqual({ kind: "none" });
  });

  test("campaign: bare ZIP routes through the existing ZIP lab door", () => {
    expect(heroBarAction("campaign", "33901", newListing)).toEqual({
      kind: "navigate",
      href: "/email-lab?zip=33901",
    });
  });

  test("campaign: an address goes to the grid lab with the recipe filled", () => {
    const action = heroBarAction("campaign", "123 Main St, Fort Myers", newListing);
    if (action.kind !== "navigate") throw new Error("expected navigate");
    expect(action.href.startsWith("/email-lab/grid?")).toBe(true);
    expect(action.href).toContain("addr=123+Main+St%2C+Fort+Myers");
  });

  test("report: bare ZIP is the one-ZIP-truth report route", () => {
    expect(heroBarAction("report", "33931", newListing)).toEqual({
      kind: "navigate",
      href: "/r/zip-report/33931",
    });
  });

  test("report: anything else goes to /r/search", () => {
    expect(heroBarAction("report", "Bonita Springs", newListing)).toEqual({
      kind: "navigate",
      href: "/r/search?q=Bonita%20Springs",
    });
  });

  test("ask: returns the question for inline streaming, no navigation", () => {
    expect(heroBarAction("ask", "Is Naples inventory rising?", newListing)).toEqual({
      kind: "ask",
      question: "Is Naples inventory rising?",
    });
  });
});

describe("homeAskInput", () => {
  test("carries the question and NOTHING that grounds to a report", () => {
    const input = homeAskInput("what moved this week?");
    expect(input.question).toBe("what moved this week?");
    expect("reportId" in input).toBe(false);
  });

  test("streamConverse posts it to /api/assistant with report_id undefined", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      // Minimal SSE-shaped empty stream: converse treats a clean end as done.
      return new Response(new Blob([""]).stream(), { status: 200 });
    }) as typeof fetch;
    await streamConverse(homeAskInput("hello"), { onText: () => {}, onError: () => {} }, fakeFetch);
    if (!captured) throw new Error("fetch never called");
    expect(captured.url).toBe("/api/assistant");
    expect(captured.body.report_id).toBeUndefined();
    expect(captured.body.context).toBe("outside");
    expect(captured.body.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/landing/hero-bar-action.test.ts`
Expected: FAIL — `Cannot find module './hero-bar-action'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/landing/hero-bar-action.ts
//
// The ONE homepage input's pure router (spec 2026-07-12-homepage-one-bar).
// Three modes, three existing destinations — no new engines:
//   campaign → the lab doors (heroDestination / openZipLab, unchanged semantics)
//   report   → /r/zip-report/<zip> (one-ZIP truth) or /r/search?q= (any place)
//   ask      → inline stream via the existing /api/assistant engine (no navigation)
// Free text never errors: it is carried to the destination as-is.

import { heroDestination, openZipLab } from "@/lib/lab-entry/destination";
import type { HeroCampaignEntry } from "@/lib/campaigns";
import type { ConverseInput } from "@/lib/assistant/converse";

export type HeroBarMode = "campaign" | "report" | "ask";

export type HeroBarAction =
  | { kind: "navigate"; href: string }
  | { kind: "ask"; question: string }
  | { kind: "none" };

const BARE_ZIP = /^\d{5}$/;

export function heroBarAction(
  mode: HeroBarMode,
  raw: string,
  campaign: HeroCampaignEntry,
): HeroBarAction {
  const q = raw.trim();
  if (!q) return { kind: "none" };
  switch (mode) {
    case "campaign":
      // A typed bare ZIP means "a campaign about this ZIP" — the existing lab
      // door for that (the only path that makes the email ZIP-scoped).
      return BARE_ZIP.test(q)
        ? { kind: "navigate", href: openZipLab(q) }
        : { kind: "navigate", href: heroDestination(campaign, { filled: q }) };
    case "report":
      return BARE_ZIP.test(q)
        ? { kind: "navigate", href: `/r/zip-report/${q}` }
        : { kind: "navigate", href: `/r/search?q=${encodeURIComponent(q)}` };
    case "ask":
      return { kind: "ask", question: q };
  }
}

/** Ask-mode input for the shared assistant engine: question only — NO reportId,
 *  so the engine takes its grounded off-report conversation path. */
export function homeAskInput(question: string): ConverseInput {
  return { question };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/landing/hero-bar-action.test.ts`
Expected: PASS (8 tests). If the `streamConverse` test fails on the empty-stream stub, check `lib/assistant/converse.test.ts` for how its stubs shape the Response body and mirror that exactly — the assertion that matters is the captured request body.

- [ ] **Step 5: Commit**

```bash
git add lib/landing/hero-bar-action.ts lib/landing/hero-bar-action.test.ts
git commit -m "feat(homepage): heroBarAction pure router — 3 modes, existing destinations only"
```

---

### Task 2: `HeroAskPanel` — presentational inline-answer panel

**Files:**
- Create: `components/landing/HeroAskPanel.tsx`
- Test: `components/landing/HeroAskPanel.test.tsx`

**Interfaces:**
- Consumes: `AnswerText` from `@/components/answer/AnswerText` (`{ text: string }` — renders null on empty).
- Produces (Task 3 renders this): `HeroAskPanel({ question, answer, streaming, error }: { question: string | null; answer: string; streaming: boolean; error: string | null })` — renders `null` until a question exists.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/HeroAskPanel.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HeroAskPanel } from "./HeroAskPanel";

describe("HeroAskPanel", () => {
  it("renders nothing before a question is asked", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, { question: null, answer: "", streaming: false, error: null }),
    );
    expect(html).toBe("");
  });

  it("shows a working state while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "Is Naples inventory rising?",
        answer: "",
        streaming: true,
        error: null,
      }),
    );
    expect(html).toContain("Reading the live data");
  });

  it("renders the streamed answer and a keep-going link to /ask", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "Is Naples inventory rising?",
        answer: "Inventory in Naples rose to 4,100 active listings.",
        streaming: false,
        error: null,
      }),
    );
    expect(html).toContain("Inventory in Naples rose");
    expect(html).toContain("/ask?q=Is%20Naples%20inventory%20rising%3F");
    expect(html).toContain("Keep going");
  });

  it("fails toward a working page: error still offers the /ask door", () => {
    const html = renderToStaticMarkup(
      createElement(HeroAskPanel, {
        question: "hello",
        answer: "",
        streaming: false,
        error: "Something went wrong.",
      }),
    );
    expect(html).toContain("Something went wrong.");
    expect(html).toContain("/ask?q=hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test components/landing/HeroAskPanel.test.tsx`
Expected: FAIL — `Cannot find module './HeroAskPanel'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/HeroAskPanel.tsx
"use client";

import { AnswerText } from "@/components/answer/AnswerText";

/**
 * Ask-mode's inline result, directly under the hero bar (spec 2026-07-12).
 * Purely presentational — HeroBar owns the useConverse hook and feeds this
 * panel, so the streaming logic stays in the ONE shared engine wrapper and
 * this stays trivially testable. Never a dead end: streaming, answered, and
 * error states all keep the /ask door visible or one line away.
 */
export function HeroAskPanel({
  question,
  answer,
  streaming,
  error,
}: {
  question: string | null;
  answer: string;
  streaming: boolean;
  error: string | null;
}) {
  if (!question) return null;
  const askHref = `/ask?q=${encodeURIComponent(question)}`;
  return (
    <div className="hero-ask-panel" role="status" aria-live="polite">
      {streaming && !answer && <p className="hero-ask-working">Reading the live data…</p>}
      {answer && (
        <p className="hero-ask-answer">
          <AnswerText text={answer} />
        </p>
      )}
      {error && !streaming && <p className="hero-ask-error">{error}</p>}
      {!streaming && (answer || error) && (
        <a className="hero-ask-more" href={askHref}>
          Keep going →
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test components/landing/HeroAskPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the panel's CSS to `components/landing/home-explorer.css`** (append at the end of the hero block, near the existing `.hero-suggest` rules):

```css
.home-explorer .hero-ask-panel {margin-top:14px;text-align:left;background:var(--gulf-slate);border:1px solid var(--gulf-slate-hi);border-radius:10px;padding:16px 18px}
.home-explorer .hero-ask-working {color:var(--text-tertiary);font-size:14px}
.home-explorer .hero-ask-answer {color:var(--text-primary);font-size:15px;line-height:1.6}
.home-explorer .hero-ask-error {color:var(--text-tertiary);font-size:14px}
.home-explorer .hero-ask-more {display:inline-block;margin-top:10px;color:var(--gulf-teal);font-size:14px}
```

- [ ] **Step 6: Commit**

```bash
git add components/landing/HeroAskPanel.tsx components/landing/HeroAskPanel.test.tsx components/landing/home-explorer.css
git commit -m "feat(homepage): HeroAskPanel — inline cited answer under the bar, never a dead end"
```

---

### Task 3: `HeroBar` — the one input, three modes

**Files:**
- Create: `components/landing/HeroBar.tsx`
- Test: `components/landing/HeroBar.test.tsx`

**Interfaces:**
- Consumes: `heroBarAction`, `homeAskInput`, `HeroBarMode` (Task 1); `HeroAskPanel` (Task 2); `HERO_CAMPAIGNS`, `HeroCampaignEntry` from `@/lib/campaigns`; `useConverse` from `@/lib/assistant/use-converse`; `AddressSuggestion` from `@/lib/geo/search-box`; existing CSS classes `.hero`, `.hero-chip-row`, `.filter-pill`, `.search-wrap`, `.search-bar`, `.search-input`, `.search-btn`, `.hero-suggest`.
- Produces (Task 4 imports this): `export default function HeroBar()` — self-contained, no props.

Autocomplete behavior is ported from `components/landing/HeroCampaign.tsx` UNCHANGED: 300ms debounce, ≥3 chars, bare-ZIP skips suggestions, one Search Box session token per typing session, pick → `/api/address-retrieve` → navigate, Enter = top suggestion. Suggestions fetch ONLY in campaign mode.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/HeroBar.test.tsx
//
// Markup pins for the one-bar hero. renderToStaticMarkup = initial render only
// (no effects, no interaction), which is exactly what these pins need:
// the ONE-INPUT invariant and the default-mode surface.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import HeroBar from "./HeroBar";

describe("HeroBar", () => {
  const html = renderToStaticMarkup(createElement(HeroBar));

  it("renders EXACTLY ONE text input — the page-level invariant", () => {
    expect(html.split("<input").length - 1).toBe(1);
  });

  it("renders the three mode tabs with Campaign selected by default", () => {
    expect(html).toContain(">Campaign<");
    expect(html).toContain(">Market Report<");
    expect(html).toContain(">Ask the Data<");
    // aria-selected pins the NN/g one-selected-by-default rule.
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
  });

  it("default mode is Campaign: address placeholder, Build it button, campaign chips", () => {
    expect(html).toContain("Type your next listing");
    expect(html).toContain("Build it");
    expect(html).toContain("New Listing");
    expect(html).toContain("Market Update");
  });

  it("headline passes the descriptive litmus and never says AI", () => {
    expect(html).toContain("Type a place.");
    expect(html.toLowerCase()).not.toContain(">ai<");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test components/landing/HeroBar.test.tsx`
Expected: FAIL — `Cannot find module './HeroBar'`

- [ ] **Step 3: Write the implementation**

```tsx
// components/landing/HeroBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_CAMPAIGNS, type HeroCampaignEntry } from "@/lib/campaigns";
import {
  heroBarAction,
  homeAskInput,
  type HeroBarMode,
} from "@/lib/landing/hero-bar-action";
import { useConverse } from "@/lib/assistant/use-converse";
import { HeroAskPanel } from "./HeroAskPanel";
import type { AddressSuggestion } from "@/lib/geo/search-box";

/**
 * THE homepage input (spec 2026-07-12-homepage-one-bar): one bar, three
 * labeled modes, every mode wired to an existing tool — the lab, the /r report
 * routes, or the shared assistant engine (inline). Absorbs HeroCampaign's
 * autocomplete + lab-entry logic verbatim; HeroCampaign is deleted in the
 * same build. The word "AI" stays out of all copy here (carried rule).
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
        Built from live Southwest Florida data — every number names its source. Pick what comes
        out:
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
```

**NOTE:** copy the code block exactly as written — plain ASCII comments only.

- [ ] **Step 4: Add the two new CSS hooks** to `components/landing/home-explorer.css` (append near the existing `.hero-chip-row` rule):

```css
.home-explorer .hero-mode-row {display:flex;justify-content:center;gap:8px;margin:18px 0 10px}
.home-explorer .hero-mode-tab.active {border-color:var(--gulf-teal);color:var(--gulf-teal)}
.home-explorer .hero-gets {margin-top:10px;color:var(--text-tertiary);font-size:13px}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test components/landing/HeroBar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add components/landing/HeroBar.tsx components/landing/HeroBar.test.tsx components/landing/home-explorer.css
git commit -m "feat(homepage): HeroBar — one input, three labeled modes, ask streams inline"
```

---

### Task 4: Page spine swap + metadata + spine pin test

**Files:**
- Modify: `app/page.tsx` (full replacement below)
- Modify: `components/landing/SiteDoors.tsx` (remove the Guides door)
- Test: `lib/landing/home-spine.static.test.ts`

**Interfaces:**
- Consumes: `HeroBar` (Task 3), existing `Hero`, `SiteDoors`, `GuidesStrip`, `PricingStrip`, `ObjectionFaq`, `loadHomeMapData`, `EMAIL_LAB_LANDING`.
- Produces: the final page spine — hero → map → doors → guides → pricing → FAQ → CTA.

- [ ] **Step 1: Write the failing static test**

```ts
// lib/landing/home-spine.static.test.ts
//
// Source-level pins for the one-bar homepage (spec 2026-07-12). The one-input
// invariant is compositional: HeroBar renders exactly one <input> (its own
// render test), Hero contains none (pinned here), and the page imports no
// other input-bearing component (pinned here). This is the regression that
// caused the rebuild — it must not return silently.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("homepage spine (static pins)", () => {
  const page = read("app/page.tsx");

  test("the demo theater is gone", () => {
    expect(page).not.toContain("CampaignReveal");
    expect(page).not.toContain("buildCampaignDemo");
    expect(page).not.toContain("HeroCampaign");
  });

  test("no second input-bearing component is imported", () => {
    expect(page).not.toContain("WeeklyReadCapture");
    expect(page).not.toContain("Waitlist");
  });

  test("the spine is bar → map → doors → guides → pricing → faq", () => {
    const order = ["<HeroBar", "<Hero ", "<SiteDoors", "<GuidesStrip", "<PricingStrip", "<ObjectionFaq"]
      .map((tag) => page.indexOf(tag));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the map section has no input of its own", () => {
    const hero = read("components/landing/Hero.tsx");
    expect(hero).not.toContain("<input");
    expect(hero).not.toContain("search-bar");
  });

  test("doors are Desk + Insiders only — Guides is a full section now", () => {
    const doors = read("components/landing/SiteDoors.tsx");
    expect(doors).toContain("/desk");
    expect(doors).toContain("/insiders");
    expect(doors).not.toContain("/guides");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/landing/home-spine.static.test.ts`
Expected: FAIL — page still imports HeroCampaign/CampaignReveal; Hero still contains `<input`. (The Hero pin stays red until Task 5 — that is fine; run only this file, expect exactly the "map section" + "demo theater" + "spine" tests failing, doors test failing.)

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
import type { Metadata } from "next";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import HeroBar from "@/components/landing/HeroBar";
import Hero from "@/components/landing/Hero";
import SiteDoors from "@/components/landing/SiteDoors";
import GuidesStrip from "@/components/landing/GuidesStrip";
import PricingStrip from "@/components/landing/PricingStrip";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Campaigns, market reports, and answers from live SWFL data",
  description:
    "Type a place. Get a ready-to-send listing campaign, the full market report, or a cited answer — built from live Southwest Florida data, every number named to its source. Free to build, no credit card.",
};

// One-bar spine (spec docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md,
// operator-approved 07/12/2026): ONE input on the whole page (HeroBar — three
// labeled modes wired to existing tools), the map as the trust section (its own
// search bar deleted), two doors, the Guides cards restored. No demos, no
// decorative controls — every element works or is honestly a link.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();

  return (
    <main className="home-explorer relative">
      <HeroBar />
      <Hero payload={payload} />
      <SiteDoors />
      <GuidesStrip />
      <PricingStrip />
      <ObjectionFaq />
      <section className="final-cta">
        <h2 className="final-cta-headline">Every number sourced. Every send automatic.</h2>
        <div className="cap-cta-row">
          <a className="cap-btn" href={EMAIL_LAB_LANDING}>
            Build one free
          </a>
          <p>
            or{" "}
            <a className="final-cta-ask" href="/ask">
              ask the data a question
            </a>{" "}
            — no account needed.
          </p>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Remove the Guides door from `components/landing/SiteDoors.tsx`** — delete the third `DOORS` entry (`href: "/guides"`) and update the component doc comment's "Three quiet doors" to "Two quiet doors". Nothing else changes.

- [ ] **Step 5: Run the static test again**

Run: `bun test lib/landing/home-spine.static.test.ts`
Expected: all tests PASS except "the map section has no input of its own" (Task 5 fixes it). If the spine-order test fails on `<Hero ` matching `<HeroBar`, note both appear — the test searches `"<Hero "` (trailing space) precisely to avoid that; keep the space.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/landing/SiteDoors.tsx lib/landing/home-spine.static.test.ts
git commit -m "feat(homepage): one-bar spine — HeroBar in, demo theater out, GuidesStrip restored"
```

---

### Task 5: Map section surgery — delete its search bar

**Files:**
- 🔴 Modify: `components/landing/Hero.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: `Hero` with zero inputs; everything else (badge, heading, filter pills, rail, canvas, legend, stats bar) byte-identical.

- [ ] **Step 1: Remove the search input from `components/landing/Hero.tsx`:**
  1. Delete the `searchRef` declaration (`const searchRef = useRef<HTMLInputElement>(null);`, line ~59).
  2. Delete the whole `submitSearch` function (lines ~241–246).
  3. Delete the `<div className="search-wrap">…</div>` JSX block inside `map-intro` (lines ~262–291 — the block containing the svg icon, the input, and the Search button).
  4. Update `map-sub` copy to point at the one bar: replace the existing sentence with: `Live Southwest Florida market signals, cited to the source. Click any ZIP — map or list — for its full report. Looking for somewhere specific? Use the bar above.`
  5. If `useRef` is now unused in the imports, remove it from the import list (check — the component has other refs: `tipRef`, `canvasRef`, `svgHostRef`; `useRef` stays).

- [ ] **Step 2: Run the static test to verify the pin flips green**

Run: `bun test lib/landing/home-spine.static.test.ts`
Expected: ALL tests PASS now, including "the map section has no input of its own".

- [ ] **Step 3: Commit**

```bash
git add components/landing/Hero.tsx
git commit -m "feat(homepage): map trust section loses its own search bar — the hero bar is the one input"
```

---

### Task 6: Tappable stats-bar figures (existing FactChip seam)

**Files:**
- 🔴 Modify: `components/landing/Hero.tsx` (stats bar only)
- Modify: `docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md` (one deviation note)
- Test: extend `lib/landing/home-spine.static.test.ts`

**Interfaces:**
- Consumes: `FactChip` from `@/components/highlighter/FactChip` (`{ value, factType, context?, slug?, onActivate }`); `classifyFact` from `@/lib/highlighter/use-highlight`; `useHighlighterContext` from `@/lib/highlighter/context` (nullable — provider may be absent; `ctx.onActivate` is the popup opener, same seam `app/r/_components/metrics-table.tsx:146-159` uses).

**Discovered constraint (spec deviation):** the rail's Top-ZIP values sit INSIDE `<button className="rail-top-row">` elements that already open the ZIP's report — nesting FactChip (a `<button>`) inside them is invalid HTML and a click conflict. So chips go on the STATS BAR figures only; rail rows keep their existing (working) click-through. Record this in the spec.

- [ ] **Step 1: Extend the static test** — add to `lib/landing/home-spine.static.test.ts`:

```ts
  test("stats-bar figures are tappable facts (FactChip seam, not a new system)", () => {
    const hero = read("components/landing/Hero.tsx");
    expect(hero).toContain("FactChip");
    expect(hero).toContain("useHighlighterContext");
    // Rail rows must NOT get chips — they are already buttons (nested-button hazard).
    expect(hero.slice(hero.indexOf("rail-top-list"), hero.indexOf("rail-footer"))).not.toContain(
      "FactChip",
    );
  });
```

Run: `bun test lib/landing/home-spine.static.test.ts` — expected: the new test FAILS (Hero has no FactChip yet).

- [ ] **Step 2: Wire the chips in `components/landing/Hero.tsx`:**
  1. Add imports:

```tsx
import { FactChip } from "@/components/highlighter/FactChip";
import { classifyFact } from "@/lib/highlighter/use-highlight";
import { useHighlighterContext } from "@/lib/highlighter/context";
```

  2. Inside the component, next to the other hooks: `const hctx = useHighlighterContext();`
  3. Replace the stats-bar value line (`<div className="stat-value">{s.value}</div>`) with:

```tsx
                <div className="stat-value">
                  {hctx ? (
                    <FactChip
                      value={s.value}
                      factType={classifyFact(s.value)}
                      context={`${s.label} — ${s.sub}`}
                      onActivate={hctx.onActivate}
                    />
                  ) : (
                    s.value
                  )}
                </div>
```

  4. Under the stats bar (inside the same `{stats.length > 0 && (...)}` block, after the mapped cells), add the one static caption from the spec:

```tsx
            <p className="stats-hint">
              Tap any figure — or select any sentence on this page — to ask about it.
            </p>
```

  5. Append the caption CSS to `components/landing/home-explorer.css`:

```css
.home-explorer .stats-hint {grid-column:1/-1;margin-top:6px;color:var(--text-tertiary);font-size:12px;text-align:center}
```

- [ ] **Step 3: Run the tests**

Run: `bun test lib/landing/home-spine.static.test.ts`
Expected: ALL PASS (including the new chip test and the still-green no-input pin — FactChip is a `<button>`, not an `<input>`).

- [ ] **Step 4: Append the deviation note to the spec** — in `docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md`, under "Live figures", add:

```markdown
**Implementation deviation (07/12/2026):** rail Top-ZIP values are inside
`<button class="rail-top-row">` rows that already open the ZIP report — nesting a
FactChip button there is invalid HTML and a click conflict. Chips therefore ride the
stats-bar figures only; the rail rows keep their existing click-through. The caption
covers both affordances.
```

- [ ] **Step 5: Commit**

```bash
git add components/landing/Hero.tsx components/landing/home-explorer.css lib/landing/home-spine.static.test.ts docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md
git commit -m "feat(homepage): stats-bar figures are tappable facts via the existing chip seam"
```

---

### Task 7: Delete the theater — CampaignReveal, campaign-demo, HeroCampaign, dead CSS

**Files:**
- Delete: `components/landing/CampaignReveal.tsx`, `components/landing/HeroCampaign.tsx`, `lib/landing/campaign-demo.ts`, `lib/landing/campaign-demo.test.ts`
- Modify: `components/landing/home-explorer.css` (remove all `.cr-*` rules)
- Test: extend `lib/landing/home-spine.static.test.ts`

- [ ] **Step 1: Extend the static test** — add:

```ts
  test("the deleted theater stays deleted", () => {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    for (const gone of [
      "components/landing/CampaignReveal.tsx",
      "components/landing/HeroCampaign.tsx",
      "lib/landing/campaign-demo.ts",
    ]) {
      expect(existsSync(join(process.cwd(), gone))).toBe(false);
    }
    expect(read("components/landing/home-explorer.css")).not.toContain(".cr-");
  });
```

Run: `bun test lib/landing/home-spine.static.test.ts` — expected: new test FAILS.

- [ ] **Step 2: Check for remaining references before deleting**

Run: `grep -rn "CampaignReveal\|campaign-demo\|HeroCampaign" app lib components --include="*.ts*" | grep -v home-spine.static.test`
Expected: ZERO hits (Task 4 removed the page imports). If anything else still imports them, fix that caller first — do not delete under it.

- [ ] **Step 3: Delete the files and the `.cr-*` CSS rules**

```bash
git rm components/landing/CampaignReveal.tsx components/landing/HeroCampaign.tsx lib/landing/campaign-demo.ts lib/landing/campaign-demo.test.ts
```

Then remove every rule whose selector starts with `.home-explorer .cr-` from `components/landing/home-explorer.css` (verify with `grep -c "\.cr-" components/landing/home-explorer.css` → `0`).

- [ ] **Step 4: Run the FULL landing test set + the vocab/pack-free gate check**

Run: `bun test lib/landing components/landing lib/lab-entry`
Expected: ALL PASS. (`lib/lab-entry/destination.static.test.ts` pins the lab doors — it must stay green; HeroBar routes through the same sanctioned exports.) No packs/vocab touched anywhere in this build → pre-push Gates 2/5 are not triggered.

- [ ] **Step 5: Commit**

```bash
git add components/landing/home-explorer.css lib/landing/home-spine.static.test.ts
git commit -m "feat(homepage): delete the demo theater — CampaignReveal, campaign-demo, HeroCampaign, dead CSS"
```

(`git rm` already staged the deletions.)

---

### Task 8: Build gate + live verify + handoff

**Files:**
- Modify: `SESSION_LOG.md` (entry before any push — operator pushes)

- [ ] **Step 1: Full production build**

Run: `bunx next build`
Expected: compiles clean, `/` in the route list. Type errors here are real — fix them, never bypass.

- [ ] **Step 2: Drive the real build with the verify skill** — invoke the project's `/verify` skill (build, serve on a clean port, fingerprint `/`, screenshot desktop + mobile). Confirm with your own eyes in the screenshot: ONE bar, three tabs, no campaign-reveal section, guides cards present, map has no search input, stats figures show the dotted tap affordance.

- [ ] **Step 3: Ask-mode smoke on the served build** — on the served page, switch to Ask the Data, submit "Is inventory rising in Naples?" and confirm an answer streams inline (the dev/prod server serves `/api/assistant` locally). If the local env lacks assistant credentials, note it plainly in the SESSION_LOG entry and flag the live check instead — never claim the smoke passed if it didn't run.

- [ ] **Step 4: SESSION_LOG entry + hand to operator** — append the entry (what shipped, test counts, screenshots taken, the `homepage_one_bar_live_verify` check stays OPEN until verified on production after the operator pushes). Show the operator `git log --oneline` for the task commits and hand over the push decision. Do NOT push. After the operator pushes and the page is live, close the check with `node scripts/check.mjs close homepage_one_bar_live_verify` only on the live-bytes signal.

---

## Self-Review (done at write time)

- **Spec coverage:** hero 3 modes (T1/T3) · inline Ask via existing engine (T1/T2/T3) · map bar deleted (T5) · tappable figures (T6, with recorded deviation) · GuidesStrip + 2 doors (T4) · deletions (T7) · one-input pin (T3 render test + T4/T5 static pins) · metadata/copy rules (T3/T4) · gates + live verify (T8). Gap: none found.
- **Placeholder scan:** clean — every code step carries the full code; the one intentional flag is the unicode-comment note in T3.
- **Type consistency:** `HeroBarMode`/`HeroBarAction`/`homeAskInput` names match across T1→T3; `HeroAskPanel` props match T2→T3; `FactChip` props match its real signature (`value/factType/context/slug?/onActivate`).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 6 | `components/landing/Hero.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
