// lib/listings/apify-comps.ts
//
// THE APIFY ENRICHMENT LANE — realtor.com records for comp homes our own nightly
// sweep never saw, plus the subject home's real MLS remarks.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
// It is NOT a comp source. `market-comps` derives its set from `compsForAddress`
// and then runs isComparableHome -> isNotSubjectAddress -> isFreshSale ->
// buildPriceCase -> auditClaims. Swapping the SOURCE would force every one of
// those guards to be re-reasoned, including the claim gate that exists because
// that recipe once shipped an INVERTED comparison. So these records are keyed
// onto the EXISTING comp set and fill exactly two holes: a missing photo, and a
// missing description. Design: docs/superpowers/specs/2026-08-03-apify-comp-email-design.md
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
// `comp-photos.ts` resolves photos from data_lake.listing_state — the nightly
// sweep, which first captured photos 06/30/2026. Its 98.5% figure is coverage
// INSIDE that window only. A comp set reaches back 6-12 months, so MOST of a comp
// set predates our collection and resolves to nothing. This is lane 2 of the same
// resolver, never a second resolver.
//
// ── VENDOR CONTRACT, verified live 08/03/2026 (global RULE 1) ────────────────
// moving_beacon-owner1/realtor-com-property-scraper (actor T5QRnLKtyvzxjWVRH).
// PAY_PER_EVENT: $0.01/result + $0.00005/actor-start. Two facts the handoff
// missed, both encoded below as guards:
//   • `radius` ONLY works when the location is a specific ADDRESS. Passing a ZIP
//     with a radius makes the vendor silently ignore it — so we drop it instead.
//   • `property_type` filters at the SOURCE, and its enum includes `land` — the
//     vacant lot is excluded before we are billed for the row.
//
// EMPTY IS NORMAL. 2 of 5 store actors tested for this job were junk (handoff §4).
// Every path here returns [] on any failure and never throws.

import { compPhotoKey } from "./comp-photos";
import { saveApifyRecords } from "./apify-record-store";
import { requestSpend, refusalMessage } from "./apify-spend-guard";

/** The subset of the vendor record we read. The FULL ceiling is catalogued in the
 *  design doc §5 and cadence_registry `source_scope` — this is what we consume. */
export interface ApifyRecord {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  sold_price?: number | null;
  last_sold_date?: string | null;
  list_price?: number | null;
  list_date?: string | null;
  days_on_mls?: number | null;
  beds?: number | null;
  full_baths?: number | null;
  half_baths?: number | null;
  sqft?: number | null;
  year_built?: number | null;
  lot_sqft?: number | null;
  price_per_sqft?: number | null;
  style?: string | null;
  property_url?: string | null;
  primary_photo?: string | null;
  /** ⚠️ A COMMA-SPACE-JOINED STRING, not an array. Proven live. Use parseAltPhotos. */
  alt_photos?: string | string[] | null;
  /** Populated for for_sale/pending; `<NA>` on sold (handoff §3, the description split). */
  text?: string | null;
}

/** The vendor's own "no value" sentinel — it arrives as the literal string. */
const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None"]);

function isRealString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !NA.has(v.trim());
}

/** Only ever an http(s) URL. A `javascript:` or data: string must never reach an
 *  <img src>, and a relative path is not a CDN photo. */
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
}

/**
 * `alt_photos` arrives as a COMMA-SPACE-JOINED STRING (proven live: 50 photos on
 * one record). Treating it as an array yields a one-element list of a 3,000-char
 * blob that then goes into an <img src>. Array input is tolerated because vendor
 * shape drift should degrade, not crash.
 */
export function parseAltPhotos(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : isRealString(raw) ? raw.split(",") : [];
  return parts.map((p) => String(p).trim()).filter(isHttpUrl);
}

// ── THE DESCRIPTION ──────────────────────────────────────────────────────────

/** Real MLS remarks run to ~3,000 characters. §0.1 of the email rules caps a body
 *  at ~20 lines of text and §0.3 gives Gmail a ~102KB clip with NO `<details>`
 *  support, so an accordion is not available to us. This is the budget for the
 *  description block specifically — it rides OUTSIDE the 50-125 word copy band
 *  (operator carve-out 08/03/2026: "if a home has a description of it, that does
 *  not count towards the word count"), but it is not therefore unbounded. */
