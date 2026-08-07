// scripts/email/build-showcase-agent-brand-intro.mts
//
// Regenerates the "launch-blitz" showcase's Agent Brand Intro slide
// (public/showcase/launch-blitz/live/agent-intro.html) from the REAL, CURRENT
// `buildAgentBrandIntro` recipe — never hand HTML. Same demo-build path as
// `build-showcase-lifecycle-extras.mts` (resolveSubjectListing is skipped here;
// this recipe resolves its own anchor listing internally via `resolveSubject`).
//
// WHY THIS EXISTS (08/06/2026): the committed `agent-intro.html` was captured
// 07/02/2026 — before the 08/06 walk that rewrote the recipe's chart (dot plot,
// not bar), the personal-intro paragraph (now written from the agent's bio),
// and the block ORDER (intro leads, the agent-card/name/photo/phone card closes
// beside the CTA, matching every other lifecycle email). The showcase kept
// shipping the OLD layout under the "new emails" banner — operator, verbatim:
// *"Those are all old emails at the top!!! We just built new emails from the
// fucking playbook!!!"* He was right: the code was new, the picture was not.
//
// Cast & Coast Realty / Dani Vero — SAME demo brand as launch-blitz's other
// slide (`build-showcase-lifecycle-extras.mts` CAST_COAST_TOKENS) and the SAME
// farm area (Cape Coral) + anchor listing (1927 Savona Parkway W, $620,000)
// already established in the committed disclosure/caption copy
// (lib/showcase/registry.ts "launch-blitz") — so the regenerated slide still
// matches the story text around it, only the RENDER catches up to current code.
//
// Usage: bun scripts/email/build-showcase-agent-brand-intro.mts
import { mkdirSync, writeFileSync } from "fs";
import { buildAgentBrandIntro } from "@/lib/deliverable/recipes/agent-brand-intro";
import { createBlock, seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
import { brandGlobalStyle } from "@/lib/email/brand/apply-brand-style";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { RecipeBuildContext } from "@/lib/deliverable/recipes/index";
import type { EmailDoc } from "@/lib/email/doc/types";

const CAST_COAST_TOKENS = brandingToTokens({
  agent_name: "Dani Vero",
  agent_title: "Cast & Coast Realty · Cape Coral",
  brokerage: "Cast & Coast Realty",
  business_address: "Cape Coral, FL",
  contact_email: "dani@castandcoast.example",
  // Operator, 08/06/2026: "get rid of that fucking face" (the old rectangular
  // dani-vero.jpg headshot crop) then "USE THE FUCKING TRANSPARENT AGENT PHOTO" —
  // handed a real trimmed-transparent portrait directly in chat (lane 2, RULE 0.7:
  // the user's own upload). Verified true alpha transparency (RGBA, alpha 0-255)
  // before committing it, matches Dani Vero's established gender (registry.ts: "her
  // portrait"). Committed to both showcases carrying this persona.
  photo_url: "assets/dani-vero-transparent.png",
  // Establishes the "data-first Cape agent" voice the registry.ts disclosure already
  // names — and gives `authorAgentIntro` a real source to write the lead paragraph
  // from (no bio → the open slot, which is what shipped invisible before this fix).
  agent_bio:
    "I sell Cape Coral, and I open every listing conversation with the numbers, not the " +
    "sales pitch. Fourteen years watching this market taught me that buyers and sellers " +
    "both do better when they see the real data first.",
  // Real Cast & Coast logo — already committed for the back-on-market showcase
  // (same brand, same file), copied into launch-blitz's own assets/ so this slide
  // carries it too instead of degrading to a text-only masthead.
  logo_url: "assets/castcoast-logo.png",
  primary_color: "#12343B",
  accent_color: "#0E7C86",
  text_color: "#2E4A50",
  backdrop_color: "#F2FAFB",
  font_display: "MONTSERRAT_SANS",
  font_body: "LATO_SANS",
});

// Mirror of applyBrand's block branches — duplicated from
// `build-showcase-lifecycle-extras.mts` (not exported there; same precedent
// that file's own header note already documents for this exact function).
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
      // FIX vs. build-showcase-lifecycle-extras.mts's own copy of this function: that
      // one never carries AGENT_BIO onto the card at all (blanks it unconditionally on
      // the false branch, never sets it on the true one) — a real bio token was always
      // silently dropped. Needed here because this recipe's lead paragraph is written
      // FROM the bio; a dropped bio means a dropped intro.
      props.bio = t.AGENT_BIO || "";
    } else if (b.type === "button") {
      if (cta && !String(props.url ?? "").startsWith("mailto:")) props.url = cta;
    }
    return { ...b, props } as EmailDoc["blocks"][number];
  });
  if (!blocks.some((b) => b.type === "agent-card")) {
    const card = createBlock("agent-card");
    blocks.push({
      ...card,
      props: {
        ...card.props,
        name: t.AGENT_NAME,
        title: t.AGENT_TITLE,
        phone: t.CONTACT_PHONE ?? "",
        bio: t.AGENT_BIO || "",
        photoUrl: t.AGENT_PHOTO_URL || "",
      },
    } as EmailDoc["blocks"][number]);
  }
  return { globalStyle, blocks };
}

// ANCHOR ADDRESS — verified live 08/06/2026 via `resolveSubject`: a REAL active Cape
// Coral listing with a real photo and price ($589,900). The original demo's anchor
// (1927 Savona Parkway W) no longer resolves — checked live, `resolveSubject` returns
// only a bare address with zero photos/price, meaning it's off-market since the 07/02
// capture. Rather than keep a dead address (which silently drops the listing photo,
// price and specs to open slots), swapped to one that resolves today. RULE 0.7: never
// invent a number — a stale reference that quietly stops resolving is the same failure
// class as inventing one, just slower to notice.
const PROMPT =
  "Build an agent-introduction email for my farm area Cape Coral — a ZIP-by-ZIP asking-price " +
  "chart from live listings, my newest listing at 163 SW 51st Ter, Cape Coral, FL 33914.";

const currentDoc = applyBrandTokens(
  (seedById("luxury-market-report") ?? SEED_DOCS[0]!).build(),
  CAST_COAST_TOKENS,
);

const ctx: RecipeBuildContext = {
  prompt: PROMPT,
  currentDoc,
  facts: null,
  resolved: false,
  zip: undefined,
} as RecipeBuildContext;

const built = await buildAgentBrandIntro(ctx);
if (!built) {
  console.error("buildAgentBrandIntro returned null — nothing written.");
  process.exit(1);
}

const parsed = EmailDocSchema.safeParse(built);
if (!parsed.success) {
  console.error("schema fail:", parsed.error.issues.slice(0, 5));
  process.exit(1);
}

const html = await renderEmailDocHtml(parsed.data);
const outDir = "public/showcase/launch-blitz/live";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/agent-intro.html`, html);
console.log(
  "blocks:",
  parsed.data.blocks.map((b) => b.type).join(" · "),
  `\nwrote ${outDir}/agent-intro.html (${html.length} bytes)`,
);
