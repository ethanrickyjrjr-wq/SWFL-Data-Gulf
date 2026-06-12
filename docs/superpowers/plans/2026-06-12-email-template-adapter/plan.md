# Email Template Adapter — Build Plan

**Status:** BLOCKED on template delivery. Do not implement until 5 HTML shells are committed.
**Output folder:** `lib/email/templates/` — all code from every section lives here.
**Last updated:** 2026-06-12

> **Architecture note (2026-06-12):** Originally scoped for operator-level internal broadcasts. Extended for user-facing sends from the briefcase engine. Four HIGH/MEDIUM issues must be resolved before Sections 1–3 ship to real users. See **Known Gaps** below.

---

## Known Gaps (resolve before user-facing launch)

### GAP 1 — SENDER IDENTITY (HIGH)

`DIGEST_SENDER_NAME` / `DIGEST_SENDER_ADDRESS` are single env vars. Every user's email would come from the same "from" address — wrong for a multi-user platform.

**Fix:** Store sender identity in `user_brand_profiles` (already planned in Section 4). Add `sender_name TEXT` and `sender_address TEXT` columns to that table. Add `sender_domain_verified BOOLEAN DEFAULT false` for future white-label sending.

For MVP: all sends use our verified domain but surface the user's name: `"Acme Corp via SWFL Data Gulf" <hello@mail.swfldatagulf.com>`. The `sender_name` field on the profile supplies "Acme Corp". Env vars (`DIGEST_SENDER_NAME` / `DIGEST_SENDER_ADDRESS`) remain for the SWFL digest pipeline only — they must not be the path for project emails.

The broadcast route needs a `senderOverride?: { name: string; address: string }` parameter, OR a separate `/api/email/project-broadcast` route that reads sender from the project's resolved brand profile. Do not expand the digest route — keep pipelines separate.

**White-label future:** when `sender_domain_verified = true`, send from `name@their-domain.com` directly. Requires Resend domain verification per user. Park this — do not build until there's demand.

### GAP 2 — RESEND AUDIENCE ISOLATION (HIGH)

`resend.broadcasts.create` ties unsubscribes to a specific audience/list. If all user emails share one Resend audience, user A unsubscribing from user A's email can pollute user B's list, and unsubscribe links resolve to the wrong list.

**Fix:** Each project that sends emails needs its own Resend audience. Store the audience ID on the project.

**Migration file** (do not run raw `ALTER TABLE` directly — write to `supabase/migrations/YYYYMMDDHHMMSS_email_project_columns.sql`):
```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS resend_audience_id text;
```

On project email setup (when user first enables email for a project), call `resend.audiences.create({ name: projectId })` and write the returned ID to `projects.resend_audience_id`. The broadcast call uses `segmentId` from this project field, not the global `getDigestSegmentId()`.

**SWFL digest is unaffected** — it keeps its own audience via `RESEND_DIGEST_SEGMENT_ID`.

### GAP 3 — `brandThemeToTokens()` NULL PATH (HIGH)

In the user/project context `brandThemeToTokens()` is the primary send path, not a helper. The whole-object null case and per-field null are the default scenario for new users who haven't set brand colors yet.

The function must be explicit about what the caller must do when brand is null — not silently fall back to SWFL colors:

```typescript
// NULL = no brand on file. Caller must decide: prompt user, or abort.
// NEVER fall back to SWFL_THEME here — that hides missing brand setup from users.
export function brandThemeToTokens(theme: BrandTheme | null | undefined): Partial<TemplateTokens> {
  if (!theme) return {};
  return {
    ...(theme.primary ? { PRIMARY: theme.primary } : {}),
    ...(theme.accent ? { ACCENT: theme.accent } : {}),
    ...(theme.logoUrl ? { LOGO_URL: theme.logoUrl } : {}),
  };
}
```

When `brandThemeToTokens()` returns `{}` and no `tokens` are passed, `renderEmailTemplate()` falls through to `SWFL_TOKEN_DEFAULTS`. That is wrong for a real user. The render path must check: if user has no brand, surface a "set your brand colors" prompt rather than rendering with SWFL colors. This check belongs in the briefcase/project UI layer, not inside the render function.

### GAP 4 — SHELL SELECTION MODEL (MEDIUM)

5 HTML shells as static files in `lib/email/templates/` works for internal use. For users picking a template per project, shells need to be selectable at runtime.

