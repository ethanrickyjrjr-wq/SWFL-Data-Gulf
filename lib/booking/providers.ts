// lib/booking/providers.ts — THE one root for "what can this booking link do?"
//
// An agent pastes ONE provider-agnostic booking link (saved under the `booking`
// button role, lib/email/button-destinations.ts). This module answers what that
// link can carry in a plain <a href> — the only mechanism email allows.
//
// Every param here is vendor-documented, none remembered (RULE 0.4). Sources,
// all fetched 08/19/2026 via crawl4ai:
// - cal.com date/month/slot + name/email read off the URL by the booker on load:
//   _RESEARCH/competitor-and-strategy/2026-08-19-calcom-booking-url-params.md
// - Calendly prefill-only (name/email/a1..a10) — NO date/slot param exists:
//   _RESEARCH/competitor-and-strategy/2026-08-19-calendly-embed-and-params.md
// - Acuity datetime= / SavvyCal from= / everyone else plain-link-only:
//   _RESEARCH/competitor-and-strategy/2026-08-19-booking-link-provider-landscape.md
//
// PURE — no I/O, no Date.now. Callers pass slots; slot fetching lives in
// calcom-slots.ts. Degrade, never refuse: an unknown provider or unparseable URL
// passes through untouched — a working plain link beats a broken clever one.

export type BookingProvider =
  | "calcom"
  | "calendly"
  | "acuity"
  | "savvycal"
  | "tidycal"
  | "google"
  | "zoho"
  | "square"
  | "microsoft"
  | "unknown";

/** What a plain link can preselect: an exact time, a date, or just the page. */
export type SlotLinkFidelity = "slot" | "date" | "page";

/** Host-exact or dot-suffix match — "cal.com.evil.co" must NOT read as cal.com,
 *  the same lookalike rule isPlatformDestination pins in button-destinations.ts. */
const hostMatches = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const PROVIDER_DOMAINS: ReadonlyArray<[string, BookingProvider]> = [
  ["cal.com", "calcom"],
  ["calendly.com", "calendly"],
  ["acuityscheduling.com", "acuity"],
  ["as.me", "acuity"],
  ["savvycal.com", "savvycal"],
  ["tidycal.com", "tidycal"],
  ["calendar.app.google", "google"],
  ["calendar.google.com", "google"],
  ["bookings.zoho.com", "zoho"],
  ["square.site", "square"],
  ["outlook.office.com", "microsoft"],
  ["outlook.office365.com", "microsoft"],
];

export function detectBookingProvider(url: unknown): BookingProvider {
  if (typeof url !== "string" || url.trim() === "") return "unknown";
  let hostname: string;
  try {
    hostname = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  for (const [domain, provider] of PROVIDER_DOMAINS) {
    if (hostMatches(hostname, domain)) return provider;
  }
  return "unknown";
}

/** Per-vendor documented ceiling. Everything undocumented is "page" — a guessed
 *  param is an invented contract (the no-invention rule applied to URLs). */
const FIDELITY: Record<BookingProvider, SlotLinkFidelity> = {
  calcom: "slot",
  acuity: "slot",
  savvycal: "date",
  calendly: "page",
  tidycal: "page",
  google: "page",
  zoho: "page",
  square: "page",
  microsoft: "page",
  unknown: "page",
};

export function slotFidelity(provider: BookingProvider): SlotLinkFidelity {
  return FIDELITY[provider];
}

/** "YYYY-MM-DD" of a UTC instant in a display zone — en-CA formats ISO-style,
 *  the same idiom lib/project/schedule-calendar.ts pins for ET dates. */
function dateInZone(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Deep-link one concrete time into a saved booking link. Query params are ADDED;
 * origin and path are never touched — the deep link must remain a refinement of
 * the saved destination so the brand overlay keeps it
 * (isDestinationRefinement, lib/email/button-destinations.ts).
 */
export function slotDeepLink(args: {
  bookingUrl: string;
  /** UTC instant, ISO-8601. cal.com matches it against real availability only —
   *  it preselects, never invents a slot. */
  slotStartISO: string;
  /** Zone the reader sees — cal.com's date/month params are calendar-screen
   *  coordinates and must be the DISPLAY date, not the UTC date. */
  timeZone: string;
}): string {
  const provider = detectBookingProvider(args.bookingUrl);
  if (slotFidelity(provider) === "page") return args.bookingUrl;
  let u: URL;
  try {
    u = new URL(args.bookingUrl.trim());
  } catch {
    return args.bookingUrl;
  }
  const date = dateInZone(args.slotStartISO, args.timeZone);
  if (!date) return args.bookingUrl;
  if (provider === "calcom") {
    u.searchParams.set("date", date);
    u.searchParams.set("month", date.slice(0, 7));
    u.searchParams.set("slot", args.slotStartISO);
  } else if (provider === "acuity") {
    u.searchParams.set("datetime", args.slotStartISO);
  } else if (provider === "savvycal") {
    u.searchParams.set("from", date);
  }
  return u.toString();
}

/** Human names for the card/UI. "unknown" stays vendor-neutral. */
const PROVIDER_LABELS: Record<BookingProvider, string> = {
  calcom: "Cal.com",
  calendly: "Calendly",
  acuity: "Acuity Scheduling",
  savvycal: "SavvyCal",
  tidycal: "TidyCal",
  google: "Google Calendar",
  zoho: "Zoho Bookings",
  square: "Square Appointments",
  microsoft: "Microsoft Bookings",
  unknown: "your scheduler",
};

export function providerLabel(provider: BookingProvider): string {
  return PROVIDER_LABELS[provider];
}

/** Providers whose docs accept `name`/`email` on a bare link. Calendly:
 *  prefill doc's own variable list; cal.com: booker store reads both. */
const PREFILL_PROVIDERS: ReadonlySet<BookingProvider> = new Set(["calcom", "calendly"]);

export function prefillLink(
  bookingUrl: string,
  invitee: { name?: string | null; email?: string | null },
): string {
  const provider = detectBookingProvider(bookingUrl);
  if (!PREFILL_PROVIDERS.has(provider)) return bookingUrl;
  let u: URL;
  try {
    u = new URL(bookingUrl.trim());
  } catch {
    return bookingUrl;
  }
  const name = invitee.name?.trim();
  const email = invitee.email?.trim();
  if (name) u.searchParams.set("name", name);
  if (email) u.searchParams.set("email", email);
  return u.toString();
}
