# B2 — Grouped nav + breadcrumbs + active state · DESIGN OF RECORD

**Date:** 2026-06-21 · **Wave:** 2 (after B1, before B4) · **Brief:** `SITE FLOW BUILD/B2-grouped-nav-and-breadcrumbs.md` + `SITE FLOW BUILD/WAVE2-HANDOFF.md`
**Status:** design — approved decisions below; implementation plan follows via `writing-plans`.
**Edits the shell.** Hard-sequence before B4 (both touch `nav-config.ts` + `SiteShell.tsx`).

---

## Goal

Turn the flat 4-tab app bar into a use-case-grouped nav (`Explore ▾` + marquees), add **wayfinding with real names** on the deep report/project trees, and make the active section unmistakable. Kills R2 (no current-scope highlight — Baymard says 95% of sites fail this).

## The design law (grounds every visual choice)

`globals.css` already encodes **color as meaning**: `[data-direction="bullish"]`→mangrove `#5bc97a`, `bearish`→coral `#e08158`, `mixed`→gold `#d4b370`. Those three are **reserved for data direction.**

> **Navigation chrome speaks in teal (`#0a8078`). The sentiment colors are never spent on wayfinding.** The active tab is teal *because* teal is the system/brand color — co-opting mangrove for "you-are-here" would dilute the one thing that makes a bullish reading mean something.

No new colors. All tokens already exist (`teal-primary`, `navy-dark`, the gray scale, `--font-geist-mono`).

---

## Part 1 — Grouped primary nav (`Explore ▾`)

### `components/nav/nav-config.ts` — the type change (Gap 1)

```ts
export interface NavItem {
  label: string;
  href?: string;            // a group header (Explore) has children, not a destination
  children?: NavItem[];
}

export const NAV_GROUPS: NavItem[] = [
  { label: "Explore", children: [
      { label: "Search",      href: "/r" },
      { label: "Maps",        href: "/map" },
      { label: "ZIP Reports", href: "/r/search" },   // Gap 3: /r/zip-report has NO index
  ]},
  { label: "Charts",   href: "/charts" },
  { label: "Showcase", href: "/showcase" },
  { label: "Projects", href: "/project" },
  { label: "Alerts",   href: "/alerts" },            // operator Option A: promoted top-level
];
```

`/data-intel` stays OUT (Gap 4 — operator standing call). New helpers (pure, tested), keeping the existing two-arg `isActive(pathname, href)` untouched:

```ts
// A group (or leaf) is active when the path sits under any of its hrefs.
export function isItemActive(pathname: string | null, item: NavItem): boolean {
  if (item.children?.length) return item.children.some((c) => isItemActive(pathname, c));
  return item.href ? isActive(pathname, item.href) : false;
}

// Longest matching child href wins — so /r/search lights "ZIP Reports", not also "Search".
export function activeChildHref(pathname: string | null, children: NavItem[]): string | null {
  let best: string | null = null;
  for (const c of children) {
    if (c.href && isActive(pathname, c.href) && (!best || c.href.length > best.length)) best = c.href;
  }
  return best;
}
```

### `components/nav/SiteShell.tsx` — `AppBar` desktop (Gap 2: clone the account disclosure, NOT `role="menu"`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◆ SWFL Data Gulf   Explore ▾   Charts   Showcase   Projects   Alerts   │
│                                ▔▔▔▔▔▔                          [you@..▾]│
│                                teal marker = you're in Charts           │
└──────────────────────────────────────────────────────────────────────┘
        Explore ▾
        ┌────────────────┐   ← clones the account popover verbatim:
        │ Search         │     rounded-xl border-white/10 bg-navy-dark
        │ Maps           │     p-1 shadow-2xl; items = AccountLink style;
        │ ZIP Reports    │     existing <Caret>; existing outside-click +
        └────────────────┘     Escape effect (a second copy, `exploreOpen`)
