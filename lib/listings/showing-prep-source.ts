// lib/listings/showing-prep-source.ts
//
// Four-lane, best-effort, NEVER-THROWS sourcing for a Showing Prep Packet. Runs
// the subject lane (resolveSubjectListing), the comps lane (compsForAddress), the
// map lane (geocode the subject + best-effort geocode each comp — Deviation #3: the
// comp source carries no lat/lon), the photo lane (best-effort enrich the top-N
// comps into one-sheets — the comp source carries no photo either), and the market
// snapshot lane (housing-swfl per ZIP). Every lane degrades independently; the
// returned ShowingPrepData is ALWAYS fully formed (empty, never absent) so the
// packet builds for every address. Nothing here invents a number.

import { resolveSubjectListing } from "@/lib/listings/resolve-subject";
import { compsForAddress, type CompResult, type RenderComp } from "@/lib/assistant/comp-helper";
import { geocodeAddress, type GeocodedAddress } from "@/lib/geo/geocode-address";
import { marketSnapshotForZip, type MarketSnapshot } from "./market-snapshot";
import type { MapPin } from "./listings-map";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export interface CompOneSheet {
  comp: RenderComp;
  photoUrl: string;
}

export interface ShowingPrepData {
  address: string;
  subject: ListingFacts | null;
  subjectPin: MapPin | null;
  zip: string | null;
  comps: RenderComp[];
  oneSheets: CompOneSheet[];
  compPins: MapPin[];
  snapshot: MarketSnapshot | null;
  asOf: string;
}

export interface GatherDeps {
  geocode?: (text: string) => Promise<GeocodedAddress | null>;
  resolveSubject?: (address: string) => Promise<ListingFacts | null>;
  comps?: (address: string) => Promise<CompResult>;
  snapshot?: (zip: string) => Promise<MarketSnapshot | null>;
  /** Best-effort photo for a comp's one-sheet — defaults to resolving the comp
   *  address to its own for-sale record (which carries a photo). */
  enrichPhoto?: (comp: RenderComp) => Promise<string | null>;
  /** How many top comps to photo-enrich into one-sheets (default 3). */
  photoEnrichN?: number;
}

/** Best-effort: resolve a comp address to its own listing photo. Bounded + cached
 *  downstream (resolveSubjectListing hour-caches its SteadyAPI call). Null on any miss. */
async function defaultEnrichPhoto(comp: RenderComp): Promise<string | null> {
  const facts = await resolveSubjectListing(`${comp.addressLine}, ${comp.city}, FL`).catch(
    () => null,
  );
  return facts?.photos[0] ?? null;
}

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export async function gatherShowingPrepData(
  address: string,
  deps: GatherDeps = {},
): Promise<ShowingPrepData> {
  const addr = String(address ?? "").trim();
  const geocode = deps.geocode ?? geocodeAddress;
  const resolveSubject = deps.resolveSubject ?? resolveSubjectListing;
  const comps = deps.comps ?? compsForAddress;
  const snapshot = deps.snapshot ?? marketSnapshotForZip;
  const enrichPhoto = deps.enrichPhoto ?? defaultEnrichPhoto;
  const photoEnrichN = deps.photoEnrichN ?? 3;

  // Lanes run concurrently; each degrades to its own empty value on miss/throw.
  const [geo, subject, compResult] = await Promise.all([
    safe(Promise.resolve(geocode(addr)), null as GeocodedAddress | null),
    safe(Promise.resolve(resolveSubject(addr)), null as ListingFacts | null),
    safe(Promise.resolve(comps(addr)), { comps: [], asOf: "", needs: [] } as CompResult),
  ]);

  const zip = geo?.zip ?? subject?.zip ?? null;
  const subjectPin: MapPin | null =
    geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)
      ? { lat: geo.lat, lon: geo.lon, role: "subject" }
      : null;

  const allComps = compResult.comps ?? [];

  // Map lane — best-effort geocode each comp (no Steady cost). A comp that fails to
  // geocode simply isn't pinned; the map still renders the subject + whatever resolved.
  const compGeos = await Promise.all(
    allComps.map((c) => safe(Promise.resolve(geocode(`${c.addressLine}, ${c.city}, FL`)), null)),
  );
  const compPins: MapPin[] = compGeos
    .filter((g): g is GeocodedAddress => !!g && Number.isFinite(g.lat) && Number.isFinite(g.lon))
    .map((g) => ({ lat: g.lat, lon: g.lon, role: "comp" as const }));

  // Photo lane — best-effort enrich the top-N comps into one-sheets. A comp with no
  // photo is simply absent from oneSheets and lands in the comparison grid (Task 5).
  const topN = allComps.slice(0, photoEnrichN);
  const enriched = await Promise.all(
    topN.map(async (c) => {
      const photoUrl = await safe(Promise.resolve(enrichPhoto(c)), null);
      return photoUrl ? ({ comp: c, photoUrl } as CompOneSheet) : null;
    }),
  );
  const oneSheets = enriched.filter((o): o is CompOneSheet => o !== null);

  const snap = zip ? await safe(Promise.resolve(snapshot(zip)), null) : null;

  return {
    address: addr,
    subject,
    subjectPin,
    zip,
    comps: allComps,
    oneSheets,
    compPins,
    snapshot: snap,
    asOf: compResult.asOf || "",
  };
}