export const DESCRIPTION_CHAR_CAP = 600;

/** The disclosure that MUST survive truncation (handoff §5). Matched on meaning,
 *  not on one exact vendor string — the wording varies by listing. */
const STAGING_DISCLOSURE = /[^.!?]*virtually staged[^.!?]*[.!?]/i;

/** Split into sentences, keeping their terminators. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
}

/**
 * The vendor's remarks, cut to fit — ON A SENTENCE BOUNDARY, never mid-word and
 * never mid-number.
 *
 * *** THE VIRTUAL-STAGING DISCLOSURE RIDES ALONG. *** It sits at the END of the
 * remarks, which is exactly where a truncator cuts. Republishing staged-photo
 * copy while dropping the sentence that discloses the staging is the failure this
 * function exists to prevent (handoff §5, operator decree). If the source has it,
 * the output has it — appended after the cut when truncation would have eaten it.
 *
 * Returns null for anything that is not a real description, including the vendor's
 * literal `<NA>` — so a caller can never print the sentinel as prose.
 */
export function truncateDescription(raw: string | null | undefined): string | null {
  if (!isRealString(raw)) return null;
  const text = raw.trim().replace(/\s+/g, " ");

  const disclosure = text.match(STAGING_DISCLOSURE)?.[0]?.trim();
  if (text.length <= DESCRIPTION_CHAR_CAP) return text;

  // Take whole sentences while they fit. The disclosure is handled separately, so
  // it never consumes the budget it would then be re-appended outside of.
  const body = disclosure ? text.replace(disclosure, "").trim() : text;
  let out = "";
  for (const s of sentences(body)) {
    if ((out + s).trim().length > DESCRIPTION_CHAR_CAP) break;
    out += s;
  }
  out = out.trim();

  // Not even one sentence fits: hard-cut at the last word boundary and close it.
  if (!out) {
    const cut = body.slice(0, DESCRIPTION_CHAR_CAP);
    out =
      cut
        .slice(0, cut.lastIndexOf(" "))
        .trim()
        .replace(/[,;:]$/, "") + ".";
  }

  return disclosure ? `${out} ${disclosure}`.trim() : out;
}

// ── THE ACTOR INPUT — where money and correctness are decided ─────────────────

export type ApifyListingType = "for_sale" | "for_rent" | "sold" | "pending";

export interface ApifyCompQuery {
  /** A ZIP, "City, ST", or a full street address. A RADIUS requires the last one. */
  location: string;
  listingType: ApifyListingType;
  /** YYYY-MM-DD. The vendor's own format — never our MM/DD/YYYY display format. */
  dateFrom?: string;
  dateTo?: string;
  radiusMiles?: number;
  maxResults?: number;
}

/** THE COST CEILING. `max_results_per_location: 0` means UNLIMITED to the vendor
 *  (up to 10k) — at $0.01/result that is a $100 run from one omitted field. This
 *  default is what makes the unbounded run unreachable. Operator ceiling: $7. */
const DEFAULT_MAX_RESULTS = 25;

/** A bare ZIP (or ZIP+4). The vendor ignores `radius` unless the location is a
 *  specific address — so we DROP the radius rather than send a lie. */
function isBareZip(location: string): boolean {
  return /^\s*\d{5}(-\d{4})?\s*$/.test(location);
}

export interface ApifyActorInput {
  locations: string[];
  listing_type: ApifyListingType;
  max_results_per_location: number;
  property_type: string[];
  date_from?: string;
  date_to?: string;
  radius?: number;
}

/**
 * The typed actor input. Every guard that costs money or correctness lives here:
 *   • the run is ALWAYS capped (F7)
 *   • `land` is excluded AT THE SOURCE, so a vacant lot is never billed and never
 *     has to be caught downstream by isComparableHome (F7)
 *   • a `radius` paired with a bare ZIP is DROPPED, because the vendor would
 *     silently ignore it and hand back a whole-ZIP result set we paid for (F9)
 */
