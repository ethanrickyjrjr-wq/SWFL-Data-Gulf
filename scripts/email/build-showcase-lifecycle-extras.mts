// scripts/email/build-showcase-lifecycle-extras.mts
//
// THE REPEATABLE DEMO-BUILD PATH — (recipeKey, demo listing address, demo brand doc) →
// standalone committed HTML. Discovered 08/03/2026 (Task 1, showcase-complete plan;
// findings: _ASSISTANT/investigations/showcase-complete/01-demo-build-path.md):
//
//   1. resolveSubjectListing(address)        — the ONE resolver (lake-first; real DOM via
//                                              listing_dom, baths via LeePA→paid nearby lane)
//   2. brandingToTokens({demo brand})        — the ONE brand→tokens bridge
//   3. seed doc + applyBrand mirror          — brand-carrying currentDoc (EmailLabShell's
//                                              applyBrand is client-only; a bun script mirrors
//                                              its branches — same precedent as the
//                                              agent-launch demo builds)
//   4. builderFor(key)(ctx)                  — the REAL coded recipe builder, never hand HTML
//   5. renderEmailDocHtml(doc)               — the ONE render root
//   6. writeFileSync(public/showcase/...)    — committed artifact; then capture-showcase.mjs
//
// The original five listing-to-close HTMLs (01–05) were hand-authored (vendored commit
// d3292777) — files 06+ are the first in this showcase produced by the real engine, so their
// markup shape (XHTML doctype, inline styles) intentionally differs from 01–05.
//
// EVERY FIGURE IS REAL. Latitude 26 Estates / Mara Ellison are the established fictional demo
// brand (disclosure in lib/showcase/registry.ts); the properties and their numbers are live
// lake records (data_lake.listing_state / listing_dom, probed 08/03/2026):
//   · Open House    — 465 Gordonia Rd, Naples 34108 (active, $14.8M — genuinely for sale)
//   · Price Improved — 142 Eugenia Dr, Naples 34108 (active, $12,995,000, vendor-stated
//     reduced_amount $755,000 → previous $13,750,000; Gordonia has NO cut on record —
//     vendor property_history shows one "Listed" event, price_change 0 — so its own record
//     cannot honestly carry this email; same-ZIP sibling estate with a REAL cut does)
// The one declared (lane-4) detail: the open-house date/time — an invitation moment the
// demo agent declares, filled into the builder's own open slots below, never a data claim.
//
// Usage: bun scripts/email/build-showcase-lifecycle-extras.mts
import { mkdirSync, writeFileSync } from "fs";
import { RECIPES } from "@/lib/deliverable/recipes";
import { builderFor, type RecipeBuildContext } from "@/lib/deliverable/recipes/index";
import { createBlock, seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
import { brandGlobalStyle } from "@/lib/email/brand/apply-brand-style";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { resolveSubjectListing } from "@/lib/listings/resolve-subject";
import { mirrorHeroPhoto } from "@/lib/media/hero-photo";
import { buildBackOnMarket } from "@/lib/deliverable/recipes/back-on-market";
// KNOWN-DEBT(data_lake): untyped hatch, same as the recipe defaults — script-only read.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

// ── Latitude 26 Estates / Mara Ellison — the showcase's established fictional brand.
// Identity strings match the committed 01–05 artifacts (footer of 02-new-listing.html);
// palette = the same values hardcoded in those files (#0A2A2C/#B98F45/#23302F/#EFE9DD).
const LATITUDE_TOKENS = brandingToTokens({
  agent_name: "Mara Ellison",
  agent_title: "Estate Advisor · Latitude 26 Estates",
  brokerage: "Latitude 26 Estates",
  business_address: "26 Latitude Lane, Naples, FL 34102",
  contact_email: "mara@latitude26.example.com",
  contact_phone: "(239) 555-0126",
  primary_color: "#0A2A2C",
  accent_color: "#B98F45",
  text_color: "#23302F",
  backdrop_color: "#EFE9DD",
  font_display: "PLAYFAIR_SERIF",
  font_body: "BOOK_SERIF",
  logo_url: "assets/latitude26-logo.png",
});

// ── Cast & Coast Realty / Dani Vero — the Cape Coral fictional brand (launch-blitz
// showcase; portrait committed + AI-generated per its disclosure). Palette from the
// committed agent-intro artifact (#12343B/#0E7C86/#2E4A50/#F2FAFB).
const CAST_COAST_TOKENS = brandingToTokens({
  agent_name: "Dani Vero",
  agent_title: "Cast & Coast Realty · Cape Coral",
  brokerage: "Cast & Coast Realty",
  business_address: "Cape Coral, FL",
  contact_email: "dani@castandcoast.example",
  photo_url: "assets/dani-vero.jpg",
  primary_color: "#12343B",
  accent_color: "#0E7C86",
  text_color: "#2E4A50",
  backdrop_color: "#F2FAFB",
  // FIX (08/03/2026, operator: "why does the font sucks"): GEOMETRIC_SANS/MODERN_SANS
  // carry NO webfontUrl (lib/brand/fonts.ts) — every render silently fell back to
  // Trebuchet/Arial. MONTSERRAT_SANS/LATO_SANS both ship a real Google Fonts webfont.
  font_display: "MONTSERRAT_SANS",
  font_body: "LATO_SANS",
  // NO logo_url (08/05/2026). This is the SECOND copy of the same broken reference already
  // fixed in scripts/email/render-new-listing.mts — `public/showcase/launch-blitz/live/assets/`
  // holds ONLY dani-vero.jpg, no logo file was ever added, so this 404s and renders as a
  // broken-image icon captioned "Dani Vero" (companyName is the alt text) directly above the
  // real "Dani Vero" name line. Fixing the render script alone didn't fix this — THIS file is
  // what actually feeds the live showcase/Email Lab, a separate fixture from the acceptance
  // script. HeaderBlock.tsx already degrades to text-only when logoUrl is absent.
});

// Mirror of applyBrand's block branches (EmailLabShell.tsx) — client-component internals a
// bun script can't import; same precedent as the agent-launch demo builds. A brand with NO
// portrait asset and NO bio gets those agent-card fields cleared, never left to a seed
// default (the July agent-card stale-bio bug class).
function applyBrandTokens(doc: EmailDoc, t: Record<string, string>): EmailDoc {
  const cta = t.CTA_URL || t.WEBSITE_URL;
  const globalStyle = brandGlobalStyle(doc.globalStyle, t);
  const blocks = doc.blocks.map((b) => {
    const props = { ...(b.props as Record<string, unknown>) };
    if (b.type === "header") {
      if (t.COMPANY_NAME) props.companyName = t.COMPANY_NAME;
      if (t.TAGLINE) props.tagline = t.TAGLINE;
      if (t.LOGO_URL) props.logoUrl = t.LOGO_URL;
      else if (t.COMPANY_NAME) delete props.logoUrl;
    } else if (b.type === "footer") {
      if (t.COMPANY_NAME) props.companyName = t.COMPANY_NAME;
      if (t.ADDRESS) props.address = t.ADDRESS;
      if (t.CONTACT_EMAIL) props.email = t.CONTACT_EMAIL;
    } else if (b.type === "agent-card") {
      if (t.AGENT_NAME) props.name = t.AGENT_NAME;
      if (t.AGENT_TITLE) props.title = t.AGENT_TITLE;
      if (t.CONTACT_PHONE) props.phone = t.CONTACT_PHONE;
      if (t.AGENT_PHOTO_URL) props.photoUrl = t.AGENT_PHOTO_URL;
      else delete props.photoUrl;
      if (!t.AGENT_BIO) props.bio = "";
    } else if (b.type === "agent-hero") {
      if (t.AGENT_PHOTO_URL) props.photoUrl = t.AGENT_PHOTO_URL;
      if (t.AGENT_NAME) props.name = t.AGENT_NAME;
      if (t.AGENT_TITLE) props.designation = t.AGENT_TITLE;
    } else if (b.type === "button") {
      if (cta && !String(props.url ?? "").startsWith("mailto:")) props.url = cta;
    }
    return { ...b, props } as EmailDoc["blocks"][number];
  });
  // The lifecycle chrome lifts the agent card FROM the canvas (`keepOrDefault`). A seed
  // without one would hand the chrome the HOUSE-BRAND default card ("SWFL Data Gulf ·
  // Market Intelligence") — the July agent-card bug class, seen live on the first build
  // of these demos 08/03/2026. Guarantee a branded card exists on the canvas.
  if (!blocks.some((b) => b.type === "agent-card")) {
    const card = createBlock("agent-card");
    blocks.push({
      ...card,
      props: {
        ...card.props,
        name: t.AGENT_NAME,
        title: t.AGENT_TITLE,
        phone: t.CONTACT_PHONE ?? "",
        bio: "",
      },
    } as EmailDoc["blocks"][number]);
  }
  return { globalStyle, blocks };
}

/** The next Saturday at least `minDaysOut` days from now — a REAL upcoming date the demo
 *  agent declares for the invitation (lane 4). Never a fabricated past date. */
function upcomingSaturday(minDaysOut: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + minDaysOut);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Fill the open-house builder's own DATE/TIME open slots — exactly what the agent does on
 *  the canvas. Only these two labeled cells are touched; every other cell stays the
 *  builder's sourced value.
 *
 *  Labels are "Date"/"Time" (shortened 08/03/2026 — operator: the 3-line-wrapping
 *  "OPEN HOUSE DATE" label; the RIBBON above already says which email this is, so the
 *  strip needs no restatement). Match the CURRENT builder labels, not the old ones. */
function fillOpenHouseMoment(doc: EmailDoc, date: string, time: string): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (b.type !== "stats") return b;
      const stats = (b.props.stats as StatItem[] | undefined)?.map((s) =>
        s.label === "Date" ? { ...s, value: date } : s.label === "Time" ? { ...s, value: time } : s,
      );
      return stats ? { ...b, props: { ...b.props, stats } } : b;
    }),
  };
}