**Fix:** A static manifest in code — no DB needed for MVP:

```typescript
// lib/email/templates/template-registry.ts
export const EMAIL_TEMPLATES = {
  'announcement':  'lib/email/templates/shells/announcement.html',
  'digest':        'lib/email/templates/shells/digest.html',
  'property-alert':'lib/email/templates/shells/property-alert.html',
  'market-report': 'lib/email/templates/shells/market-report.html',
  'one-liner':     'lib/email/templates/shells/one-liner.html',
} as const;
export type TemplateSlug = keyof typeof EMAIL_TEMPLATES;
```

Projects store their selected template slug.

**Migration file** — add to the same `supabase/migrations/YYYYMMDDHHMMSS_email_project_columns.sql` as the audience column above (one migration, both columns):
```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS email_template_slug text DEFAULT 'digest';
```

`renderEmailTemplate()` takes a `TemplateSlug` instead of a raw HTML string — reads the file internally. This keeps the call site clean and prevents callers from passing arbitrary HTML.

When user switches templates: new slug written to `projects.email_template_slug`, brand tokens unchanged. Colors follow; only layout changes.

---

## Pre-Build Gate (run first, before anything else)

Templates must be present and token-audited before any code runs.

```bash
# 1. Confirm template files exist (5 HTML shells)
ls lib/email/templates/*.html

# 2. Audit every {{TOKEN}} used — source of truth for TokenKey union
grep -oh "{{[A-Z_]*}}" lib/email/templates/*.html | sort -u
```

Any token found by the grep that is NOT in the 14-token defaults table below must be added to `SWFL_TOKEN_DEFAULTS` and to the `TokenKey` union before writing the adapter. Do not hardcode the list — derive it from the grep.

Also confirm `{{{RESEND_UNSUBSCRIBE_URL}}}` is present in every shell intended for broadcast use. The broadcast route at `app/api/email/broadcast/route.ts:49` hard-rejects HTML that omits it. If any broadcast shell is missing it, send back before building. **Transactional shells** (report-ready, property-alert, etc.) do not route through `resend.broadcasts` and must NOT require this token — the check lives at the broadcast route, not inside `renderEmailTemplate()`.

Also confirm `lib/deliverable/brand-theme.ts` is present and exports `BrandTheme` + `extractBrandTheme()` — Section 1B imports from it and stalls if it's missing.

---

## Known Token Set (verify against grep — update if grep disagrees)

| Token | Default (SWFL) | Source |
|---|---|---|
| `{{PRIMARY}}` | `#0F2035` | `SWFL_THEME.primary` in `scripts/email/types.ts:92` |
| `{{ACCENT}}` | `#1BB8C9` | `SWFL_THEME.accent` in `scripts/email/types.ts:92` |
| `{{SURFACE}}` | `#ffffff` | net-new |
| `{{TEXT}}` | `#111827` | net-new |
| `{{FONT_FAMILY}}` | `'Inter', sans-serif` | net-new |
| `{{BORDER_RADIUS}}` | `8px` | net-new |
| `{{COMPANY_NAME}}` | `SWFL Data Gulf` | net-new |
| `{{LOGO_URL}}` | `""` (empty — omits img tag) | `SWFL_THEME.logoUrl` (null → `""`) |
| `{{TAGLINE}}` | `Southwest Florida Intelligence` | net-new |
| `{{WEBSITE_URL}}` | `https://www.swfldatagulf.com` | net-new |
| `{{SENDER_NAME}}` | `""` (empty — **not** the env var) | See BUG 1 note below |
| `{{SENDER_ADDRESS}}` | `""` (empty — **not** the env var) | See BUG 1 note below |
| `{{DISCLAIMER}}` | standard footer legal text | net-new |
| `{{MAP_URL}}` | `""` (empty — shows placeholder box) | net-new |

**`PRIMARY`, `ACCENT`, `LOGO_URL` MUST derive from `SWFL_THEME`** in `scripts/email/types.ts` — never re-hardcode the hex values a third time.

**BUG 1 fix — `SENDER_NAME` / `SENDER_ADDRESS` default to `""`, never a throw.** `SWFL_TOKEN_DEFAULTS` is the merge base for ALL callers — including project-level renders that must never touch `DIGEST_SENDER_*` env vars. A throw in the defaults object would detonate every project send. The throw guard lives at exactly two places: (1) `app/api/email/broadcast/route.ts:53–54` (already there, already correct — do not move it), and (2) a pre-send validation step in Section 4 GAP 1 before any broadcast is queued.

