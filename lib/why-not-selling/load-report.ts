// lib/why-not-selling/load-report.ts — the one impure orchestrator for the Why Isn't It
// Selling report. Assembles every check input (subject row, ZIP aggregates via the three
// wins SQL functions, published sold-side/momentum reads, cut history, parcel anchor,
// ZHVI comparator, relist fact) and runs the seven checks in spec order. Every read is
// injectable (WinsDeps) and every default is empty-tolerant: a failed read → that input
// null → its check `unavailable` → omitted. The loader itself returns null ONLY for an
// empty / unresolvable / out-of-scope query — the route then renders the plain ask.
//
// KNOWN-DEBT(data_lake): listing_dom + the wins functions live in the data_lake schema,
// which the typed Supabase client intentionally does not cover (service-role.ts).
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { resolveQToZip, BARE_ZIP } from "@/app/r/_components/resolve-q";
import type { GeocodeFn } from "@/lib/geo/geocode-address";
import { addressKey } from "@/lib/listings/address-key";
import { normalizeTypedUnits } from "@/lib/listings/typed-address";
import { healFlooredRows, type LakeListingRow } from "@/lib/listings/select";
import { isCoreScope } from "@/refinery/lib/core-scope.mts";
import { cityForZip } from "@/lib/swfl-zip-city";
import { loadParsedBrain } from "@/lib/fetch-brain";
import {
  loadMarketSnapshot,
  asOfMdy,
  type MarketSnapshot,
} from "../should-i-sell/load-market-snapshot";
import { resolveRelistFact, type RelistFact } from "../back-on-market/relist-fact";
import { loadCutHistory } from "./cut-history";
import { loadParcelFact } from "./parcel-read";
import { loadZhviChange } from "./zhvi-change";
import { marketSpeed } from "./checks/market-speed";
import { cumulativeTime } from "./checks/cumulative-time";
import { priceCuts } from "./checks/price-cuts";
import { pricePosition } from "./checks/price-position";
import { anchorGap } from "./checks/anchor-gap";
import { competition } from "./checks/competition";
import { crossCheck } from "./checks/cross-check";
import { MIN_ZIP_SAMPLE } from "./types";
import type {
  BandRow,
  CheckFigure,
  CheckResult,
  CutEvent,
  ParcelFact,
  PricePosition,
  StaleShare,
  SubjectHome,
  ZhviChange,
  ZipDomMedian,
} from "./types";

/** The subject row exactly as the listing_dom fetch returns it (plan §Task 7). */
export interface SubjectRow {
  address_key: string | null;
  street_address: string | null;
  city: string | null;
  county: string | null;
  zip_code: string | null;
  list_price: number | null;
  sqft: number | null;
  status: string | null;
  state: string | null;
  sale_or_rent: string | null;
  dom_days: number | null;
  dom_is_floor: boolean | null;
  cdom_days: number | null;
  listed_date: string | null;
  property_id: string | null;
}

export interface WinsDeps {
  geocode?: GeocodeFn;
  fetchSubject: (addressKey: string) => Promise<SubjectRow | null>;
  heal: (rows: SubjectRow[]) => Promise<void>;
  fetchZipMedian: (zip: string) => Promise<{ median_dom: number | null; sample_size: number }>;
  fetchBands: (zip: string) => Promise<
    {
      band: number;
      price_lo: number;
      price_hi: number;
      median_dom: number | null;
      sample_size: number;
    }[]
  >;
  fetchStale: (zip: string) => Promise<{
    active_count: number;
    exact_count: number;
    over_90: number;
    over_180: number;
  } | null>;
  fetchPricePosition: (
    zip: string,
    price: number,
    ppsf: number | null,
  ) => Promise<{
    price_pctile: number | null;
    ppsf_pctile: number | null;
    price_n: number;
    ppsf_n: number;
  } | null>;
  loadSnapshot: (zip: string) => Promise<MarketSnapshot | null>;
  fetchHeat: (zip: string) => Promise<{ medianDom: number; asOf: string } | null>;
  loadCuts: (addressKey: string) => Promise<CutEvent[]>;
  loadParcel: (
    street: string,
    zip: string,
    county: "Lee" | "Collier",
  ) => Promise<ParcelFact | null>;
  loadZhvi: (zip: string, saleYear: number, saleMonth: number) => Promise<ZhviChange | null>;
  loadRelist: (q: string) => Promise<RelistFact | null>;
  now?: Date;
}

