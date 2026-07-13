# Handoff → Side Sonnet: Freshness UI / CSS / Legal layer

**Date:** 2026-06-14 · **From:** Main Claude (Opus, "plumbing") · **To:** Side Sonnet ("UI/CSS/Legal")
**Parent plan:** `docs/superpowers/plans/2026-06-14-weekly-pulse-freshness-bridge.md` (now superseded by
the lean read-through approach below — read THIS doc for current scope).

---

## What we're building (corrected, lean architecture)

`/charts` shows Zillow ZHVI lines that lag to **Apr 2026**. We already ingest fresher Redfin data —
`data_lake.redfin_lee_market` / `redfin_collier_market`, **current to May 31 2026** (Lee
$360,000 / Collier $625,000, `property_type='All Residential'`). So:

- **Pulse = read-through.** Main Claude reads the existing Redfin tables and emits a dashed "Weekly
  Pulse" point past the last ZHVI month. **No new table, no downloader, no price cron.**
- **Mortgage context.** Latest FRED `MORTGAGE30US` shown as a header stat ("30-yr Fixed: 6.8% (as of
  Jun 12, 2026)"). Main Claude owns the data source.
- **"Update to Today" button.** Visual-only for v1; it POSTs to a stub `/api/probe`. The real
  search+LLM probe is **MOAT-gated and NOT wired in v1** (see "MOAT guardrails").
- **Freshness everywhere.** A shared `FreshnessBadge` with a real dynamic "as of" on every chart.
- **Legal layer.** `/terms` + `/privacy`, a global micro-footer line, and an institutional report
  end-cap (because users can trigger "live" data, the disclaimer is now mandatory).

---

## Split of work — ZERO overlapping files

### SONNET owns (UI / CSS / Legal) — all NEW files except two edits
| File | Action |
|---|---|
| `components/FreshnessBadge.tsx` | **NEW** shared badge (generalize the welcome one). Props below. Includes the "Update to Today" pill. |
| `components/charts/MortgageRateStat.tsx` | **NEW** tiny presentational stat. Props below. |
| `components/reports/ReportEndCap.tsx` | **NEW** Colliers-style report footer. |
| `app/terms/page.tsx` | **NEW** full disclaimer (legal source of truth). |
| `app/privacy/page.tsx` | **NEW** privacy page. |
| `components/landing/Footer.tsx` | **EDIT** add the one micro-footer line. |
| `app/r/zip-report/[zip]/page.tsx` | **EDIT** drop `<ReportEndCap/>` at the very bottom only. |
| `app/welcome/_components/FreshnessBadge.tsx` + `AnswerBlock.tsx` | **EDIT** re-point to the shared component (keep behavior identical). |

### MAIN CLAUDE owns (plumbing) — do NOT touch these
`lib/charts/pulse-provider.ts` (new), `lib/charts/fred-provider.ts` (new, or a python fred ingest —
TBD), `app/charts/page.tsx` (edit: data wiring + placing Sonnet's components), `components/charts/
ZHVIAreaChart.tsx` (edit: the dashed pulse series/tooltip/footnote), `app/api/probe/route.ts` (new
stub), the optional `data_lake.live_probes` migration, and `lib/charts/pulse-provider.test.ts`.

**Hard rule:** Sonnet does NOT edit `app/charts/page.tsx` or `ZHVIAreaChart.tsx`. Main Claude imports
and places `FreshnessBadge` + `MortgageRateStat` there. If you think you need to edit a Main-Claude
file, STOP and leave a note in `SESSION_LOG.md` instead.

---

## The contracts (the only coupling between us)

Main Claude produces these; Sonnet's components consume them. Lock these shapes; don't change them
without a note.

```ts
// produced by app/charts/page.tsx (Main Claude), passed to Sonnet's components
export type PulsePoint = {
  chartKey: "cape_coral" | "naples";
  county: "Lee" | "Collier";
  periodEnd: string;        // "2026-05-31"
  medianSalePrice: number;  // 360000
  yoy: number | null;       // -0.021 (fraction)
  sourceName: string;       // "Redfin County Market Tracker"
  sourceUrl: string;        // https://www.redfin.com/news/data-center/
  sourceTag: "vendor";      // future: "live_probe_estimate"
};
export type MarketContext = {
  pulsePoints: PulsePoint[];
  mortgage: { rate: number; asOf: string } | null; // { rate: 6.8, asOf: "2026-06-12" }
  freshnessToken?: string;  // SWFL token if available
};
```

### `components/FreshnessBadge.tsx` (Sonnet authors)
Generalize `app/welcome/_components/FreshnessBadge.tsx` (today it takes `{ token }`, renders a teal
`#0a8078` pill "Data as of {date}" + the token `<code>`). New props — **all serializable** (this is a
`"use client"` component because of the button, but parents pass only strings/booleans):