async function buildDemo(opts: {
  key: "open-house" | "price-reduced" | "back-on-market" | "community-info";
  /** community-info only: the full build-box prompt naming the neighborhood. */
  communityPrompt?: string;
  /** Address-spined demos resolve a real house; area-spined ones (back-on-market)
   *  pass no address — the builder reads only the ZIP. */
  address?: string;
  zip: string;
  file: string;
  outDir: string;
  tokens: Record<string, string>;
  /** Lane-2 agent-supplied description (the operator's own campaign copy for Gordonia,
   *  already committed in 02-new-listing.html). Absent → the prose slot stays OPEN. */
  remarks?: string;
  /** Committed mirrored hero URL fallback (85dbe9a9 decree: no vendor-CDN hotlinks in
   *  committed artifacts). Used only if the live mirror upload misses. */
  mirroredPhotoFallback?: string;
}): Promise<void> {
  console.log(`\n── ${opts.key} · ${opts.address ?? `ZIP ${opts.zip}`}`);
  mkdirSync(opts.outDir, { recursive: true });

  let facts = null as Awaited<ReturnType<typeof resolveSubjectListing>>;
  if (opts.address) {
    facts = await resolveSubjectListing(opts.address);
    if (!facts) {
      console.error(`   RESOLVER MISS for ${opts.address} — cannot build without real facts.`);
      process.exitCode = 1;
      return;
    }
    if (opts.remarks) facts.remarks = opts.remarks;

    // Committed artifacts never hotlink the vendor CDN — mirror into our storage.
    const raw = facts.photos[0];
    if (raw) {
      const mirrored = await mirrorHeroPhoto(raw).catch(() => null);
      const durable = mirrored ?? opts.mirroredPhotoFallback ?? null;
      if (durable) facts.photos = [durable];
      else {
        console.warn(`   photo mirror MISS — dropping photo rather than hotlinking vendor CDN`);
        facts.photos = [];
      }
    }
  }

  const recipe = RECIPES[opts.key];
  const currentDoc = applyBrandTokens(
    (seedById("luxury-market-report") ?? SEED_DOCS[0]!).build(),
    opts.tokens,
  );
  const ctx: RecipeBuildContext = {
    recipe,
    prompt:
      opts.communityPrompt ??
      recipe.prompt
        .replace("[[your listing address]]", opts.address ?? "")
        .replace("[[your ZIP or city]]", opts.zip),
    currentDoc,
    facts,
    resolved: facts !== null,
    zip: opts.zip,
  };

  // The relist detector's own number for a property-mode back-on-market build — read
  // LIVE from listing_transitions at run time, never hardcoded (a hardcoded count goes
  // stale the day after it's written).
  const builder =
    opts.key === "back-on-market" && opts.address
      ? async (c: RecipeBuildContext) =>
          buildBackOnMarket(c, { relist: { daysOffMarket: await daysOffMarketFor(opts.address!) } })
      : builderFor(opts.key);
  if (!builder) throw new Error(`no builder for ${opts.key}`);
  let doc = await builder(ctx);
  if (!doc) {
    console.error(`   BUILDER RETURNED NULL for ${opts.key} — stopping, never hand-authoring.`);
    process.exitCode = 1;
    return;
  }

  if (opts.key === "open-house") {
    const sat = upcomingSaturday(12);
    // Short form — a 94px strip cell wraps "Saturday, August 15" over three lines.
    const date = sat.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    doc = fillOpenHouseMoment(doc, date, "12–3 PM");
    console.log(`   open-house moment declared: ${date}, 12–3 PM`);
  }

  const parsed = EmailDocSchema.safeParse(doc);
  if (!parsed.success) {
    console.error("   schema fail:", parsed.error.issues.slice(0, 3));
    process.exitCode = 1;
    return;
  }

  const html = await renderEmailDocHtml(parsed.data);
  writeFileSync(`${opts.outDir}/${opts.file}`, html);
  console.log(
    "   blocks:",
    parsed.data.blocks.map((b) => b.type).join(" · "),
    facts
      ? `\n   facts: price=${facts.price} beds=${facts.beds} baths=${facts.baths} sqft=${facts.sqft}` +
          ` dom=${facts.daysOnMarket ?? "—"} cut=${facts.priceReduction ?? "—"}`
      : `\n   area build — ZIP ${opts.zip}`,
    `\n   wrote ${opts.outDir}/${opts.file} (${html.length} bytes)`,
  );
}