export interface WinsReport {
  kind: "home" | "area";
  zip: string;
  place: string;
  subject: SubjectHome | null;
  subjectMiss: boolean;
  checks: CheckResult[];
  areaFigures: CheckFigure[];
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const mdy = (d: Date): string =>
  `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}/${d.getUTCFullYear()}`;

/** Run a read; ANY throw → the fallback. The report never dies on one input. */
async function safe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

// ── Default (live) reads — each empty-tolerant on its own ─────────────────────

const SUBJECT_COLUMNS =
  "address_key, street_address, city, county, zip_code, list_price, sqft, status, state, " +
  "sale_or_rent, dom_days, dom_is_floor, cdom_days, listed_date, property_id";

async function defaultFetchSubject(key: string): Promise<SubjectRow | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from("listing_dom")
    .select(SUBJECT_COLUMNS)
    .eq("address_key", key)
    .eq("sale_or_rent", "sale")
    .eq("state", "active")
    .limit(1)
    .maybeSingle();
  return (data as unknown as SubjectRow) ?? null;
}

/** The shared probe-on-use heal (≤3 vendor calls) — the SubjectRow narrows to the fields
 *  healFlooredRows reads (dom_is_floor / property_id / address_key / listed_date / dom_days). */
async function defaultHeal(rows: SubjectRow[]): Promise<void> {
  await healFlooredRows(rows as unknown as LakeListingRow[]);
}

async function defaultFetchZipMedian(
  zip: string,
): Promise<{ median_dom: number | null; sample_size: number }> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db.schema("data_lake").rpc("zip_active_dom_median", { p_zip: zip });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    median_dom: row?.median_dom != null ? Number(row.median_dom) : null,
    sample_size: row?.sample_size != null ? Number(row.sample_size) : 0,
  };
}

async function defaultFetchBands(zip: string): Promise<
  {
    band: number;
    price_lo: number;
    price_hi: number;
    median_dom: number | null;
    sample_size: number;
  }[]
> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db.schema("data_lake").rpc("zip_band_dom_median", { p_zip: zip });
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    band: Number(r.band),
    price_lo: Number(r.price_lo),
    price_hi: Number(r.price_hi),
    median_dom: r.median_dom != null ? Number(r.median_dom) : null,
    sample_size: r.sample_size != null ? Number(r.sample_size) : 0,
  }));
}

async function defaultFetchStale(zip: string): Promise<{
  active_count: number;
  exact_count: number;
  over_90: number;
  over_180: number;
} | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db.schema("data_lake").rpc("zip_active_stale_share", { p_zip: zip });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    active_count: Number(row.active_count ?? 0),
    exact_count: Number(row.exact_count ?? 0),
    over_90: Number(row.over_90 ?? 0),
    over_180: Number(row.over_180 ?? 0),
  };
}

async function defaultFetchPricePosition(
  zip: string,
  price: number,
  ppsf: number | null,
): Promise<{
  price_pctile: number | null;
  ppsf_pctile: number | null;
  price_n: number;
  ppsf_n: number;
} | null> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .rpc("zip_price_position", { p_zip: zip, p_price: price, p_ppsf: ppsf });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    price_pctile: row.price_pctile != null ? Number(row.price_pctile) : null,
    ppsf_pctile: row.ppsf_pctile != null ? Number(row.ppsf_pctile) : null,
    price_n: Number(row.price_n ?? 0),
    ppsf_n: Number(row.ppsf_n ?? 0),
  };
}

/** realtor.com's monthly ZIP median DOM off the published market-heat read (the
 *  cross-check's second side). Absent ZIP / absent table → null, never a guess. */