```

- The map iterates `NAV_GROUPS`. A leaf renders a `<Link>` (as today). A **group** renders a `<button aria-expanded aria-controls="explore-menu">` toggling `exploreOpen`, with the existing `<Caret>` and an absolute popover of its `children` as `AccountLink`s.
- Reuse the exact disclosure mechanics already in `AppBar` for the account menu: a second `exploreOpen` state + the same `barRef` outside-`pointerdown`/`Escape` effect (extend the effect to close both, or add a parallel one). Items close the menu on click (`closeExplore`).
- **Active marker** (static — operator chose A): each top-level `<li>` is `relative`; when `isItemActive` is true the item gets `text-white font-medium` **plus** a teal underline span `absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-teal-primary` (the same idiom `HomeAnchor` already uses, now committed instead of hover-grown). Inactive stays `text-gray-300 hover:text-white`. The `Explore ▾` trigger lights the marker when **any child** is active — so standing on `/map` still shows "you're in Explore."
- Inside the open Explore menu, highlight the item whose href === `activeChildHref(...)` with `text-white` (others `text-gray-300`).

### `AppBar` mobile drawer (Gap 2: "drawer mirrors the groups")

Render `Explore` as a non-collapsing labeled section (a small uppercase `text-xs text-gray-500` "Explore" heading + its 3 children indented), then `Charts / Showcase / Projects / Alerts` as top rows. Mobile active treatment = `bg-white/10 text-white` (a filled row reads clearer than an underline in a vertical list, and `/10` is the established mobile interactive tint) + `aria-current="page"`. This is viewport-specific and does **not** contradict the desktop "marker not pill" call.

### `HomeBar` — unchanged

Home keeps its marketing anchors + the single `Explore the Data → /r` door. B2 does not touch HomeBar (its hover-underline already matches the new active grammar, so the two bars now read as one system).

---

## Part 2 — Breadcrumbs with REAL names (the corrected architecture)

**Why the first design was wrong:** a single breadcrumb mounted in the shared shell can only see the URL (`/r/env-swfl`), so it would have to reverse-engineer names — the hard, ugly path that produced cryptic slugs. **The page already knows its name.** `/r/[slug]` has `display.title` in scope (page.tsx:109); `/project/[id]` has `project.title` (page.tsx:111); both are already `dynamic = "force-dynamic"`. So:

> **Each deep page renders its own breadcrumb, passing the real name it already computed.** No global mount, no `usePathname`, no `headers()` (which would deopt static rendering site-wide), no context, no `set-state-in-effect` lint risk. Breadcrumbs is a **plain server component** taking a `trail` prop — zero client JS.

### `lib/nav/breadcrumbs.ts` (pure, tested)

```ts
export interface Crumb { label: string; href?: string; mono?: boolean; keyTail?: string }
// keyTail renders as " · <span class=font-mono>{keyTail}</span>" — e.g. {label:"Fort Myers Beach", keyTail:"33931"} → "Fort Myers Beach · 33931"
export const HOME_CRUMB     = { label: "Home",     href: "/" } as const;
export const SEARCH_CRUMB   = { label: "Search",   href: "/r" } as const;       // labels mirror nav
export const PROJECTS_CRUMB = { label: "Projects", href: "/project" } as const;
```

### `components/nav/Breadcrumbs.tsx` (server component — no `"use client"`)

```tsx
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (trail.length < 2) return null;                     // Home + ≥1 leaf, else nothing
  // <nav aria-label="Breadcrumb"> <ol class="flex items-center gap-2 flex-wrap …">
  //   crumb with href → <Link class="text-gray-400 hover:text-teal-primary">  (matches footer hover)
  //   last crumb       → <span aria-current="page" class="text-gray-200">      (non-link)
  //   mono crumb       → add `font-mono text-gray-300`                          (signature: data keys)
  //   separator        → <span class="text-gray-600" aria-hidden>›</span>      (the <Caret> idiom)
  // strip: mx-auto max-w-7xl px-4 sm:px-6 py-3 text-sm border-b border-white/5
}
```

### Per-page trails (each uses the name already in scope)

| Page | Mount point | Trail |
|------|-------------|-------|
| `app/r/[slug]/page.tsx` | top of `ReportShell` | `[Home, Search, {label: display.title}]` |
| `app/r/zip-report/[zip]/page.tsx` | top of content | `[Home, Search, {label:"ZIP Reports",href:"/r/search"}, {label: primaryPlace ?? "ZIP", keyTail: zip}]` → `… › ZIP Reports › Fort Myers Beach · 33931` (LOCKED: one crumb, ZIP in mono) |
| `app/r/cre-swfl/[corridor]/page.tsx` | top of content | `[Home, Search, {label:"Corridors"}, {label: displayN}]` |
| `app/r/source/[table]/page.tsx` | top of content | `[Home, Search, {label:"Sources"}, {label: entry.label}]` |
| `app/r/method/[metric]/page.tsx` | top of content | `[Home, Search, {label:"Methods"}, {label: entry.label}]` |
| `app/project/[id]/page.tsx` | above `ProjectWorkspace` | `[Home, Projects, {label: project.title ?? "Project"}]` |

**Excluded** (render nothing): `/p/*` (white-label — keeps the client's brand clean), home, and the section indexes `/r` + `/project` (depth < 2). Mono is used only for the ZIP number — every other leaf is the real human name.

---

## Test plan

- `components/nav/nav-config.test.ts` — **update** the `NAV_GROUPS` shape test to the grouped form (top-level labels `["Explore","Charts","Showcase","Projects","Alerts"]`; `Explore.children` hrefs `["/r","/map","/r/search"]`); relax "every item has an href" to "every leaf has an href, every group has children." **Add** `isItemActive` (Explore active on `/r`, `/r/env-swfl`, `/map`, `/r/search`; not on `/charts`; Charts active on `/charts`) and `activeChildHref` (`/r/search`→`/r/search`; `/r/env-swfl`→`/r`).
- `components/nav/breadcrumbs.test.ts` — **new**: `<2` crumbs → renders null; href crumbs are links + last is `aria-current="page"` non-link; `mono` adds `font-mono`. (Pure render assertions, bun test.)

## Acceptance (from brief)

- `Explore ▾` opens/closes via pointer, keyboard (Enter/Space/Escape), and outside-click; groups the tail; mobile drawer mirrors the groups.
- Active section visibly distinct (teal marker) on `/r`, `/charts`, `/project`; `Explore ▾` lit on `/map`.
- Breadcrumbs show **real names** on a report page and a project page; absent on `/p/[id]`, home, and `/r`/`/project` indexes.
- `node scripts/check-orphans.mjs` green (promoting `/map` into Explore keeps it in-chrome; `/alerts` already in the footer).
- `real-tsc` 0 · eslint clean · `next build` ✓ · `bun test` green.

## Gates / risks

- Standard done-bar. `SESSION_LOG.md` entry · explicit-path staging (RULE 1.5, never `git add -A`) · **no autonomous push** (stop, show log, ask).
- Verify `/map` and `/alerts` are real routes during `next build` (both are in `SiteFooter`, so expected to resolve).
- Confirm `check-orphans` needs no `CHROME_FILES` change — breadcrumb targets (`/`, `/r`, `/project`) are already chrome-linked; `/map` enters chrome via `SiteShell`. If the orphan map disagrees, register `Breadcrumbs.tsx` rather than loosening the allowlist.
- Touching `SiteShell.tsx` is a live customer surface → **diff review before push** (RULE 1).
