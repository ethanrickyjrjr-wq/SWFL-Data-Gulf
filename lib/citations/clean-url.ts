/**
 * citations/clean-url — THE root for turning any stored source URL + label into a
 * safe, human-readable citation. Every citation surface (the CitationList box, the
 * per-metric pills, the deliverable footer) routes through `cleanCitation` so the
 * strip/rewrite/label rules live in exactly ONE place — change them here, every page
 * updates.
 *
 * Rules (in order):
 *   1. Internal host/string (*.supabase.co, amazonaws, data_lake, localhost, .internal)
 *      → NO link, label only.
 *   2. Not a renderable href (not http(s)://, not a site-relative "/path") → NO link.
 *   3. Known vendor API host → rewrite to its public landing page + link
 *      (api.bls.gov → bls.gov/data, api.census.gov → data.census.gov).
 *   4. Internal API *path* (/rest/v1/, /publicAPI/, /api/) with no known host → NO link.
 *   5. Otherwise linkable (our own /r/* pages + generic external URLs).
 *   6. Label is ALWAYS human: a trusted source_label, else the decoded ?label= param
 *      (kills the /r/source/?label=… query-string wall), else hostDomain(href), else
 *      "Source". Never the raw URL, never a query string.
 *
 * Depends only on the zero-dependency leaf `./internal-markers` (isInternalSource,
 * hostDomain) — importable from "use client" components without dragging in any server
 * graph, and with NO import cycle back to frames.ts (frames.ts imports cleanCitation).
 */
import { hostDomain, isInternalSource } from "./internal-markers";

export interface RawCitation {
  /** Stored source URL — may be internal, an API endpoint, relative, or garbage. */
  url?: string | null;
  /** source_label / citation — may itself be a raw URL (untrusted). */
  label?: string | null;
  /** "source" | "report" | "metric" | "table_slice" | "frame" — passthrough only. */
  origin_kind?: string;
}

export interface CleanCitation {
  /** false → render plain text label only (internal / no safe href). */
  linkable: boolean;
  /** Set only when linkable; may be a rewritten public host. */
  href?: string;
  /** Human-readable; never a raw URL, never a query string. */
  label: string;
  /**
   * true when the source is OUR lake (supabase / data_lake / internal API). The data
   * came from us, so the surface should brand it ("SWFL Data Gulf" / logo) rather than
   * show a meaningless "Source". Distinguishes an internal citation from a generic
   * non-linkable external one (which stays "Source").
   */
  is_internal: boolean;
  origin_kind?: string;
}

/** Brand label for an internal source with no honest upstream-publisher label. */
const BRAND_LABEL = "SWFL Data Gulf";

/** Base for parsing site-relative URLs ("/r/source/…") with the URL API. */
const RELATIVE_BASE = "https://swfldatagulf.local";

/** Vendor API hosts whose raw endpoint is not a human page → public landing page. */
const API_HOST_REWRITES: Record<string, string> = {
  "api.bls.gov": "https://www.bls.gov/data/",
  "api.census.gov": "https://data.census.gov",
};

