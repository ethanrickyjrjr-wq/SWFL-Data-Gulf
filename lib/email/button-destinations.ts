// lib/email/button-destinations.ts — THE one root for "where does this button go?"
//
// Operator decree 08/03/2026: *"the agent can change all links and should be able to
// save that in their brand. We don't want anyone coming to our site unless they need
// to or we are activly marketing to."* (docs/standards/emails.md §0.1d.)
//
// WE ARE WHITE-LABEL INFRASTRUCTURE, NOT A TRAFFIC DESTINATION. A click that lands on
// swfldatagulf.com from a client's send competes with the person we sell to. Our page
// is the FALLBACK rung, never the preference — and for `listing` it is not a rung at all.
//
// WHAT THIS REPLACES: `apply-brand.ts` rewrote EVERY non-mailto button to the single
// brand `website_url`. Right direction (agent wins), wrong granularity — an agent could
// not give the community button one destination and a booking button another, and a
// community button aimed at our page was silently clobbered to their homepage the moment
// they saved a website. Destinations here are keyed by ROLE, so they survive a relabel
// (operator pick 08/03/2026: "the saved website follows it" = the URL follows the rename).
//
// PURE — no I/O, no React, no doc mutation. Callers assemble the rungs they hold.
//
// OUTSIDE EVIDENCE (crawl4ai, 08/03/2026) — why label↔destination coherence is a real
// constraint and not taste: Gmail's sender guidelines require that "Web links in the
// message body should be visible and easy to understand. Recipients should know what to
// expect when they click a link" (support.google.com/a/answer/81126). A button labeled
// "Find Out More About This Community" that resolves to a homepage violates that, which
// is why `usesWebsiteDefault` is false for every role whose meaning a homepage cannot carry.

/** Hosts we own. Mirrors PLATFORM_HOSTS in lib/deliverable/url-lint.ts — that module
 *  gates minted URLs at compile time; this one decides destinations at author time. */
const PLATFORM_HOSTS: ReadonlySet<string> = new Set(["swfldatagulf.com", "www.swfldatagulf.com"]);

export interface ButtonRoleMeta {
  role: string;
  /** Shown in the brand editor's destination list. */
  label: string;
  /**
   * May the brand's generic `website_url` stand in when nothing is saved for this role?
   * TRUE only where a homepage genuinely answers the button's promise. FALSE for
   * `community` (a homepage is not a community page) and `listing` (a homepage is not
   * THIS house) — falling back there silently mis-sends readers, which is the exact
   * granularity bug this module exists to fix.
   */
  usesWebsiteDefault: boolean;
  /** May our own page serve as the last rung? FALSE for `listing`: we hold only a
   *  realtor.com permalink, which is banned from rendered docs (resolve-subject.ts)
   *  and parks OTHER agents beside our client's house. Open slot beats a bad link. */
  usesHouseFallback: boolean;
}

/** Keyed Record, not a bare union: adding a role FORCES you to route it, the same
 *  forcing function `FontFamily` uses in lib/email/lab/capabilities.ts. */
export const BUTTON_ROLES = {
  "primary-cta": {
    role: "primary-cta",
    label: "Main call to action",
    usesWebsiteDefault: true,
    usesHouseFallback: true,
  },
  community: {
    role: "community",
    label: "Community / neighborhood",
    usesWebsiteDefault: false,
    usesHouseFallback: true,
  },
  listing: {
    role: "listing",
    label: "This listing",
    usesWebsiteDefault: false,
    usesHouseFallback: false,
  },
  booking: {
    role: "booking",
    label: "Book / schedule",
    usesWebsiteDefault: true,
    usesHouseFallback: false,
  },
  unsubscribe: {
    role: "unsubscribe",
    label: "Unsubscribe",
    usesWebsiteDefault: false,
    usesHouseFallback: true,
  },
} as const satisfies Record<string, ButtonRoleMeta>;

export type ButtonRole = keyof typeof BUTTON_ROLES;

