# Global Top Navigation — design spec

**Date:** 2026-06-16
**Status:** approved → implemented
**Problem:** The site was a set of dead ends. Only the home page (`/`) had a top nav
(`components/landing/Header.tsx`). Every other page — Search, Projects, Charts, Alerts,
report/deliverable pages — rendered with no way to navigate anywhere. "We have a website where
people can't get anywhere."

## Why this shape

Web research (NN/g sticky-headers; W3C WCAG 2.4 "Consistent Navigation"; Baymard account-menu
convention) all point the same way: **one persistent header, identical on every page, pinned to
the top**, with the account menu top-right. Measurably faster task completion; it's the pattern
people already expect. Sources:
- https://www.nngroup.com/articles/sticky-headers/
- https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html
- https://baymard.com/ecommerce-design-examples/57-my-account-drop-down
- https://carbondesignsystem.com/patterns/global-header/

**Hard rule from the incident:** visitors see human words only ("Search", "Projects", "Market
Trends") — never internal route slugs. URLs are plumbing.

## Decisions (locked with operator)

- **Tabs:** Logo→Home · Search · Projects · **Data ▾** (Market Trends, Map, Data Inventory) · Account (right).
- **Account menu (signed in):** email (header row) · My Projects · Billing · Sign out.
- **Account area (signed out):** Log In (modal) · Get Access (`/#waitlist`).
- **Shows on:** every page EXCEPT home (`/`), the auth screens (`/login`, `/auth/*`), embedded
  widgets (`/embed/*`), and **client deliverable pages (`/p/[id]`)** — deliverables stay clean (may
  be white-labeled with the client's brand, so no SWFL chrome).

## Implementation

- **New:** `components/nav/GlobalNav.tsx` — client component, single source of the bar.
  - Sticky (`sticky top-0 z-40 bg-navy-dark/95 backdrop-blur`); takes layout space so no per-page
    top padding is needed. `z-40` sits under the bottom-right Briefcase pill and modals.
  - Auth/identity mirrors `Header.tsx`: `createClient()` → `auth.getSession()` + `onAuthStateChange()`;
    reads the visitor's own email client-side. **No change to `/api/me`; no new server PII surface.**
  - Sign-out reuses `supabase.auth.signOut()` → `window.location.assign("/")`.
  - Logged-out "Log In" reuses `components/landing/LoginModal.tsx`.
  - Self-suppresses via `usePathname()` (`isHiddenPath`).
  - Dropdowns close on outside `pointerdown` / Escape (handlers set state — no
    `react-hooks/set-state-in-effect` violation). Mobile hamburger drawer mirrors the home Header.
  - **Data ▾ destinations:** Market Trends `/charts`, Map `/map`, Data Inventory `/ops/data-inventory`.
    ("Charts" and "Market Trends" are the same page → one item.)
- **Mounted once:** `app/layout.tsx`, first child of `<body>` inside `BriefcaseProvider`.
- **Reconciled redundant mini-navs (no double headers):**
  - `app/project/page.tsx` — dropped `<ProjectNav />`.
  - `app/project/[id]/ProjectDetail.tsx` — dropped the inline breadcrumb + Sign out block (and its
    orphaned `signOut` / `createClient` import).
  - Deleted `app/project/ProjectNav.tsx` (now unreferenced).
  - `/r/*` `ReportHeader` eyebrow kept (it's the page title block, not interactive nav).

## Verification

- `next build` green; lint clean (watch `react-hooks/set-state-in-effect`).
- Existing suite green.
- Manual: bar appears + tabs route on Search/Projects/Charts/Alerts/`/p/[id]`; Account ▾ shows email
  + My Projects + Billing + Sign out (signed in) / Log In + Get Access (signed out); home unchanged
  (no second bar); `/embed/*` and `/login` show no bar; no double header on `/project` pages.

## Out of scope / notes

- **White-label:** `/p/[id]` deliverables are kept clean (excluded in `isHiddenPath`) so a report
  sent under a client's brand carries no SWFL chrome.
- No new auth flow, no Stripe/paywall — purely navigation.