```ts
export type FreshnessBadgeProps = {
  token?: string;            // SWFL token -> use asOfFromToken() from "@/lib/project/as-of"
  asOf?: string;             // pre-formatted/ISO date when there's no token
  label?: string;            // e.g. "Redfin · May 2026"
  note?: string;             // optional secondary line
  showUpdateButton?: boolean;// renders the "Update to Today" pill (default false)
  probeTarget?: { scope: "county" | "zip"; id: string }; // what the button probes
};
```
- Date formatting: when `token` is present use `asOfFromToken(token)` (returns `"Jun 12, 2026"` or
  null) from `lib/project/as-of.ts`; else show `asOf`/`label`. Keep the existing pill styling +
  teal dot. The welcome usage must keep showing the token verbatim (it's the freshness proof).
- **"Update to Today" pill** (only when `showUpdateButton`): on click, `POST /api/probe` with
  `probeTarget`. v1 endpoint returns `{ status: "not_yet_live", message }` — render that message
  (toast or inline) and keep the pill in a "coming soon" state. Honest label, e.g.
  "Update to Today (Live Search)". Do NOT fabricate any number client-side.

### `components/charts/MortgageRateStat.tsx` (Sonnet authors)
```ts
export function MortgageRateStat({ rate, asOf }: { rate: number; asOf: string }): JSX.Element;
// renders e.g.  30-yr Fixed: 6.8%  ·  as of Jun 12, 2026   (use asOfFromToken-style formatting)
```
Main Claude renders `marketContext.mortgage && <MortgageRateStat .../>` in the chart header. If
`mortgage` is null, Main Claude renders nothing — your component can assume non-null props.

---

## MOAT guardrails (non-negotiable — this is the brand)

The platform's promise is **"the system cannot invent a number."** The "Update to Today" probe is the
one place that could violate it. For v1 you are building **visual structure only**:
- The button must be **honestly labeled** ("Live Search" / "Estimated"), never implying audited data.
- It calls the stub `/api/probe`; there is **no** client-side number fabrication.
- Any future live-probe value will be tagged `live_probe_estimate`, always lose to vendor data, and
  carry its `source_url`. That wiring is gated on operator sign-off — not in this build.
- Legal copy must include: *"Live Probe data is extracted from local sources via AI and is not
  guaranteed for accuracy. [Details](/terms)"*.

---

## Design rules (match the just-shipped standardization, commit 951db4f)
- Brand teal **`#0a8078`** / `var(--brand-primary,#0a8078)`. No legacy `#00d4aa`/`#3dc9c0`.
- Layout: `h-full` / `dvh`, never `h-screen`.
- Micro-footer: single line, `text-[10px]`/`text-xs`, subtle gray, zero padding bloat. Exact text:
  `© 2026 SWFL Data Gulf. Information from reliable sources but not guaranteed. [Full Disclaimer & Terms](/terms)`
- `/terms`: the full Colliers-style block ("deemed reliable… cannot guarantee… consult advisors").
- Report end-cap: left = full disclaimer (small print), right = institutional branding (teal logo,
  Ft. Myers location, contact). Renders **once at the very bottom** of the ZIP report — NOT per page,
  NOT in the sidebar or chat.
- **Token hygiene:** disclaimer text lives in static UI ONLY. Never inject it into the AI system
  prompt / chat context (verify: grep the chat/system-prompt path stays clean).
- RSC: components used inside the server component `app/charts/page.tsx` take only serializable props.

---

## Coordination protocol (avoid the documented git-race on `main`)
1. **Isolation.** Work in your own git worktree (or branch) off current `main` — do NOT commit
   concurrently on the same `main` checkout as Main Claude.
2. **Stage only your owned paths.** NEVER `git add -A` / `git add .` (this is exactly what swept
   another session's files into 951db4f). Stage explicit file paths.
3. **`node scripts/safe-push.mjs`**, one session pushes at a time; `git fetch && rebase` first.
4. **SESSION_LOG.md:** each session writes its own top-of-file entry before pushing (hook-enforced).
   Expect to rebase the log; never delete the other session's entry.
5. **Never push to `main` without operator confirmation** (standing operator rule). Commit, show the
   log, ask.

---

## Verification (Sonnet's parts)
- `npm run build` green: `/terms` + `/privacy` prerender; `/charts` still builds (your components are
  pure/serializable). `/r/zip-report/[zip]` builds with the end-cap.
- ESLint clean (watch `react-hooks/set-state-in-effect` — it's a hard error here).
- Eyeball: badge shows a real dynamic date (no hardcoded "April"); micro-footer on every page links
  to `/terms`; report end-cap renders once at the bottom only; "Update to Today" pill shows the
  "coming soon" state and never a fabricated number.