async function defaultFetchHeat(zip: string): Promise<{ medianDom: number; asOf: string } | null> {
  const brain = await loadParsedBrain("market-heat-swfl");
  const table = brain?.output?.detail_tables?.find((t) => t.id === "market_heat_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  const v = row?.cells["median_dom"];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const asOf = asOfMdy(table.title, table.source?.fetched_at);
  return asOf ? { medianDom: v, asOf } : null;
}

// ── The loader ────────────────────────────────────────────────────────────────

function toSubjectHome(row: SubjectRow, zip: string): SubjectHome {
  return {
    addressKey: row.address_key ?? "",
    display: row.street_address ?? "",
    zip: row.zip_code ?? zip,
    city: row.city,
    county: row.county,
    listPrice: row.list_price,
    sqft: row.sqft,
    domDays: row.dom_days,
    domIsFloor: row.dom_is_floor === true,
    cdomDays: row.cdom_days,
    listedDate: row.listed_date,
    propertyId: row.property_id,
    status: row.status,
  };
}

export async function loadWinsReport(
  q: string,
  deps: Partial<WinsDeps> = {},
): Promise<WinsReport | null> {
  const d: WinsDeps = {
    fetchSubject: defaultFetchSubject,
    heal: defaultHeal,
    fetchZipMedian: defaultFetchZipMedian,
    fetchBands: defaultFetchBands,
    fetchStale: defaultFetchStale,
    fetchPricePosition: defaultFetchPricePosition,
    loadSnapshot: loadMarketSnapshot,
    fetchHeat: defaultFetchHeat,
    loadCuts: loadCutHistory,
    loadParcel: loadParcelFact,
    loadZhvi: loadZhviChange,
    loadRelist: resolveRelistFact,
    ...deps,
  };

  const query = (q ?? "").trim();
  const resolved = await safe(
    () => resolveQToZip(query, d.geocode ? { geocode: d.geocode } : {}),
    null,
  );
  if (!resolved || !isCoreScope(resolved.zip)) return null;
  const zip = resolved.zip;
  const today = mdy(d.now ?? new Date());

  // Subject (address form only): derive the stored key from the typed street, same
  // round-trip as relist-fact (normalize "#x" → "Unit x" first).
  const isAddress = query !== "" && !BARE_ZIP.test(query);
  let subject: SubjectHome | null = null;
  if (isAddress) {
    const street = query.split(",")[0] ?? "";
    const key = addressKey(normalizeTypedUnits(street), zip);
    const row = await safe(() => d.fetchSubject(key), null);
    if (row) {
      if (row.dom_is_floor === true) await safe(() => d.heal([row]), undefined);
      subject = toSubjectHome(row, zip);
    }
  }

  // Area reads — independent, in parallel. Each failure degrades to null.
  const [medianRaw, bandsRaw, staleRaw, snapshot, heat] = await Promise.all([
    safe(() => d.fetchZipMedian(zip), { median_dom: null, sample_size: 0 }),
    safe(() => d.fetchBands(zip), []),
    safe(() => d.fetchStale(zip), null),
    safe(() => d.loadSnapshot(zip), null),
    safe(() => d.fetchHeat(zip), null),
  ]);

  const zipMedian: ZipDomMedian | null =
    medianRaw.median_dom != null
      ? { medianDom: medianRaw.median_dom, sampleSize: medianRaw.sample_size, asOf: today }
      : null;
  const bands: BandRow[] = bandsRaw.map((b) => ({
    band: b.band,
    priceLo: b.price_lo,
    priceHi: b.price_hi,
    medianDom: b.median_dom,
    sampleSize: b.sample_size,
  }));
  const stale: StaleShare | null = staleRaw
    ? {
        activeCount: staleRaw.active_count,
        exactCount: staleRaw.exact_count,
        over90: staleRaw.over_90,
        over180: staleRaw.over_180,
        asOf: today,
      }
    : null;
  // Cut share is OUR OWN daily listing sweep — user-facing label is the platform, same
  // as every other own-data figure. The brain's verbose citation ("…as of YYYY-MM-DD")
  // is internal provenance; passing it through printed a raw ISO date AND a second
  // as-of on the page (caught on the 07/25/2026 live smoke).
  const zipCutShare =
    snapshot?.momentum?.priceCutSharePct != null
      ? {
          pct: snapshot.momentum.priceCutSharePct,
          source: "SWFL Data Gulf",
          asOf: snapshot.momentum.source.asOf,
        }
      : null;

  // Subject-only reads (cuts / parcel anchor / ZHVI / relist), also parallel.
  let cuts: CutEvent[] = [];
  let parcel: ParcelFact | null = null;
  let zhvi: ZhviChange | null = null;
  let relist: RelistFact | null = null;
  if (subject) {
    const county = subject.county === "Lee" || subject.county === "Collier" ? subject.county : null;
    const street = query.split(",")[0] ?? "";
    [cuts, parcel, relist] = await Promise.all([
      safe(() => d.loadCuts(subject!.addressKey), []),
      county ? safe(() => d.loadParcel(street, zip, county), null) : Promise.resolve(null),
      safe(() => d.loadRelist(query), null),
    ]);
    zhvi = parcel
      ? await safe(() => d.loadZhvi(zip, parcel!.saleYear, parcel!.saleMonth), null)
      : null;
  }
  const pos: PricePosition | null =
    subject?.listPrice != null
      ? await safe(
          () =>
            d.fetchPricePosition(
              zip,
              subject!.listPrice!,
              subject!.sqft != null && subject!.sqft > 0
                ? subject!.listPrice! / subject!.sqft!
                : null,
            ),
          null,
        ).then((p) =>
          p
            ? {
                pricePctile: p.price_pctile,
                ppsfPctile: p.ppsf_pctile,
                priceN: p.price_n,
                ppsfN: p.ppsf_n,
              }
            : null,
        )
      : null;

  // Checks in spec order; unavailable ones are omitted (never guessed).
  const checks: CheckResult[] = [];
  if (subject) {
    const speed = marketSpeed(subject, zipMedian, bands.length ? bands : null);
    checks.push(speed);
    checks.push(
      cumulativeTime(
        subject,
        relist ? { date: relist.date, daysOffMarket: relist.daysOffMarket } : null,
      ),
    );
    checks.push(priceCuts(subject, cuts, zipCutShare, speed.status === "flag"));
    checks.push(pricePosition(subject, pos, today));
    checks.push(anchorGap(subject, parcel, zhvi));
  }
  checks.push(competition(stale, snapshot, zip));
  checks.push(crossCheck(zipMedian, heat, zip));

  // Area context strip — rendered on both kinds; every figure sourced + dated.
  const areaFigures: CheckFigure[] = [];
  if (stale) {
    areaFigures.push({
      label: `Active listings in ${zip}`,
      value: `${stale.activeCount}`,
      source: "SWFL Data Gulf",
      asOf: today,
    });
  }
  if (zipMedian && zipMedian.sampleSize >= MIN_ZIP_SAMPLE) {
    areaFigures.push({
      label: "Typical days on market (active)",
      value: `${Math.round(zipMedian.medianDom)} days`,
      source: "SWFL Data Gulf",
      asOf: today,
    });
  }
  if (stale && stale.exactCount > 0) {
    areaFigures.push({
      label: "Sitting 90+ days",
      value: `${stale.over90} of the ${stale.exactCount} with exact day counts`,
      source: "SWFL Data Gulf",
      asOf: today,
    });
  }
  if (zipCutShare) {
    areaFigures.push({
      label: "Share of active listings that have cut price",
      value: `${zipCutShare.pct}%`,
      source: zipCutShare.source,
      asOf: zipCutShare.asOf,
    });
  }

  return {
    kind: subject ? "home" : "area",
    zip,
    place: cityForZip(zip) ?? resolved.place ?? `ZIP ${zip}`,
    subject,
    subjectMiss: isAddress && !subject,
    checks: checks.filter((c) => c.status !== "unavailable"),
    areaFigures,
  };
}
