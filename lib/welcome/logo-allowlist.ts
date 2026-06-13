/**
 * welcome/logo-allowlist — close the `?logo=` client-side tracking-pixel /
 * deanonymization vector on the prospect arrival page (`app/welcome/page.tsx`).
 *
 * The arrival URL carries `?logo=` (minted by `buildArrivalUrl` from `enrichBrand`,
 * which scrapes an arbitrary agent domain). The page renders it into `<img src>`,
 * so the VISITOR'S browser fetches it — an attacker who shares a crafted branded
 * link can log the victim's IP/UA, or spoof our branded header. The page's old
 * `safeUrl` only checked `^https?://` — any host passed.
 *
 * Fix = ALLOWLIST the permitted `<img src>` host (Option 2). Pure deny, no new
 * server-side fetch surface (a server-side proxy would manufacture the very SSRF
 * the audit item is named after). Until branded logos are re-hosted to our own
 * storage (the #2 arrival-wiring step), every external `?logo=` is dropped and the
 * page falls back to the SWFL text logo — the gate closes traffic-independently.
 *
 * Drop-in replacement for the page's local `safeUrl(first(params.logo))`.
 */

/**
 * Hosts whose images are safe to render on the branded arrival page. NOW: our own
 * site only (so any external agent-CDN `?logo=` is dropped → text fallback).
 *
 * #2 (re-host): when `enrichBrand` stores agent logos in OUR storage, add that
 * exact public host here (e.g. the Supabase Storage public bucket host or the
 * Vercel Blob host) so re-hosted branded logos pass — and ONLY that host, never a
 * broad wildcard. Match is exact-host or subdomain-of (`www.` is normalized away).
 */
export const LOGO_HOST_ALLOWLIST: readonly string[] = ["swfldatagulf.com"];

/**
 * Return a logo URL safe to put in `<img src>`, else null.
 * - Same-origin relative paths (`/logos/x.png`) pass (no cross-origin fetch) —
 *   this is the shape a re-hosted logo takes; `//host/…` protocol-relative is NOT
 *   treated as relative and must clear the host allowlist instead.
 * - Absolute URLs pass ONLY when http(s) AND the host is on the allowlist.
 * - Everything else (other schemes, unparseable, off-allowlist host) → null.
 */
export function safeLogoUrl(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  // Same-origin relative path (but not a protocol-relative "//host/…").
  if (v.startsWith("/") && !v.startsWith("//")) return v;

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const allowed of LOGO_HOST_ALLOWLIST) {
    const a = allowed.toLowerCase().replace(/^www\./, "");
    if (host === a || host.endsWith(`.${a}`)) return url.href;
  }
  return null;
}
