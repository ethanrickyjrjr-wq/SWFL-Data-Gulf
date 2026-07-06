import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { NavigationGuardProvider } from "nextjs-nav-guard";
import { BriefcaseProvider } from "@/components/briefcase/BriefcaseProvider";
import { AppShell } from "@/components/briefcase/AppShell";
import { SiteShell } from "@/components/nav/SiteShell";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { ResetZoomOnRouteChange } from "@/components/nav/ResetZoomOnRouteChange";
import { StandaloneBackBar } from "@/components/nav/StandaloneBackBar";
import { highlighterUiEnabled } from "@/lib/highlighter/flag";
import { HighlighterProvider } from "@/lib/highlighter/context";
import { GlobalHighlighter } from "@/components/highlighter/GlobalHighlighter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.swfldatagulf.com"),
  title: {
    default: "SWFL Data Gulf — Southwest Florida Intelligence",
    template: "%s — SWFL Data Gulf",
  },
  description:
    "Public intelligence for Lee and Collier County operators — flood, freight, permits, rents, demographics, and macro signal, in one read.",
};

// Explicit base viewport — pinch-zoom stays enabled; ResetZoomOnRouteChange
// restores to this string after each in-app navigation's zoom reset.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
  accountModal,
}: Readonly<{
  children: React.ReactNode;
  /** @accountModal parallel slot — /account/* intercepted as modals over the
   *  current page (spec 2026-07-05-account-quick-access); default.tsx = null. */
  accountModal: React.ReactNode;
}>) {
  // Plain env read (not a dynamic API) — keeps the layout static. Gates the whole
  // highlighter root (provider + GlobalHighlighter) and tells AppShell whether a /r/*
  // bridged pill can appear (flag ON) or whether it is the /r/* standalone fallback.
  const highlighterEnabled = highlighterUiEnabled();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* NavigationGuardProvider (nextjs-nav-guard) intercepts App Router nav so
            useLeaveGuard can raise a Save/Leave/Cancel dialog for unsaved lab work
            (spec 2026-07-06 §D). Fork of the unmaintained LayerX package; Next 16.2+. */}
        <NavigationGuardProvider>
          {/* BriefcaseProvider owns the anonymous draft globally (A-2) so the unified
              pill + highlighter both file into it on every page, on or off /r/*. */}
          <Toaster theme="dark" position="bottom-right" richColors />
          <BriefcaseProvider>
            {/* Reset mobile pinch-zoom to fit-width on every in-app navigation. */}
            <ResetZoomOnRouteChange />
            {/* "← Back" for white-label pages (/p/*, /embed/*) that render no nav shell. */}
            <StandaloneBackBar />
            {/* B1: the ONE auth-aware nav shell — home variant on `/`, solid app bar
              everywhere else, nothing on the white-label/auth prefixes. Replaces the
              old split (Header on `/` only + GlobalNav elsewhere) that sealed home. */}
            <SiteShell />
            {/* Account route-modals (Brand / Email Schedule) — render over whatever
              page is active; soft-nav keeps that page mounted underneath. */}
            {accountModal}
            {/* Phase 3C — the highlighter is now the app-root, selection-triggered twin of
              the click-triggered pill. HighlighterProvider (chipFact + conversation thread)
              is LIFTED here from the 5 per-/r/* pages, so GlobalHighlighter + the bridged
              AppShell pill share ONE thread across the whole site. The flag gates the entire
              root: when OFF, no provider mounts (MetricsTable falls back to plain spans, no
              dead FactChips) and AppShell renders only its standalone fallback. */}
            {highlighterEnabled ? (
              <HighlighterProvider>
                {children}
                {/* The ONE global footer sitemap, suppressed on the white-label/auth prefixes. */}
                <SiteFooter />
                {/* The ONE highlighter — popup + coachmark + ticker only, NO pill. */}
                <GlobalHighlighter />
                {/* The ONE pill — bridged on /r/* (report context published), else standalone. */}
                <AppShell />
              </HighlighterProvider>
            ) : (
              <>
                {children}
                <SiteFooter />
                <AppShell />
              </>
            )}
          </BriefcaseProvider>
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