export function buildActorInput(q: ApifyCompQuery): ApifyActorInput {
  const cap =
    Number.isFinite(q.maxResults) && (q.maxResults as number) > 0
      ? Math.floor(q.maxResults as number)
      : DEFAULT_MAX_RESULTS;

  const input: ApifyActorInput = {
    locations: [q.location],
    listing_type: q.listingType,
    max_results_per_location: cap,
    // Homes only. The enum's `land` is what `isComparableHome` was written to
    // filter out downstream — excluding it here means we are never billed for it.
    property_type: [
      "single_family",
      "condos",
      "condo_townhome_rowhome_coop",
      "condo_townhome",
      "townhomes",
      "duplex_triplex",
      "multi_family",
      "mobile",
    ],
  };

  if (isRealString(q.dateFrom)) input.date_from = q.dateFrom;
  if (isRealString(q.dateTo)) input.date_to = q.dateTo;
  if (Number.isFinite(q.radiusMiles) && (q.radiusMiles as number) > 0 && !isBareZip(q.location)) {
    input.radius = q.radiusMiles;
  }
  return input;
}

// ── THE FETCH — empty-tolerant by construction ───────────────────────────────

export interface ApifyCompDeps {
  /** Injectable for offline tests. Default is the live Apify run. */
  runActor?: (input: ApifyActorInput) => Promise<unknown[]>;
}

/** A row is usable only if it identifies a house. Anything else — the `{error}`
 *  shape parseforge returns, a null, a bare string — is dropped silently. */
function isUsableRecord(r: unknown): r is ApifyRecord {
  return !!r && typeof r === "object" && isRealString((r as ApifyRecord).street);
}

/**
 * Run the actor and return usable records. NEVER THROWS.
 *
 * An empty result is the NORMAL failure shape here, not an exception: 2 of the 5
 * store actors tested for this job returned 0 items or exited 1 (handoff §4), and
 * failed items are never billed. A consumer that treats [] as an error would turn
 * a routine vendor miss into a failed email build — RULE 0.7, never refuse a build.
 */
export async function fetchApifyComps(
  q: ApifyCompQuery,
  deps: ApifyCompDeps = {},
): Promise<ApifyRecord[]> {
  const run = deps.runActor ?? runApifyActor;
  try {
    const items = await run(buildActorInput(q));
    const records = Array.isArray(items) ? items.filter(isUsableRecord) : [];
    // KEEP WHAT WE PAID FOR. Every record carries 69 fields (live-counted 08/04/2026)
    // and this pipeline used to read two, then drop the rest when the process exited —
    // so the next build re-bought the same house. Persisting HERE, inside the ONE
    // fetch root, means every lane (baths, comp photos, descriptions) saves without
    // opting in and no future caller can forget to.
    //
    // AWAITED, and that is not an oversight. The first cut fired this off unawaited
    // to keep builds fast; the build process then exited before the write landed and
    // the table stayed at ZERO rows while every call still billed. A fire-and-forget
    // write is only "fast" in a process that outlives it — email builds run in CLI
    // scripts and serverless invocations that do not. saveApifyRecords swallows its
    // own errors and returns 0, so awaiting it cannot fail a build (RULE 0.7).
    if (records.length > 0 && !deps.runActor) {
      await saveApifyRecords(records).catch(() => 0);
    }
    return records;
  } catch {
    return [];
  }
}

const ACTOR_ID = "moving_beacon-owner1~realtor-com-property-scraper";

/** The live call. Kept tiny and behind the injectable seam above so every test
 *  runs offline and no test can ever spend money.
 *
 *  *** THIS FUNCTION IS THE ONLY PLACE IN THE TREE WHERE MONEY LEAVES THE PROCESS,
 *      WHICH IS WHY THE SPEND GUARD SITS HERE AND NOT IN A CALLER. *** Callers inject
 *      `deps.runActor` to stay offline, so a guard in `fetchApifyComps` could be routed
 *      around by any future caller that brings its own runner. Guarding the bottom means
 *      no caller can opt out — deliberately or by accident. See apify-spend-guard.ts for
 *      the $14.37 afternoon that forced it. */
