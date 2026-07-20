"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { LoginModal } from "@/components/landing/LoginModal";
import { revealBrandPanel } from "@/lib/brand/reveal-brand-panel";
import { signedInLabArrival, EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import {
  NAV_GROUPS,
  ACCOUNT_MENU,
  type AccountMenuItem,
  homeHref,
  isActive,
  isItemActive,
  activeChildHref,
  isHiddenPath,
  isChromeFree,
} from "./nav-config";

/**
 * THE one auth-aware navigation shell, mounted once in the root layout. Since the
 * homepage-one-site redesign (spec 2026-07-12-homepage-one-site-design.md) it renders
 * ONE bar — the product tabs (NAV_GROUPS) — on every page INCLUDING `/`. The old split
 * (marketing HomeBar on `/`, product AppBar elsewhere) hid Insiders/Desk/Guides from the
 * front door and swapped nav identity on the first click (NN/g homepage principle 4.3:
 * primary navigation belongs in a highly noticeable place; consistency heuristic #4).
 *
 * The homepage keeps its premium feel as a VISUAL variant only: on `/` the same bar is
 * fixed + transparent over the hero and solidifies on scroll. Same tabs, same logo, same
 * account cluster — one wayfinding grammar sitewide.
 *
 * The logged-out CTA is "Build one free" → EMAIL_LAB_LANDING (operator pick 07/12/2026;
 * builds are free, login is captured at save/send). The old "Get Access" → #waitlist
 * pointed at an anchor nothing renders (check `get_access_dead_anchor`).
 *
 * It renders NOTHING on `SHELL_HIDDEN_PREFIXES` (white-label `/p/*`,`/embed/*` + the
 * auth screens). The nav data + helpers live in ./nav-config (pure, tested);
 * re-exported below so the README seam resolves from "@/components/nav/SiteShell".
 */

export {
  NAV_GROUPS,
  homeHref,
  SHELL_HIDDEN_PREFIXES,
  isActive,
  isItemActive,
  activeChildHref,
  isHiddenPath,
} from "./nav-config";

/** Sign the visitor out, then send them home. */
async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.assign("/");
}

/** Read the visitor's own session client-side. Skipped where the shell never renders. */
function useShellUser(active: boolean): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [active]);
  return user;
}