export const BUTTON_ROLE_KEYS = Object.keys(BUTTON_ROLES) as ButtonRole[];

export function isButtonRole(v: unknown): v is ButtonRole {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(BUTTON_ROLES, v);
}

export type SavedDestinations = Partial<Record<ButtonRole, string>>;

/** Which rung answered. `open-slot` means NOTHING answered — the button must be
 *  flagged for the agent, never shipped pointing at a house or dead URL. */
export type DestinationRung = "authored" | "saved-role" | "website" | "house" | "open-slot";

export interface DestinationResult {
  url: string | null;
  rung: DestinationRung;
}

const has = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

/** True when a URL points at a host WE own. Host-exact — a lookalike host that merely
 *  CONTAINS our domain ("swfldatagulf.com.evil.co") is somebody else's site. */
export function isPlatformDestination(url: unknown): boolean {
  if (!has(url)) return false;
  try {
    return PLATFORM_HOSTS.has(new URL(url.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The §3.4 fail-confirm predicate. A button resolving to OUR site, in a doc built by a
 * user who HAS a brand, must raise a confirm before it ships.
 *
 * SCOPE IS THE WHOLE POINT: only when the user has a brand. Our own house sends and
 * brandless previews must not nag. And this is a CONFIRM, not a block — an agent who
 * deliberately chooses our page is allowed to (§0.1d), so nothing here rewrites a URL
 * in either direction.
 */
export function needsHouseConfirm(args: {
  url: unknown;
  hasBrand: boolean;
  /**
   * The agent's OWN brand website. When the destination sits on this same host there
   * is nothing to confirm — it IS their site.
   *
   * Operator, 08/04/2026: *"yes, our sends are branded to us, unless we change it
   * beforehand."* Our own brand website is swfldatagulf.com, so a trigger of merely
   * "the user has a brand" would have nagged on every house send. The confirm exists
   * to catch a LEAK — a client's send pointing at US while their brand points
   * elsewhere. Comparing hosts handles our own account with no exemption list and no
   * hardcoded account id, and survives a domain move.
   */
  brandWebsiteUrl?: unknown;
}): boolean {
  if (!args.hasBrand || !isPlatformDestination(args.url)) return false;
  return !sameHost(args.url, args.brandWebsiteUrl);
}

/** Host-exact comparison, both sides parsed. Anything unparseable is NOT a match —
 *  a confirm shown in error costs a click; one skipped in error ships the leak. */
function sameHost(a: unknown, b: unknown): boolean {
  if (!has(a) || !has(b)) return false;
  try {
    return new URL(a.trim()).hostname.toLowerCase() === new URL(b.trim()).hostname.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * A deep link INTO a destination is still that destination. True when `url` and
 * `base` share host + path and differ only in query/hash — the shape
 * lib/booking/time-buttons.ts emits (slot params ADDED to the saved booking
 * link, path untouched, by construction). The brand overlay uses this to keep a
 * time-offer button's slot params instead of stripping them back to the bare
 * saved link. A different path is a different promise; anything unparseable is
 * NOT a refinement — when unsure, the ladder wins.
 */
export function isDestinationRefinement(url: unknown, base: unknown): boolean {
  if (!has(url) || !has(base)) return false;
  try {
    const a = new URL(url.trim());
    const b = new URL(base.trim());
    const strip = (p: string) => p.replace(/\/+$/, "");
    return (
      a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
      strip(a.pathname) === strip(b.pathname)
    );
  } catch {
    return false;
  }
}

/** The brand-blob key the per-role destination map is saved under. snake_case to match
 *  every other branding field (website_url, business_address, …). */
export const BRAND_DESTINATIONS_KEY = "button_destinations";

/** The UPPER token name a role's saved destination travels under, e.g.
 *  `primary-cta` → `BUTTON_DEST_PRIMARY_CTA`. `applyBrand` reads a flat
 *  `Record<string,string>` token map, so the per-role map has to flatten into it —
 *  the same pass-through shape SOCIAL_TOKENS uses in branding-to-tokens.ts. */
export function destinationTokenKey(role: ButtonRole): string {
  return `BUTTON_DEST_${role.toUpperCase().replace(/-/g, "_")}`;
}

/** Rebuild the per-role map from a flat brand-token record — the inverse of
 *  `destinationTokenKey`, for consumers (applyBrand) that hold only tokens. */
export function savedDestinationsFromTokens(
  t: Record<string, string> | undefined,
): SavedDestinations {
  if (!t) return {};
  const out: SavedDestinations = {};
  for (const role of BUTTON_ROLE_KEYS) {
    const v = t[destinationTokenKey(role)];
    if (has(v)) out[role] = v.trim();
  }
  return out;
}

/** The role a button resolves under when it carries none. Every pre-existing saved doc
 *  is in this case (the field postdates them), and so is any block a user drags in by
 *  hand — so the default has to be the one role whose meaning a homepage CAN answer. */
export const DEFAULT_BUTTON_ROLE: ButtonRole = "primary-cta";

/** Coerce whatever a doc carries in `props.role` into a real role. */
export function buttonRoleOf(v: unknown): ButtonRole {
  return isButtonRole(v) ? v : DEFAULT_BUTTON_ROLE;
}

/** Read the per-role destination map off a brand blob. Tolerant by contract: a missing
 *  map, a blank value, or a key that is not a real role all yield nothing rather than
 *  throwing — branding must never block a build. */
export function roleDestinationsFromBrand(brand: unknown): SavedDestinations {
  const raw = (brand as Record<string, unknown> | null)?.[BRAND_DESTINATIONS_KEY];

  // A jsonb column does NOT arrive in one shape. PostgREST (the app path) parses it
  // into an object; the raw Postgres driver we use in scripts/migrations hands back
  // the JSON TEXT. Caught 08/04/2026 by writing a real destination onto a real profile
  // and watching every token come back missing — the object check silently rejected a
  // perfectly good string, so `community` resolved to an open slot and `booking`
  // wrongly took the homepage. Accepting both is the fix; assuming one is the bug.
  let map: unknown = raw;
  if (typeof raw === "string") {
    try {
      map = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out: SavedDestinations = {};
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (isButtonRole(k) && has(v)) out[k] = v.trim();
  }
  return out;
}

/**
 * Resolve one button's destination. Order (handoff §3.2 — ours is LAST):
 *   1. authored  — what the user set on THIS build, including an engine-set `mailto:`
 *                  reply CTA, which must survive the overlay (regression pinned in test).
 *   2. saved-role — the agent's saved destination for this ROLE, from brand. Keyed by
 *                  role, so a relabel carries the URL along.
 *   3. website   — brand `website_url`, but ONLY for roles a homepage can honestly answer.
 *   4. house     — our page, last, and never for `listing`.
 *   5. open-slot — nothing. The caller flags it; it does NOT ship a dead or house URL.
 */
export function resolveButtonDestination(args: {
  role: ButtonRole;
  /** The url already on the block for this build (user-typed or engine-set). */
  authoredUrl?: string | null;
  saved?: SavedDestinations;
  websiteUrl?: string | null;
  /** Our own page for this button's subject, when one exists. */
  housePage?: string | null;
  /** Accepted so callers can pass it without a second lookup; deliberately UNUSED in
   *  resolution — binding by label is what the operator rejected on 08/03/2026. */
  label?: string;
}): DestinationResult {
  const meta = BUTTON_ROLES[args.role];
  if (has(args.authoredUrl)) return { url: args.authoredUrl.trim(), rung: "authored" };

  const saved = args.saved?.[args.role];
  if (has(saved)) return { url: saved.trim(), rung: "saved-role" };

  if (meta.usesWebsiteDefault && has(args.websiteUrl)) {
    return { url: args.websiteUrl.trim(), rung: "website" };
  }
  if (meta.usesHouseFallback && has(args.housePage)) {
    return { url: args.housePage.trim(), rung: "house" };
  }
  return { url: null, rung: "open-slot" };
}