async function runApifyActor(input: ApifyActorInput): Promise<unknown[]> {
  // ── THE SWITCH AND THE BUDGET, BEFORE THE FETCH ────────────────────────────
  // Charged on the REQUESTED cap, before the call: a run that returns 200 records has
  // already been billed for them, so a budget that counts what came back learns the
  // price only after paying it.
  const verdict = requestSpend(input.max_results_per_location);
  if (!verdict.allowed) {
    // LOUD, and worded so it can never be read as a market fact. This is the third
    // time this file has had to make a silent [] speak up (the APIFY_KEY name mismatch,
    // then the 403 hard limit); it is not becoming a pattern quietly.
    console.warn(refusalMessage(verdict.reason!, input.max_results_per_location));
    return [];
  }

  // BOTH names are read on purpose. `.env.local` has carried `APIFY_KEY` all along;
  // this function only ever looked for `APIFY_TOKEN`, so the lane silently returned []
  // on every call and read to me as "no token configured" (operator, 08/03/2026:
  // "APIFY KEY IN .ENV.LOCAL THOUGH"). Renaming the operator's variable would have been
  // the wrong fix — the code reads what is actually there.
  const token = process.env.APIFY_TOKEN ?? process.env.APIFY_KEY;
  if (!token) {
    // A silent [] here is indistinguishable from "no comps found", which is exactly how
    // a name mismatch survived undetected. Say it out loud.
    console.warn("[apify-comps] no APIFY_TOKEN / APIFY_KEY in env — comp enrichment skipped");
    return [];
  }
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    // *** A VENDOR REFUSAL IS NOT "THIS ZIP HAS NO SOLD HOMES." ***
    // Measured live 08/04/2026: three identical dated pulls on ZIP 33908 returned 200
    // records, then 101, then 0 — and the 0 was an HTTP 403
    // `{"type":"platform-feature-disabled","message":"Monthly usage hard limit exceeded"}`.
    // Returning a bare [] made an exhausted ACCOUNT look exactly like an empty MARKET,
    // and the email quietly shipped with open photo slots as though no photos existed.
    // Same silent-zero shape as the APIFY_KEY name mismatch above; same fix — say it.
    const body = await res.text().catch(() => "");
    console.error(
      `[apify-comps] VENDOR CALL FAILED ${res.status} ${res.statusText} — this is NOT ` +
        `"no results". Photo/link slots will be empty for a reason that has nothing to do ` +
        `with the houses: ${body.slice(0, 300)}`,
    );
    return [];
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

// ── KEYING ONTO THE EXISTING COMP SET ────────────────────────────────────────

/**
 * address-key -> photo url, using `compPhotoKey` — THE SAME normalizer lane 1
 * uses, never a second one. That is what stops "330 5th St, Naples" from lending
 * its photo to "330 5th St, Fort Myers": the city is part of the key.
 *
 * First writer wins, so a nearer/earlier record is not overwritten by a later one.
 */
export function apifyPhotoIndex(records: ApifyRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) {
    if (!isRealString(r.street) || !isHttpUrl(r.primary_photo)) continue;
    const k = compPhotoKey(r.street, r.city ?? "");
    if (!out.has(k)) out.set(k, r.primary_photo.trim());
  }
  return out;
}

// ── WHY THERE IS NO `selectPhotographedComps` HERE ───────────────────────────
//
// One existed, briefly, on 08/03/2026. It let PHOTO COVERAGE choose which comps
// shipped — take the photographed ones, fall back to the full set below a floor —
// as the fix for `compsMiddle` rendering thumbnails all-or-nothing.
//
// It was WRONG, and quietly so. `market-comps` computes its median $/sq ft, its
// vs-recorded-sales relation and its position-in-set claim over whichever comps
// ship. Letting photo availability pick that set makes the central argument of a
// price-DEFENSE email depend on which houses we happen to hold pictures of — the
// same class of error as the inverted comparison that produced `claims.ts`.
//
// The real fault was the all-or-nothing RENDER rule, not the selection. That rule
// is now per-row (market-comps.ts `compsMiddle`), which is what `comp-photos.ts`
// promised all along: "A comp we cannot photograph ships without a picture and
// keeps its realtor.com link."
//
// *** Photos decorate the evidence. They never select it. Do not re-add this. ***