---

## Section 1 — Template Adapter
**Builder: SONNET** (mechanical — token merge + string replace)
**Blocked until:** 5 HTML shells committed + pre-build gate passes

### Files

All output goes to `lib/email/templates/`.

```
lib/email/templates/
  token-defaults.ts     ← SWFL_TOKEN_DEFAULTS constant + TokenKey union
  render-template.ts    ← renderEmailTemplate() function + TemplateData type
```

### Parallel tasks (run simultaneously once templates are present)

```
┌─────────────────────────────────┐  ┌────────────────────────────────────────┐
│  TASK 1A — token-defaults.ts    │  │  TASK 1B — types only in               │
│  (Sonnet)                       │  │  render-template.ts (Sonnet)           │
│                                 │  │                                        │
│  - Run pre-build grep           │  │  - Define TokenKey union from 1A       │
│  - Define TokenKey union        │  │  - Define TemplateData shape           │
│  - Define SWFL_TOKEN_DEFAULTS   │  │  - Write function signature only       │
│    (PRIMARY/ACCENT/LOGO_URL     │  │    (no body yet)                       │
│    from SWFL_THEME;             │  │                                        │
│    SENDER_NAME/ADDRESS = ""     │  │                                        │
│    — NOT env vars, NOT throw)   │  │                                        │
└─────────────────────────────────┘  └────────────────────────────────────────┘
                    ↓ both done ↓
┌──────────────────────────────────────────────────────────────┐
│  TASK 1C — renderEmailTemplate() body (Sonnet)               │
│                                                              │
│  Steps:                                                      │
│  1. Merge tokens: { ...SWFL_TOKEN_DEFAULTS, ...tokens }      │
│     (same pattern as resolveTheme() in scripts/email/types)  │
│  2. Replace all {{TOKEN}} in htmlShell — one pass, regex     │
│  3. If data provided, replace section placeholders           │
│     ([ CHART ], [ BODY TEXT ], etc.) from TemplateData       │
│  4. Assert no raw {{[A-Z_]+}} remain — throw if any do       │
│  5. Return finished HTML string                              │
│                                                              │
│  BUG 2 fix: do NOT assert {{{RESEND_UNSUBSCRIBE_URL}}}       │
│  here. This is a general-purpose render fn used for both     │
│  broadcast AND transactional sends. The triple-brace guard   │
│  already exists at broadcast/route.ts:49 where it belongs.  │
│  Duplicating it here hard-fails legitimate transactional     │
│  renders (report-ready, property alerts, etc.).              │
└──────────────────────────────────────────────────────────────┘
```

### brandThemeToTokens() helper (in render-template.ts)

`extractBrandTheme()` from `lib/deliverable/brand-theme.ts` returns `{ primary, accent, logoUrl }` (lowercase). The token system uses `{{PRIMARY}}` (uppercase). Write an explicit mapper — do not claim resolveTheme() handles this, it does not:

```typescript
function brandThemeToTokens(theme: BrandTheme): Partial<TemplateTokens> {
  return {
    ...(theme.primary ? { PRIMARY: theme.primary } : {}),
    ...(theme.accent ? { ACCENT: theme.accent } : {}),
    ...(theme.logoUrl ? { LOGO_URL: theme.logoUrl } : {}),
  };
}
```

Callers that have a project `BrandTheme` pass `brandThemeToTokens(theme)` as the `tokens` arg to `renderEmailTemplate()`.

### Verification (1C done)

```bash
# 1. No raw tokens left — use a real slug from EMAIL_TEMPLATES registry
# renderEmailTemplate takes a TemplateSlug, reads the file internally (GAP 4 fix)
node -e "
  const { renderEmailTemplate } = require('./lib/email/templates/render-template');
  const out = renderEmailTemplate('digest', {}, {});
  const remaining = out.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) throw new Error('Unfilled tokens: ' + remaining.join(', '));
  console.log('PASS — no raw tokens');
"

# 2. Partial override: renderEmailTemplate('digest', { PRIMARY: '#ff0000' }, {})
#    Only PRIMARY should change; all others show SWFL defaults
# 3. POST rendered HTML to /api/email/broadcast with send: false — confirm draft in Resend
# 4. Open rendered HTML in browser — zero visible {{TOKEN}} strings
```