export function SiteShell() {
  const pathname = usePathname();
  // Hidden on white-label/auth prefixes AND on full-screen editor surfaces
  // (the paid email-lab grid owns the whole viewport). isChromeFree is separate
  // from SHELL_HIDDEN_PREFIXES so the highlighter/pill still mount there.
  const hidden = isHiddenPath(pathname) || isChromeFree(pathname);
  const user = useShellUser(!hidden);
  const [loginOpen, setLoginOpen] = useState(false);

  if (hidden) return null;

  return (
    <>
      <AppBar
        user={user}
        pathname={pathname ?? "/"}
        isHome={pathname === "/"}
        onLogin={() => setLoginOpen(true)}
      />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The bar. Primary tabs from NAV_GROUPS with aria-current; logged-in → an account
 * disclosure (NOT a role="menu" — MDN reserves that for app command menus, not nav
 * links). On `/` (isHome) the bar is fixed + transparent over the hero and turns
 * solid past 20px of scroll — the visual signature of the front door, on the same
 * skeleton every other page uses.
 * ──────────────────────────────────────────────────────────────────────────── */
function AppBar({
  user,
  pathname,
  isHome,
  onLogin,
}: {
  user: User | null;
  pathname: string;
  isHome: boolean;
  onLogin: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Which GROUP's dropdown is open, by label — not a shared boolean. A single
  // `exploreOpen` boolean used to gate every group's dropdown at once, so clicking
  // "Seller Tools" opened Explore's menu too (and vice versa) — operator bug report
  // 07/20/2026 ("seller opens explore and vise versa").
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const closeExplore = useCallback(() => setOpenGroup(null), []);

  // Home-only scroll solidify (listener sets state, not the effect body — the
  // set-state-in-effect ban doesn't apply to event handlers).
  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  // Brand's local claim: a page already showing a brand editor takes the click
  // (opens + scrolls + pulses its own panel); otherwise fall through to the
  // Link navigation → the /account/brand route-modal.
  const onAccountItem = useCallback((item: AccountMenuItem, e: React.MouseEvent) => {
    if (item.reveal === "brand" && revealBrandPanel()) e.preventDefault();
    setAccountOpen(false);
    setMobileOpen(false);
  }, []);

  // One outside-click / Escape listener for BOTH bar disclosures (account + any group).
  const anyOpen = accountOpen || openGroup !== null;
  useEffect(() => {
    if (!anyOpen) return;
    function closeAll() {
      setAccountOpen(false);
      setOpenGroup(null);
    }
    function onPointerDown(e: PointerEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) closeAll();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anyOpen]);

  const email = user?.email ?? "";
  const initial = (email[0] ?? "?").toUpperCase();

  // Solid chrome everywhere; on home it starts transparent and earns the chrome
  // on scroll (mobile menu open forces solid so the sheet never floats on glass).
  const solid = "border-b border-white/10 bg-navy-dark/95 backdrop-blur-xl";
  const barClass = isHome
    ? `fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen ? solid : "border-b border-transparent bg-transparent"
      }`
    : `sticky top-0 z-40 ${solid}`;

  return (
    <header ref={barRef} className={barClass}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={homeHref(user)}
            className="flex shrink-0 items-center gap-2"
            aria-label="SWFL Data Gulf — home"
          >
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-lg"
            />
            <span className="hidden whitespace-nowrap text-base font-semibold tracking-tight text-white sm:inline">
              SWFL Data Gulf
            </span>
          </Link>

          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_GROUPS.map((item) => {
                const active = isItemActive(pathname, item);
                // A GROUP (Explore ▾) → disclosure button + dropdown of its children.
                if (item.children?.length) {
                  const childActive = activeChildHref(pathname, item.children);
                  const groupOpen = openGroup === item.label;
                  const menuId = `nav-menu-${item.label.toLowerCase().replace(/\s+/g, "-")}`;
                  return (
                    <li key={item.label} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          setOpenGroup((g) => (g === item.label ? null : item.label));
                        }}
                        aria-expanded={groupOpen}
                        aria-controls={menuId}
                        className={`relative flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? "font-medium text-white" : "text-gray-300 hover:text-white"
                        }`}
                      >
                        {item.label}
                        <Caret open={groupOpen} />
                        {active && <ActiveMarker />}
                      </button>
                      {groupOpen && (
                        <div
                          id={menuId}
                          className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-navy-dark p-1 shadow-2xl"
                        >
                          {item.children.map((c) => (
                            <Link
                              key={c.href}
                              href={c.href ?? "#"}
                              aria-current={c.href === childActive ? "page" : undefined}
                              onClick={closeExplore}
                              className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/10 hover:text-white ${
                                c.href === childActive ? "text-white" : "text-gray-300"
                              }`}
                            >
                              {c.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                }
                // A leaf marquee (Insiders / Desk / Showcase / Projects / Charts / Maps / Alerts).
                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href ?? "#"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        closeAccount();
                        closeExplore();
                      }}
                      className={`relative block rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? "font-medium text-white" : "text-gray-300 hover:text-white"
                      }`}
                    >
                      {item.label}
                      {active && <ActiveMarker />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              {/* Straight-to-cockpit door: a blank grid canvas, no project pick. */}
              <Link
                href={signedInLabArrival()}
                className="btn-gradient whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-navy-dark transition-all"
              >
                New Campaign
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpenGroup(null);
                    setAccountOpen((o) => !o);
                  }}
                  aria-expanded={accountOpen}
                  aria-controls="account-menu"
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-2 text-sm text-white transition-colors hover:bg-white/10"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gulf-teal text-xs font-semibold text-[#0a1419]">
                    {initial}
                  </span>
                  <span className="hidden max-w-[14rem] truncate text-gray-200 lg:inline">
                    {email}
                  </span>
                  <Caret open={accountOpen} />
                </button>
                {accountOpen && (
                  <div
                    id="account-menu"
                    className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-navy-dark p-1 shadow-2xl"
                  >
                    <div className="truncate border-b border-white/10 px-3 py-2 text-xs text-gray-400">
                      {email}
                    </div>
                    {ACCOUNT_MENU.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => onAccountItem(item, e)}
                        className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        closeAccount();
                        void signOut();
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onLogin}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Log In
              </button>
              {/* Call-to-value, not "Get Access" (NN/g 4.1) — and a real destination. */}
              <Link
                href={EMAIL_LAB_LANDING}
                className="btn-gradient whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium text-navy-dark"
              >
                Build one free
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="p-2 text-white md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <Hamburger open={mobileOpen} />
        </button>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Main"
          className="flex flex-col gap-1 border-t border-white/10 bg-navy-dark px-4 py-3 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_GROUPS.map((item) => {
              // A GROUP → a non-collapsing labeled section with its children indented.
              if (item.children?.length) {
                const childActive = activeChildHref(pathname, item.children);
                return (
                  <li key={item.label}>
                    <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      {item.label}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {item.children.map((c) => (
                        <li key={c.href}>
                          <Link
                            href={c.href ?? "#"}
                            aria-current={c.href === childActive ? "page" : undefined}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                              c.href === childActive
                                ? "bg-white/10 text-white"
                                : "text-gray-200 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              }
              // A leaf marquee.
              const active = isActive(pathname, item.href ?? "#");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href ?? "#"}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-gray-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-white/10 pt-3">
            {user ? (
              <>
                {/* Straight-to-cockpit door: a blank grid canvas, no project pick. */}
                <Link
                  href={signedInLabArrival()}
                  onClick={() => setMobileOpen(false)}
                  className="btn-gradient mb-3 block rounded-xl px-5 py-2.5 text-center text-sm font-medium text-navy-dark"
                >
                  New Campaign
                </Link>
                <p className="truncate px-3 pb-1 text-xs text-gray-400">{email}</p>
                {ACCOUNT_MENU.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => onAccountItem(item, e)}
                    className="block rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogin();
                  }}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white"
                >
                  Log In
                </button>
                <Link
                  href={EMAIL_LAB_LANDING}
                  onClick={() => setMobileOpen(false)}
                  className="btn-gradient rounded-xl px-5 py-2 text-center text-sm font-medium text-navy-dark"
                >
                  Build one free
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

/* ── small shared pieces ──────────────────────────────────────────────────── */

/**
 * The "you-are-here" marker for the active bar tab: a static 2px teal underline.
 * Teal is the SYSTEM/brand color — the sentiment colors (mangrove/coral/gold) stay
 * reserved for data direction, so navigation never borrows them. Positioned against
 * the tab's own padding box (`inset-x-3` matches the tab's `px-3`).
 */
function ActiveMarker() {
  return (
    <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-teal-primary" aria-hidden />
  );
}

function Hamburger({ open }: { open: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {open ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h16"
        />
      )}
    </svg>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
