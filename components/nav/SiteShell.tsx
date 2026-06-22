"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { LoginModal } from "@/components/landing/LoginModal";
import {
  NAV_GROUPS,
  homeHref,
  isActive,
  isItemActive,
  activeChildHref,
  isHiddenPath,
} from "./nav-config";

/**
 * THE one auth-aware navigation shell, mounted once in the root layout in place of
 * the old split (`Header` on `/` only + `GlobalNav` everywhere else — the split that
 * sealed home into an island, Root-cause R1). It reads the visitor's own session
 * client-side (same shape as the components it replaces; no new server PII surface)
 * and renders one of two variants:
 *   • HOME (`/`)         — premium transparent-over-hero bar (motion intro, scroll-to-
 *                          solid), marketing anchors + one app door, loud Get Access.
 *   • APP (every else)   — solid sticky bar with the primary NAV_GROUPS tabs + account.
 * It renders NOTHING on `SHELL_HIDDEN_PREFIXES` (white-label `/p/*`,`/embed/*` + the
 * auth screens). The marketing/app data + helpers live in ./nav-config (pure, tested);
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

/** Sign the visitor out, then send them home. Shared by both variants. */
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
  const hidden = isHiddenPath(pathname);
  const user = useShellUser(!hidden);
  const [loginOpen, setLoginOpen] = useState(false);

  if (hidden) return null;

  const isHome = pathname === "/";
  return (
    <>
      {isHome ? (
        <HomeBar user={user} onLogin={() => setLoginOpen(true)} />
      ) : (
        <AppBar user={user} pathname={pathname} onLogin={() => setLoginOpen(true)} />
      )}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * HOME variant — the landing's premium bar preserved (was components/landing/Header).
 * Transparent over the hero, solidifies on scroll, motion intro. Marketing anchors +
 * ONE real app door ("Explore the Data" → /r) so the hero keeps its scroll-nav AND
 * gains a door into the product. Get Access stays the loudest element (revenue path).
 * ──────────────────────────────────────────────────────────────────────────── */
function HomeBar({ user, onLogin }: { user: User | null; onLogin: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "border-b border-white/10 bg-black/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, x: -20, scale: 0.95, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 15 }}
        >
          <Link
            href={homeHref(user)}
            className="flex items-center gap-3"
            aria-label="SWFL Data Gulf — home"
          >
            <Image src="/logo.png" alt="" width={44} height={44} className="rounded-xl" />
            <span className="text-xl font-semibold tracking-tight text-white">SWFL Data Gulf</span>
          </Link>
        </motion.div>

        <motion.nav
          aria-label="Main"
          initial={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, delay: 0.1, type: "spring", stiffness: 100, damping: 15 }}
          className="hidden items-center gap-8 md:flex"
        >
          <ul className="flex items-center gap-8">
            <li>
              <HomeAnchor href="#comparison">How It Works</HomeAnchor>
            </li>
            <li>
              <HomeAnchor href="#data">Live Data</HomeAnchor>
            </li>
            <li>
              {/* The one app door off the marketing hero (R1 fix). */}
              <Link
                href="/r"
                className="group relative font-medium text-teal-primary transition-colors hover:text-white"
              >
                Explore the Data
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-teal-primary transition-all group-hover:w-full" />
              </Link>
            </li>
          </ul>
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/project"
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                My Projects
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-sm text-gray-400 transition-colors hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onLogin}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Log In
              </button>
              <motion.a
                href="#waitlist"
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="btn-gradient rounded-xl px-6 py-2.5 font-medium text-navy-dark transition-all"
              >
                Get Access
              </motion.a>
            </div>
          )}
        </motion.nav>

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
          className="flex flex-col gap-4 border-t border-white/10 bg-black/90 px-6 py-4 backdrop-blur-xl md:hidden"
        >
          <ul className="flex flex-col gap-4">
            <li>
              <Link
                href="#comparison"
                className="block text-gray-300 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                How It Works
              </Link>
            </li>
            <li>
              <Link
                href="#data"
                className="block text-gray-300 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                Live Data
              </Link>
            </li>
            <li>
              <Link
                href="/r"
                className="block font-medium text-teal-primary hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                Explore the Data
              </Link>
            </li>
          </ul>
          <div className="border-t border-white/10 pt-3">
            {user ? (
              <div className="flex flex-col gap-3">
                <Link
                  href="/project"
                  className="rounded-full border border-white/20 px-4 py-2 text-center text-sm font-medium text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  My Projects
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="text-left text-sm text-gray-400 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogin();
                  }}
                  className="w-full rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white"
                >
                  Log In
                </button>
                <a
                  href="#waitlist"
                  onClick={() => setMobileOpen(false)}
                  className="btn-gradient block rounded-xl px-6 py-2.5 text-center font-medium text-navy-dark"
                >
                  Get Access
                </a>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * APP variant — the solid sticky bar (was components/nav/GlobalNav). Primary tabs
 * from NAV_GROUPS with aria-current; logged-in → an account disclosure (NOT a
 * role="menu" — MDN reserves that for app command menus, not nav links).
 * ──────────────────────────────────────────────────────────────────────────── */