---

## Section 2 — Charts & Graphs
**Builder: OPUS** (complex rendering logic, data-to-visual mapping)
**Can start in parallel with Section 1** (no dependency on templates being built — only on shells being present for integration)

### Files

```
lib/email/templates/
  charts/
    chart-renderer.ts   ← renderChart(spec) → HTML string (inline, email-safe)
    chart-types.ts      ← EmailChartSpec type union
    chart-defaults.ts   ← SWFL chart palette + font defaults
```

### Design constraints (email-safe charts)

Email clients strip `<script>`, `<canvas>`, and most SVG filters. Charts must be:
- **Pure inline SVG** or **HTML table + CSS bar** — no JS, no canvas
- **Self-contained** — no external font references inside the SVG
- **Max width 600px** — standard email column
- Inline styles only — no `<style>` blocks (Gmail strips them)

### Chart types to support

| Type | Use case | Complexity |
|---|---|---|
| Horizontal bar | Metric comparisons (ZIP vs county) | Low |
| Sparkline | Trend over time (price, inventory) | Medium |
| Gauge / dial | Single-number confidence or score | Medium |
| Heat-row | ZIP × metric grid (small multiples) | High |
| Stacked bar | Market share or split (e.g. sale above/below list) | Medium |

### Parallel tasks

```
┌──────────────────────────────────┐  ┌──────────────────────────────────────┐
│  TASK 2A — chart-types.ts        │  │  TASK 2B — chart-defaults.ts         │
│  (Opus)                          │  │  (Opus)                              │
│                                  │  │                                      │
│  Define EmailChartSpec union:    │  │  SWFL chart palette:                 │
│  - BarChartSpec                  │  │  - Primary: #0F2035                  │
│  - SparklineSpec                 │  │  - Accent: #1BB8C9                   │
│  - GaugeSpec                     │  │  - Neutral: #6B7280                  │
│  - HeatRowSpec                   │  │  - Danger: #EF4444                   │
│  - StackedBarSpec                │  │  - Font: Arial (email-safe fallback) │
│                                  │  │  Derive primary/accent from          │
│  Each carries: data[], width,    │  │  SWFL_THEME (not hardcoded)          │
│  colors?, title?, subtitle?      │  │                                      │
└──────────────────────────────────┘  └──────────────────────────────────────┘
                    ↓ both done ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  TASK 2C — chart-renderer.ts (Opus)                                      │
│                                                                          │
│  renderChart(spec: EmailChartSpec, theme?: Partial<EmailChartTheme>)     │
│    → string (inline SVG or HTML string, email-safe)                      │
│                                                                          │
│  - Dispatch on spec.type to the matching render function                 │
│  - Merge theme over SWFL_CHART_DEFAULTS (same merge pattern)             │
│  - Return value is what goes into TemplateData's chart slot              │
│  - renderChart() output plugs into renderEmailTemplate()'s               │
│    data.chart field → fills [ CHART ] in the HTML shell                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Integration point

```typescript
// How chart output flows into the template adapter:
const chartHtml = renderChart({ type: 'bar', data: zipMetrics, ... });
const html = renderEmailTemplate(shell, {}, { chart: chartHtml });
```

### Verification (2C done)

```bash
# Render each chart type to a standalone HTML file, open in browser
# Confirm: no script tags, no canvas, inline styles only, renders in < 600px
# Test in Gmail (send to a test address) — Gmail strips <style>, so inline-only matters
```

---

## Section 3 — Visual Components
**Builder: OPUS** (design-level decisions, compositing)
**Can start in parallel with Section 2** after chart-types.ts is defined (Section 2A)

### Files

```
lib/email/templates/
  components/
    metric-card.ts      ← renderMetricCard(label, value, delta?) → HTML string
    stat-row.ts         ← renderStatRow(stats[]) → HTML string (horizontal band)
    callout-box.ts      ← renderCallout(type, text) → HTML string (info/warn/highlight)
    badge.ts            ← renderBadge(text, color?) → HTML string (inline pill)
    map-placeholder.ts  ← renderMapPlaceholder(mapUrl?) → HTML string
