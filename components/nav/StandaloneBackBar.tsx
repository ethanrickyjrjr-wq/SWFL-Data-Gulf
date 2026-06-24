"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * A "← Back" control for the white-label content pages that render with NO nav
 * shell (`/p/*` deliverables, `/embed/*`). On those pages SiteShell renders
 * nothing, and a public viewer has no way back — so this is their only return
 * path. `router.back()` returns to wherever they came from (the page they were
 * on), with a homepage fallback when the page was opened cold via a direct link.
 *
 * Mounted once in the root layout, so it covers every such page at once.
 * (`/login` & `/auth` run their own flows, so they're excluded.)
 */
const BACK_BAR_PREFIXES = ["/p/", "/embed/"];

export function StandaloneBackBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (!BACK_BAR_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Decided at click time (no effect/state): if there's history, go back to
  // where they were; otherwise (cold direct-link open) fall back to home.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="print-hide sticky top-0 z-40 border-b border-white/10 bg-[#0a1419]/85 px-4 py-2 backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gulf-teal transition-colors hover:text-gulf-teal"
        aria-label="Go back to the previous page"
      >
        <span aria-hidden="true">←</span> Back
      </button>
    </div>
  );
}