const LIFECYCLE_OUT = "public/showcase/listing-to-close/live";

/** The most recent relist gap for an address, from the relist detector's own table
 *  (data_lake.listing_transitions.days_off_market). Null on any miss — the cell then
 *  renders as an open slot, never a guess. */
async function daysOffMarketFor(address: string): Promise<number | null> {
  try {
    const key =
      address
        .split(",")[0]!
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") +
      ":" +
      (address.match(/\b\d{5}\b/)?.[0] ?? "");
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_transitions")
      .select("days_off_market, at")
      .eq("address_key", key)
      .not("days_off_market", "is", null)
      .order("at", { ascending: false })
      .limit(1);
    const n = Number((data?.[0] as { days_off_market?: unknown } | undefined)?.days_off_market);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// ── Meridian South Advisory — the Fort Myers fictional brand (market-pulse showcase).
// Palette from the committed pulse-email artifact (#1A1A18/#C4551A/#2B2A26/#FAF8F4).
const MERIDIAN_TOKENS = brandingToTokens({
  agent_name: "Meridian South Advisory",
  agent_title: "Advisory · Fort Myers",
  // NOT "Meridian South Advisory" again — brokerage feeds the header TAGLINE, and the
  // logo + companyName already carry the name; three copies stacked reads as a bug.
  brokerage: "Fort Myers",
  business_address: "Fort Myers, FL",
  contact_email: "desk@meridiansouth.example",
  primary_color: "#1A1A18",
  accent_color: "#C4551A",
  text_color: "#2B2A26",
  backdrop_color: "#FAF8F4",
  font_display: "MONTSERRAT_SANS",
  font_body: "LATO_SANS",
  logo_url: "assets/meridian-logo.png",
});

// Gordonia's lane-2 description — the demo agent's own campaign copy, verbatim from the
// committed 02-new-listing.html narrative (operator-supplied 07/02/2026).
const GORDONIA_REMARKS =
  "Acre-and-a-half parcels with a residence of this scale are the exception in 34108, not " +
  "the rule — and this one arrives with room to live, entertain, and expand. Six bedrooms " +
  "across 7,733 square feet, on grounds that give the home the setback and privacy the " +
  "corridor is known for.";

await buildDemo({
  key: "open-house",
  address: "465 Gordonia Road, Naples, FL 34108",
  zip: "34108",
  file: "06-open-house.html",
  outDir: LIFECYCLE_OUT,
  tokens: LATITUDE_TOKENS,
  remarks: GORDONIA_REMARKS,
  mirroredPhotoFallback:
    "https://jtkdowmrjaxfvwmemxso.supabase.co/storage/v1/object/public/email-media/hero-photos/107979fc62aaa2ef3002fbbb.webp",
});

await buildDemo({
  key: "price-reduced",
  address: "142 Eugenia Drive, Naples, FL 34108",
  zip: "34108",
  file: "07-price-reduced.html",
  outDir: LIFECYCLE_OUT,
  tokens: LATITUDE_TOKENS,
  // No lane-2 description exists for this listing — the prose slot stays OPEN (the
  // builder's own contract: never invent a paragraph, the strip/photo/cut carry it).
});

// Back on the Market — PROPERTY build (operator decree 08/03/2026: "back on market is a
// property"). A REAL relisted Cape Coral home from the relist detector's own data:
// listing_transitions shows it returning to active on 08/01/2026 after 16 days off.
// The area fallthrough rates ride as ONE supporting row; deterministic narrative, no LLM.
await buildDemo({
  key: "back-on-market",
  address: "3233 NW 21st St, Cape Coral, FL 33993",
  zip: "33993",
  file: "01-back-on-market.html",
  outDir: "public/showcase/back-on-market/live",
  tokens: CAST_COAST_TOKENS,
});

// Community Info — the first email over the neighborhood lane (landed 08/03/2026):
// North Naples, the vendor neighborhood with the deepest amenity coverage (78 rows).
// Deterministic narrative from the vendor's own score sentences, no LLM.
await buildDemo({
  key: "community-info",
  zip: "34109",
  file: "01-community-info.html",
  outDir: "public/showcase/community-info/live",
  tokens: MERIDIAN_TOKENS,
  communityPrompt: "Build a community-info email for North Naples",
});

console.log("\ndone");
