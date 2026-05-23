# FIVERR BRIEF C — Data Delivery Spec

## How We Send Data + How We Need Components Built

**Read this before starting any work. Applies to Brief A and Brief B both.**

---

## The Short Version

You build against static JSON fixtures we provide. No database access, no API keys during development. We swap in live data calls after delivery. Every visualization component receives data as props — no internal fetching.

---

## Component Pattern (Required)

Every chart or visualization must follow this pattern:

```typescript
// CORRECT — props only, no internal fetch
interface CorridorChartProps {
  data: CorridorEntry[];
  loading?: boolean;
  className?: string;
}

export function CorridorRentChart({
  data,
  loading,
  className,
}: CorridorChartProps) {
  // animation + chart code here
  // NO fetch() calls
  // NO useEffect hitting external URLs
  // NO hardcoded data arrays
}
```

The parent page handles data loading. Your components just receive and render. This makes them testable, reusable, and easy for us to wire to our live API.

---

## Fixture Files (We Send These at Project Start)

### `fixtures/corridors.json`

26 Southwest Florida commercial real estate corridors with asking rents, vacancy, and permit activity.

```json
[
  {
    "id": "us41-midpoint",
    "name": "US-41 Midpoint",
    "submarket": "Lee County",
    "nnn_asking_rent_per_sqft": 28.5,
    "vacancy_pct": 8.2,
    "absorption_sqft": null,
    "permit_zscore": 1.4,
    "saturation_index": 0.62,
    "lat": 26.561,
    "lng": -81.871
  },
  {
    "id": "airport-pulling-north",
    "name": "Airport-Pulling North",
    "submarket": "N Naples",
    "nnn_asking_rent_per_sqft": 30.91,
    "vacancy_pct": 5.1,
    "absorption_sqft": null,
    "permit_zscore": 0.8,
    "saturation_index": 0.41,
    "lat": 26.218,
    "lng": -81.765
  }
]
```

Note: `absorption_sqft` is null on some rows — handle gracefully (show "N/A", not a crash).

---

### `fixtures/zhvi-trend.json`

Monthly home value index by city (Zillow ZHVI). 36 months of data.

```json
[
  {
    "month": "2023-01",
    "cape_coral": 385000,
    "fort_myers": 312000,
    "naples": 720000
  },
  {
    "month": "2023-02",
    "cape_coral": 388000,
    "fort_myers": 315000,
    "naples": 724000
  },
  {
    "month": "2023-03",
    "cape_coral": 391000,
    "fort_myers": 318000,
    "naples": 729000
  }
]
```

---

### `fixtures/brain-output.json`

The synthesized intelligence output from our platform — the "answer" card.

```json
{
  "id": "master",
  "conclusion": "Southwest Florida CRE is bifurcating between Naples (tightening supply, rising rents) and Lee County (elevated permits, saturation risk). Proceed with caution in multi-family land acquisition.",
  "confidence": 0.84,
  "freshness_token": "SWFL-7421-v5-20260522",
  "updated_at": "2026-05-22T14:30:00Z",
  "sources_count": 8,
  "key_metrics": [
    {
      "label": "Median NNN Asking Rent",
      "value": "$28.50/sqft",
      "trend": "up",
      "change_pct": 3.2
    },
    {
      "label": "Lee County Permits (90d)",
      "value": "1,247",
      "trend": "up",
      "change_pct": 18.1
    },
    {
      "label": "Cape Coral Median ZHVI",
      "value": "$388,000",
      "trend": "flat",
      "change_pct": 0.8
    },
    {
      "label": "Flood-Affected NOI Drag",
      "value": "4.2%",
      "trend": "up",
      "change_pct": 0.6
    },
    {
      "label": "Corridor Vacancy (avg)",
      "value": "7.8%",
      "trend": "down",
      "change_pct": -1.1
    },
    {
      "label": "Active Building Permits",
      "value": "1,247",
      "trend": "up",
      "change_pct": 18.1
    }
  ],
  "caveats": [
    "absorption_sqft is null on 2 large-format corridors — treat those vacancy figures as estimated."
  ]
}
```

---

### `fixtures/permit-heatmap.json`

12 months of building permit z-scores per corridor. Used for the heatmap grid.

```json
[
  {
    "corridor": "US-41 Midpoint",
    "months": [
      { "month": "2025-04", "zscore": 1.4 },
      { "month": "2025-05", "zscore": 0.9 },
      { "month": "2025-06", "zscore": 1.1 }
    ]
  },
  {
    "corridor": "Airport-Pulling North",
    "months": [
      { "month": "2025-04", "zscore": 0.8 },
      { "month": "2025-05", "zscore": 0.3 },
      { "month": "2025-06", "zscore": -0.2 }
    ]
  }
]
```

Z-score interpretation: `0` = baseline, positive = above-average permit activity, negative = below. Color scale should diverge from zero.

---

### `fixtures/stats.json`

The animated counter numbers for the stat block section.

```json
{
  "corridors_tracked": 26,
  "sqft_analyzed": 17000000,
  "data_sources": 8,
  "permit_months": 14,
  "flood_records": 89492,
  "brain_confidence": 84
}
```

---

## Required Component File Structure

```
components/
  viz/
    CorridorRentChart.tsx      ← ECharts horizontal bar, scroll-triggered
    ZHVIAreaChart.tsx          ← Recharts/Nivo area chart with time slider
    PermitHeatmap.tsx          ← Nivo HeatMap or D3 grid, diverging color scale
    BrainOutputCard.tsx        ← Glassmorphism card, typewriter effect on conclusion
    PipelineFlow.tsx           ← SVG stroke-dashoffset pipeline animation
    CorridorMap.tsx            ← Mapbox GL JS choropleth, dark basemap
    StatCounter.tsx            ← countUp.js, scroll-triggered entrance
    DataStreamBg.tsx           ← Scrolling monospace data background effect
```

---

## Non-Negotiables

**TypeScript**

- Strict mode — no `any` unless you can explain why in a comment
- Every component's props interface exported alongside the component
- No TypeScript errors on `npm run build`

**Styling**

- Tailwind only — no Styled Components, no CSS Modules, no `style={{}}` except for GSAP `transform` values
- No hardcoded hex colors — use Tailwind config tokens (we'll share our `tailwind.config.ts`)

**Animation**

- `prefers-reduced-motion` respected in every animated component:
  ```typescript
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  ```
- 60fps target — use `will-change: transform` on elements that animate position/opacity
- No animation that blocks the main thread for more than 16ms

**Exports**

- Named exports only — no `export default`
- Example: `export function CorridorRentChart(...)` not `export default function(...)`

**Null safety**

- Every field that could be `null` in the fixtures must be handled — show "N/A" or a dash, never crash

---

## Delivery Format

Send a `.zip` containing:

- `components/viz/` directory (all component files)
- `fixtures/` directory (your working copies of the fixture files, with any fields you added)
- `README.md` inside `components/viz/` listing every component, its props interface, and what fixture file it expects
- A `packages.txt` file listing any new npm packages you added and why

**Do not send:**

- A full Next.js project scaffold
- Any `.env` files
- `node_modules/`
- Modified `app/` directory files — we handle page wiring ourselves

---

## If You Need a Field That Doesn't Exist in the Fixtures

Add it to the fixture file and note it in your README. We'll make sure our API sends it. Do not invent data shapes without documenting them — our live data pipeline has to match exactly what you build against.

---

## Questions?

Message us before starting on any section where the data shape is unclear. A 5-minute clarification upfront saves a revision round later.