/** A value we are willing to render as an href: absolute http(s) or a site-relative path. */
function isRenderableHref(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

/** A label we trust as human text: not a URL/path, not an internal marker. */
function humanLabel(rawLabel: string): string {
  if (!rawLabel) return "";
  if (/^https?:\/\//i.test(rawLabel) || rawLabel.startsWith("/")) return "";
  if (isInternalSource(rawLabel)) return "";
  return rawLabel;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url, RELATIVE_BASE).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Path-segment API markers — internal endpoints we never link to directly. */
function isInternalApiPath(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("/rest/v1/") || u.includes("/publicapi/") || /\/api\//.test(u);
}

/** Decoded `?label=` query param, if any (the /r/source provenance label). */
function labelParam(url: string): string {
  try {
    return new URL(url, RELATIVE_BASE).searchParams.get("label")?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Bare-host labels a reader shouldn't see → the publisher's real name. */
const HOST_LABELS: Record<string, string> = {
  "files.zillowstatic.com": "Zillow Research",
  "zillowstatic.com": "Zillow Research",
};

/** Internal-ops citation strings → customer language (operator 07/19: scrape
 *  tooling, SQL table names, license notes, and ranking mechanics leaked into a
 *  real send's sources list). This is the DISPLAY cleanup at the ONE citation
 *  root — the stored strings still deserve fixing at their pipeline roots
 *  (check `citation_ops_strings_at_roots`), but every surface renders clean
 *  from tonight. Dates found in the original ride along as MM/DD/YYYY. */
const OPS_REWRITES: { match: RegExp; label: string; keepAsOf?: boolean }[] = [
  {
    match: /^Lee County Accela Citizen Access/,
    label: "Lee County Accela Citizen Access — official building permit records, updated daily",
  },
  {
    match: /^Collier County Building Permits — monthly XLSX/,
    label: "Collier County Building Permits — official monthly permit records",
  },
  {
    match: /^Data provided by Realtor\.com/,
    label:
      "Data provided by Realtor.com — Economic Research Data Library (ZIP-level inventory & market hotness, monthly)",
  },
  {
    match: /^Active SWFL rental listings/,
    label: "Active SWFL rental listings, tracked by SWFL Data Gulf",
    keepAsOf: true,
  },
  {
    match: /^SWFL for-sale listing momentum/,
    label: "SWFL for-sale listing momentum",
    keepAsOf: true,
  },
  {
    match: /^SWFL per-ZIP market snapshot/,
    label: "SWFL ZIP market snapshot (Realtor.com monthly data)",
    keepAsOf: true,
  },
];

function displayLabel(label: string): string {
  const host = HOST_LABELS[label.toLowerCase()];
  if (host) return host;
  for (const r of OPS_REWRITES) {
    if (r.match.test(label)) {
      const iso = label.match(/(\d{4})-(\d{2})-(\d{2})/);
      const asOf = r.keepAsOf && iso ? `, as of ${iso[2]}/${iso[3]}/${iso[1]}` : "";
      return `${r.label}${asOf}`;
    }
  }
  // Trailing ranking-mechanics clause (MHS Data Book) — trim, keep the source.
  return label.replace(/ — site ZIP from each permit's project address.*$/, "");
}

export function cleanCitation(raw: RawCitation): CleanCitation {
  const url = (raw.url ?? "").trim();
  const human = displayLabel(humanLabel((raw.label ?? "").trim()));
  const origin_kind = raw.origin_kind;
  const noLink = (label: string, is_internal: boolean): CleanCitation => ({
    linkable: false,
    label,
    is_internal,
    origin_kind,
  });

  // 1. internal host/string → never link; brand it as ours (keep an upstream label if any).
  if (!url || isInternalSource(url)) {
    // An empty url is unusable, not ours → generic "Source"; a real internal url → brand.
    return url ? noLink(human || BRAND_LABEL, true) : noLink(human || "Source", false);
  }
  // 2. not a renderable href (garbage) → generic non-linkable, not branded.
  if (!isRenderableHref(url)) return noLink(human || "Source", false);

  // 3. known vendor API host → rewrite to its public landing page.
  const rewrite = API_HOST_REWRITES[hostnameOf(url)];
  if (rewrite) {
    return {
      linkable: true,
      href: rewrite,
      label: human || hostDomain(rewrite) || "Source",
      is_internal: false,
      origin_kind,
    };
  }

  // 4. internal API path with no known public host → strip the link; brand it as ours.
  if (isInternalApiPath(url)) return noLink(human || BRAND_LABEL, true);

  // 5/6. linkable external/our-own page; label = human → ?label= param → clean host → "Source".
  const label = human || displayLabel(labelParam(url) || hostDomain(url)) || "Source";
  return { linkable: true, href: url, label, is_internal: false, origin_kind };
}

/** Clean a list, dropping nothing but de-duplicating by resolved href (or label, when unlinked). */
export function cleanCitations(raws: RawCitation[]): CleanCitation[] {
  const seen = new Set<string>();
  const out: CleanCitation[] = [];
  for (const raw of raws) {
    const c = cleanCitation(raw);
    const key = c.href ?? `label:${c.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
