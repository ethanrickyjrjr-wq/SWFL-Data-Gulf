# Section 2 — Charts & Graphs
**Builder: Opus**
**Gate: BLOCKED — 5 HTML shells must be committed first (same day gate as Section 1)**
**Output: `lib/email/templates/charts/`**

Note: Section 3 (visual components) cannot start until **Task 2A is done**. Build 2A first.

---

## Email-safe constraints (hard rules — no exceptions)

Email clients strip `<script>`, `<canvas>`, and most SVG filters.

- Pure inline SVG or HTML table + CSS bars — no JS, no canvas
- Self-contained — no external font references inside SVG
- Max 600px wide
- Inline styles only — no `<style>` blocks (Gmail strips them)

---

## Sequential build order

**2A and 2B run in parallel. 2C cannot start until both are done. Section 3 cannot start until 2A is done.**

```
[2A] chart-types.ts  ──┐
(parallel)             ├──→  [2C] chart-renderer.ts
[2B] chart-defaults.ts─┘

2A done → Section 3 (3A, 3B, 3C) can start in parallel
```

---

## Task 2A — chart-types.ts (Opus)
**Runs in parallel with 2B**
**Section 3 depends on this — prioritize finishing 2A**

File: `lib/email/templates/charts/chart-types.ts`

```typescript
interface BaseChartSpec {
  width?: number;   // default 560 (email column minus padding)
  title?: string;
  subtitle?: string;
}

export interface BarChartSpec extends BaseChartSpec {
  type: 'bar';
  data: Array<{ label: string; value: number; color?: string }>;
  unit?: string;
}

export interface SparklineSpec extends BaseChartSpec {
  type: 'sparkline';
  data: Array<{ x: string | number; y: number }>;
  color?: string;
}

export interface GaugeSpec extends BaseChartSpec {
  type: 'gauge';
  value: number;   // 0–100
  label?: string;
  color?: string;
}

export interface HeatRowSpec extends BaseChartSpec {
  type: 'heat-row';
  rows: Array<{ label: string; cells: Array<{ value: number; color?: string }> }>;
  columnLabels: string[];
}

export interface StackedBarSpec extends BaseChartSpec {
  type: 'stacked-bar';
  segments: Array<{ label: string; value: number; color: string }>;
  total?: number;
}

export type EmailChartSpec =
  | BarChartSpec
  | SparklineSpec
  | GaugeSpec
  | HeatRowSpec
  | StackedBarSpec;
```

---

## Task 2B — chart-defaults.ts (Opus)
**Runs in parallel with 2A**

File: `lib/email/templates/charts/chart-defaults.ts`

```typescript
import { SWFL_THEME } from '@/scripts/email/types';

// Derive primary/accent from SWFL_THEME — never hardcode hex here
export const SWFL_CHART_DEFAULTS = {
  primary:   SWFL_THEME.primary,
  accent:    SWFL_THEME.accent,
  neutral:   '#6B7280',
  danger:    '#EF4444',
  font:      'Arial, sans-serif',   // Arial = email-safe fallback (Inter not available in email clients)
  maxWidth:  560,
} as const;

export interface EmailChartTheme {
  primary?: string;
  accent?:  string;
  neutral?: string;
  danger?:  string;
  font?:    string;
}
```

---

## Task 2C — chart-renderer.ts (Opus)
**Cannot start until 2A AND 2B are both done**

File: `lib/email/templates/charts/chart-renderer.ts`

```typescript
import type { EmailChartSpec } from './chart-types';
import type { EmailChartTheme } from './chart-defaults';

// Returns an inline SVG string (or HTML table string for bar type) — email-safe
export function renderChart(
  spec: EmailChartSpec,
  theme?: Partial<EmailChartTheme>,
): string
```

Implementation: dispatch on `spec.type` to a private render function per chart type. Merge `theme` over `SWFL_CHART_DEFAULTS`.

**Output of `renderChart()` plugs directly into `renderEmailTemplate()` as `data.chart`** — it fills the `[ CHART ]` section placeholder in the HTML shell.

---

## Chart types to build (ordered by complexity — build in this order within 2C)

| Type | Complexity | Notes |
|---|---|---|
| `bar` | Low | Horizontal bars; HTML `<table>` + inline width style is more email-compatible than SVG here |
| `sparkline` | Medium | Inline SVG polyline |
| `stacked-bar` | Medium | Single horizontal bar, segmented |
| `gauge` | Medium | SVG arc — test in Gmail before shipping |
| `heat-row` | High | Build last; most likely to have email-client quirks |

---

## Verification

```bash
# Render each type to a standalone HTML file, open in browser
# node -e "const {renderChart}=require('./lib/email/templates/charts/chart-renderer');
#   require('fs').writeFileSync('/tmp/bar.html', renderChart({type:'bar',data:[...]}));"

# Send to a Gmail test address — confirm:
# - No <script> tags
# - No <canvas>
# - All styles inline
# - Renders within 600px width
```