function AppBar({
  user,
  pathname,
  onLogin,
}: {
  user: User | null;
  pathname: string;
  onLogin: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const closeExplore = useCallback(() => setExploreOpen(false), []);

  // One outside-click / Escape listener for BOTH bar disclosures (account + Explore).
  // Clicking inside the bar never closes via this path (barRef contains the target);
  // opening one trigger explicitly closes the other (see the toggle handlers) so the
  // two popovers can't stack open.
  const anyOpen = accountOpen || exploreOpen;
  useEffect(() => {
    if (!anyOpen) return;
    function closeAll() {
      setAccountOpen(false);
      setExploreOpen(false);
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

  return (
    <header
      ref={barRef}
      className="sticky top-0 z-40 border-b border-white/10 bg-navy-dark/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={homeHref(user)}
            className="flex items-center gap-2"
            aria-label="SWFL Data Gulf — home"
          >
            <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
            <span className="hidden text-base font-semibold tracking-tight text-white sm:inline">
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
                  return (
                    <li key={item.label} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          setExploreOpen((o) => !o);
                        }}
                        aria-expanded={exploreOpen}
                        aria-controls="explore-menu"
                        className={`relative flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? "font-medium text-white" : "text-gray-300 hover:text-white"
                        }`}
                      >
                        {item.label}
                        <Caret open={exploreOpen} />
                        {active && <ActiveMarker />}
                      </button>
                      {exploreOpen && (
                        <div
                          id="explore-menu"
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
                // A leaf marquee (Charts / Showcase / Projects / Alerts).
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
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setExploreOpen(false);
                  setAccountOpen((o) => !o);
                }}
                aria-expanded={accountOpen}
                aria-controls="account-menu"
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-2 text-sm text-white transition-colors hover:bg-white/10"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0a8078] text-xs font-semibold text-white">
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
                  <AccountLink href="/project" onClick={closeAccount}>
                    My Projects
                  </AccountLink>
                  <AccountLink href="/contacts" onClick={closeAccount}>
                    Contacts
                  </AccountLink>
                  <AccountLink href="/billing" onClick={closeAccount}>
                    Billing
                  </AccountLink>
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
          ) : (
            <>
              <button
                type="button"
                onClick={onLogin}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Log In
              </button>
              <Link
                href="/#waitlist"
                className="btn-gradient rounded-xl px-5 py-2 text-sm font-medium text-navy-dark"
              >
                Get Access
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
                <p className="truncate px-3 pb-1 text-xs text-gray-400">{email}</p>
                <MobileLink href="/contacts" onClick={() => setMobileOpen(false)}>
                  Contacts
                </MobileLink>
                <MobileLink href="/billing" onClick={() => setMobileOpen(false)}>
                  Billing
                </MobileLink>
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
                  href="/#waitlist"
                  onClick={() => setMobileOpen(false)}
                  className="btn-gradient rounded-xl px-5 py-2 text-center text-sm font-medium text-navy-dark"
                >
                  Get Access
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
 * The "you-are-here" marker for the active app-bar tab: a static 2px teal underline.
 * Teal is the SYSTEM/brand color — the sentiment colors (mangrove/coral/gold) stay
 * reserved for data direction, so navigation never borrows them. Positioned against
 * the tab's own padding box (`inset-x-3` matches the tab's `px-3`), this is the
 * committed form of the hover-grown underline `HomeAnchor` uses, so the home bar and
 * the app bar share one wayfinding grammar.
 */
function ActiveMarker() {
  return (
    <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-teal-primary" aria-hidden />
  );
}

function HomeAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group relative text-gray-400 transition-colors hover:text-white">
      {children}
      <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-teal-primary transition-all group-hover:w-full" />
    </Link>
  );
}

function AccountLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
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
