import type { User } from "@supabase/supabase-js";

/**
 * Pure nav data + helpers for the unified SiteShell (B1). No "use client" — these
 * are plain functions/constants so they unit-test deterministically and so the
 * downstream waves can extend them WITHOUT touching the big client shell component:
 * B2 turns NAV_GROUPS into the grouped `Explore ▾`, B5 appends a Social/Send entry,
 * B4 repoints homeHref. They are re-exported from SiteShell.tsx so the README
 * cross-build seam ("B1 exposes NAV_GROUPS, homeHref, SHELL_HIDDEN_PREFIXES")
 * resolves from `@/components/nav/SiteShell` as written.
 */

export interface NavItem {
  label: string;
  /** Present on a leaf (a real destination) and on simple top-level tabs. A pure
   *  group HEADER (Explore) has no href of its own — it only opens its children. */
  href?: string;
  /** Present on a GROUP (Explore). The disclosure renders these as the dropdown. */
  children?: NavItem[];
}

/**
 * Primary app nav — shown in the solid app-variant bar, and to logged-out visitors
 * as proof-of-product (every route here is public per middleware.ts; only /project*
 * is auth-gated, and its page handles the redirect). Labels are plain verbs/nouns
 * (NN/g: unfamiliar nomenclature is a top cause of navigation cognitive strain).
 *
 * B2 grouped the flat tail under `Explore ▾` so the bar stays compact, not a flat
 * row of every surface. Explore holds Search (`/r`) and Guides (`/guides`); the
 * marquees Insiders, Desk, Showcase, Projects, Charts, Maps, Alerts stay top-level
 * in that pinned order (operator ruling 07/11/2026). Maps was PROMOTED out of the
 * Explore dropdown to a static top-level tab, and the old ZIP Reports entry
 * (`/r/search`) was retired. `/data-intel` is deliberately NOT here (internal-only
 * — B6).
 *
 * The deterministic guards in `nav-config.test.ts` encode this exact shape — change
 * NAV_GROUPS and update that test in the SAME commit, or CI goes red.
 */
export const NAV_GROUPS: NavItem[] = [
  {
    label: "Explore",
    children: [
      { label: "Search", href: "/r" },
      { label: "Guides", href: "/guides" },
    ],
  },
  // The campaign centerpiece rides top-level, right after Explore (spec
  // 2026-07-10-insiders-page-design.md) — not buried as a dropdown child.
  { label: "Insiders", href: "/insiders" },
  { label: "Desk", href: "/desk" },
  { label: "Showcase", href: "/showcase" },
  { label: "Projects", href: "/project" },
  { label: "Charts", href: "/charts" },
  { label: "Maps", href: "/map" },
  { label: "Alerts", href: "/alerts" },
  // Seller-side reads, their OWN top-level group (operator ruling 07/18/2026: "seller
  // tools can be louder under Seller Tools"). Placed AFTER the pinned marquee run —
  // the 07/18 parallel session wedged this between Insiders and Desk, breaking the
  // 07/11 pinned order (operator correction 07/19: the marquee run stays contiguous).
  // Both are live /r/ routes. `/r/should-i-sell` sits under `/r`, but Seller Tools is
  // a distinct group so it never collides with Explore's Search (`/r`) in activeChildHref.
  {
    label: "Seller Tools",
    children: [
      { label: "Should I Sell?", href: "/r/should-i-sell" },
      { label: "Back on Market", href: "/r/back-on-market" },
    ],
  },
];

/**
 * Account dropdown (top-right disclosure) — the signed-in user's quick-access set:
 * everything they may need to reach fast to update-and-save (operator ruling
 * 07/05/2026). Brand + Email Schedule open as route-modals over the current page
 * (@accountModal slot) so in-progress work is never unmounted; `reveal: "brand"`
 * tells the shell to first offer the click to a brand editor already on the page
 * (lib/brand/reveal-brand-panel.ts) before navigating. Sign out is not an item —
 * it stays a button in the shell. Pinned by nav-config.test.ts like NAV_GROUPS.
 */
export interface AccountMenuItem {
  label: string;
  href: string;
  /** Set on items a page can claim locally instead of navigating. */
  reveal?: "brand";
}

