"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(typeof window !== "undefined" && window.history.length > 1);
  }, [pathname]);

  if (!BACK_BAR_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="print-hide sticky top-0 z-40 border-b border-white/10 bg-[#0a1419]/85 px-4 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => (canGoBack ? router.back() : router.push("/"))}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0a8078] transition-colors hover:text-[#00d4aa]"
        aria-label="Go back to the previous page"
      >
        <span aria-hidden="true">←</span> Back
      </button>
    </div>
  );
}
