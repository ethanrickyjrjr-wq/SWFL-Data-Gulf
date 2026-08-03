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
  font_display: "GEOMETRIC_SANS",
  font_body: "MODERN_SANS",
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
 *  builder's sourced value. */
function fillOpenHouseMoment(doc: EmailDoc, date: string, time: string): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (b.type !== "stats") return b;
      const stats = (b.props.stats as StatItem[] | undefined)?.map((s) =>
        s.label === "Open House Date"
          ? { ...s, value: date }
          : s.label === "Open House Time"
            ? { ...s, value: time }
            : s,
      );
      return stats ? { ...b, props: { ...b.props, stats } } : b;
    }),
  };
}

async function buildDemo(opts: {
  key: "open-house" | "price-reduced" | "back-on-market";
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
    prompt: recipe.prompt
      .replace("[[your listing address]]", opts.address ?? "")
      .replace("[[your ZIP or city]]", opts.zip),
    currentDoc,
    facts,
    resolved: facts !== null,
    zip: opts.zip,
  };

  const builder = builderFor(opts.key);
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

// Back on the Market — AREA build (the builder reads the ZIP's real fallthrough/relist
// rates; deterministic narrative, no LLM). 33914 = SW Cape, Cast & Coast's home ZIP per
// the launch-blitz artifact.
await buildDemo({
  key: "back-on-market",
  zip: "33914",
  file: "01-back-on-market.html",
  outDir: "public/showcase/back-on-market/live",
  tokens: CAST_COAST_TOKENS,
});

console.log("\ndone");