export const ACCOUNT_MENU: AccountMenuItem[] = [
  { label: "My Projects", href: "/project" },
  { label: "Brand", href: "/account/brand", reveal: "brand" },
  { label: "Contacts", href: "/contacts" },
  { label: "Email Schedule", href: "/account/schedules" },
  { label: "Alerts", href: "/alerts" },
  { label: "MLS Settings", href: "/settings/mls" },
  { label: "Billing", href: "/billing" },
];

/**
 * Prefixes where NO chrome renders — the shell AND the global footer both suppress
 * here. `/p/` (trailing slash so it can't match `/privacy` or `/project`) + `/embed/`
 * stay white-label clean (a finished deliverable may carry a broker's brand, not SWFL
 * chrome); `/login` + `/auth` are focused auth screens.
 *
 * The `/p/` rule is the PARITY TWIN of `lib/briefcase/pill-mount.ts`
 * (`shouldRenderStandalone`, which suppresses the floating pill on `/p/*`). Change one,
 * change both — or a stray footer/pill leaks into a client-facing deliverable.
 *
 * `/login` and `/auth` carry no trailing slash on purpose: there is no bare `/auth`
 * page, so `/auth` must prefix-match the real sub-routes (`/auth/callback`,
 * `/auth/auth-code-error`). `/p/` and `/embed/` keep the slash to avoid collisions
 * (`/p/` vs `/privacy`/`/project`).
 *
 * NOTE: `/` is intentionally NOT hidden. Home now renders the shell's home variant
 * (the old GlobalNav hid on `/`; the old Header was home-only — B1 unifies them).
 */
export const SHELL_HIDDEN_PREFIXES = ["/login", "/auth", "/embed/", "/p/"] as const;

export function isHiddenPath(pathname: string | null): boolean {
  if (!pathname) return true;
  return SHELL_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Full-screen editor surfaces that render NO global chrome (the site nav + the
 * footer) so the canvas owns the whole viewport — but KEEP the normal AI
 * highlighter/pill behavior of any other page. This is DELIBERATELY separate from
 * SHELL_HIDDEN_PREFIXES: that set also gates the highlighter (page-mount-coverage
 * pins it), so folding the email-lab editor in there would wrongly suppress the
 * highlighter. Only SiteShell + SiteFooter read this.
 */
export const CHROME_FREE_PREFIXES = ["/email-lab/grid"] as const;

export function isChromeFree(pathname: string | null): boolean {
  return !!pathname && CHROME_FREE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Home target for the logo. Logged-OUT → `/` (the marketing funnel, untouched).
 * Signed-IN → `/project`, the de-facto home base — its header carries quick links to
 * Charts / Search / Alerts / Contacts (B4), so a logged-in user's logo lands them on
 * their toolset, never back on the funnel. Both SiteShell variants link their logo
 * here, so this one branch repoints both.
 */
export function homeHref(user: User | null): string {
  return user ? "/project" : "/";
}

/**
 * Active-tab test: a tab is active when the path IS its href or sits under it.
 * `/` is special-cased to exact-match (else it would match every path). Anchored on
 * a segment boundary so `/r` does NOT light up on `/report` or `/rsomething`.
 */
export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Active test for a nav ITEM (leaf or group). A group (Explore) is active when the
 * path sits under ANY of its children — so standing on `/map` lights the `Explore ▾`
 * marker even though Maps lives inside the dropdown. A leaf falls back to `isActive`.
 */
export function isItemActive(pathname: string | null, item: NavItem): boolean {
  if (item.children?.length) return item.children.some((c) => isItemActive(pathname, c));
  return item.href ? isActive(pathname, item.href) : false;
}

/**
 * Inside an open group dropdown, return the single child href that should read as
 * active — the LONGEST matching href wins. Without this, `/r/search` would light both
 * "Search" (`/r`) and "ZIP Reports" (`/r/search`), since the former is a prefix of
 * the latter. Returns null when no child matches.
 */
export function activeChildHref(pathname: string | null, children: NavItem[]): string | null {
  let best: string | null = null;
  for (const c of children) {
    if (c.href && isActive(pathname, c.href) && (!best || c.href.length > best.length)) {
      best = c.href;
    }
  }
  return best;
}