```

### Component contracts

**`renderMetricCard(label, value, delta?, theme?)`**
- `delta` is `{ value: number; direction: 'up' | 'down' | 'flat'; label: string }`
- Green arrow up / red arrow down — inline SVG arrows (no icon font)
- Output: a self-contained `<td>` block, max 180px wide (fits 3-up in 600px)

**`renderStatRow(stats[])`**
- `stats` is `Array<{ label: string; value: string; sub?: string }>`
- Renders as a single-row HTML table, full 600px width
- Background: `SURFACE` token color

**`renderCallout(type: 'info' | 'warn' | 'highlight', text: string)`**
- Left-border accent block (CSS border-left, inline style)
- `info` → accent color border; `warn` → `#F59E0B`; `highlight` → primary color
- Email-safe: no background images, no gradients

**`renderBadge(text, color?)`**
- Inline `<span>` with inline border-radius pill style
- Default color: accent token

**`renderMapPlaceholder(mapUrl?)`**
- If `mapUrl` provided: `<img src="${mapUrl}" width="560">` with fallback alt text
- If empty: gray placeholder box at 560×200 with centered "Map" text
- Fills `{{MAP_URL}}` token behavior at the component level for data-driven builds

### Parallel tasks

```
┌────────────────────────────┐  ┌──────────────────────────────┐  ┌─────────────────────────┐
│  TASK 3A                   │  │  TASK 3B                     │  │  TASK 3C                │
│  metric-card.ts            │  │  callout-box.ts              │  │  map-placeholder.ts     │
│  stat-row.ts               │  │  badge.ts                    │  │                         │
│  (Opus)                    │  │  (Opus)                      │  │  (Opus)                 │
│                            │  │                              │  │                         │
│  Core data display         │  │  Annotation/callout layer    │  │  Map/geo slot           │
└────────────────────────────┘  └──────────────────────────────┘  └─────────────────────────┘
                    ↓ all three done ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  TASK 3D — integration smoke test (Sonnet)                               │
│                                                                          │
│  Build a fixture email using all components + a chart + a template shell │
│  Verify: renders clean HTML, no raw tokens, no script tags               │
│  POST to /api/email/broadcast (send: false) — confirm draft in Resend    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Full Dependency Graph

```
[Template shells committed + pre-build grep passes]
        │
        ├── PARALLEL ──────────────────────────────────────────────────────┐
        │   1A token-defaults.ts (Sonnet)   1B types + signature (Sonnet)  │
        │              └──────────── 1C render-template.ts body ───────────┘
        │
        ├── PARALLEL (can start same day as Section 1) ───────────────────┐
        │   2A chart-types.ts (Opus)         2B chart-defaults.ts (Opus)   │
        │              └──────────── 2C chart-renderer.ts (Opus) ──────────┘
        │
        └── PARALLEL (starts after 2A done, no other dep) ───────────────┐
            3A metric-card + stat-row       3B callout + badge             │
            3C map-placeholder                                             │
                       └──── 3D integration smoke test (Sonnet) ──────────┘
```

**Wall-clock estimate** (once shells arrive):
- Section 1: ~1 session (Sonnet, mechanical)
- Section 2: ~1–2 sessions (Opus, SVG rendering is fiddly)
- Section 3: ~1 session (Opus, compositing)
- 3D smoke test: ~30 min (Sonnet)
- All sections can overlap across model types — no sequential bottleneck after 2A unblocks 3A.

---

## Checklist (open in checks ledger when templates arrive)

```bash
node scripts/check.mjs open email email_template_token_audit "Token audit grep passes — all {{}} confirmed" --due 2026-06-20
node scripts/check.mjs open email email_template_adapter_1c "renderEmailTemplate body + zero-raw-token verify" --due 2026-06-20
node scripts/check.mjs open email email_chart_renderer "5 chart types render email-safe in Gmail test" --due 2026-06-25
node scripts/check.mjs open email email_visual_components "All 5 components + 3D smoke test draft in Resend" --due 2026-06-25
```

---

## Confirmed OK (no change needed)

- `app/api/email/broadcast/route.ts` — accepts rendered HTML string, supports `send: false` (draft-by-default via `resend.broadcasts.create`). Verification step 3 in every section is valid as written.
- `{{{RESEND_UNSUBSCRIBE_URL}}}` — required token, hard-rejected at line 49 of the broadcast route. Must survive all token replacements untouched. The adapter must NOT replace it (it is not a `{{DOUBLE_BRACE}}` token — it uses triple braces and is Resend-internal).
