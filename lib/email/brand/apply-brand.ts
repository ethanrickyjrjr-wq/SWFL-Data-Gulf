// lib/email/brand/apply-brand.ts
//
// ONE ROOT for the brand overlay. Relocated out of components/email-lab/EmailLabShell.tsx
// (2026-07-07, retire-block-shell) so the grid shell and the social composer no longer
// import a function that lived inside the doomed block shell. Pure data transform (no JSX),
// grouped next to its sibling `apply-brand-style.ts` (brandGlobalStyle).
//
// Given a doc + a brand-token map, overlay the operator's brand onto the brand-owned block
// props (header, footer, agent card/hero, social icons, button CTA, hero label). Returns a
// new doc; a nullish token map is a no-op passthrough.
import { PLATFORMS, platformMeta } from "@/lib/email/social/platforms";
import { brandGlobalStyle } from "@/lib/email/brand/apply-brand-style";
import type { EmailBlock, EmailDoc, SocialPlatformEntry } from "@/lib/email/doc/types";

/** The one generic hero label a scope token may still replace (token-defaults.ts
 *  HERO_LABEL) — kept as a local constant so this pure module doesn't grow a
 *  dependency on the legacy template-token file. */
const HOUSE_DEFAULT_HERO_LABEL = "Southwest Florida";

export function applyBrand(doc: EmailDoc, t?: Record<string, string>): EmailDoc {
  if (!t) return doc;
  const globalStyle = brandGlobalStyle(doc.globalStyle, t);
  const cta = t.CTA_URL || t.WEBSITE_URL;
  const blocks = doc.blocks.map((b) => {
    const props = { ...(b.props as Record<string, unknown>) };
    if (b.type === "header") {
      if (t.COMPANY_NAME) props.companyName = t.COMPANY_NAME;
      if (t.TAGLINE) props.tagline = t.TAGLINE;
      if (t.LOGO_URL) props.logoUrl = t.LOGO_URL;
      // A real company name overriding the house-brand text must drop the
      // house-brand logo pixels too — never ship "SWFL Data Gulf" imagery
      // under a client's own name (operator escalation 2026-07-06).
      else if (t.COMPANY_NAME) delete props.logoUrl;
    } else if (b.type === "footer") {
      if (t.COMPANY_NAME) props.companyName = t.COMPANY_NAME;
      if (t.ADDRESS) props.address = t.ADDRESS;
      if (t.WEBSITE_URL) props.websiteUrl = t.WEBSITE_URL;
      if (t.CONTACT_PHONE) props.phone = t.CONTACT_PHONE;
      if (t.CONTACT_EMAIL) props.email = t.CONTACT_EMAIL;
      if (t.INSTAGRAM_URL) props.instagramUrl = t.INSTAGRAM_URL;
      if (t.FACEBOOK_URL) props.facebookUrl = t.FACEBOOK_URL;
      if (t.LINKEDIN_URL) props.linkedinUrl = t.LINKEDIN_URL;
      if (t.UNSUBSCRIBE_URL) props.unsubscribeUrl = t.UNSUBSCRIBE_URL;
    } else if (b.type === "agent-card") {
      if (t.AGENT_NAME) props.name = t.AGENT_NAME;
      if (t.AGENT_TITLE) props.title = t.AGENT_TITLE;
      if (t.AGENT_BIO) props.bio = t.AGENT_BIO;
      if (t.AGENT_PHOTO_URL) props.photoUrl = t.AGENT_PHOTO_URL;
      if (t.CONTACT_PHONE) props.phone = t.CONTACT_PHONE;
      if (cta) props.ctaUrl = cta;
    } else if (b.type === "agent-hero") {
      if (t.AGENT_PHOTO_URL) props.photoUrl = t.AGENT_PHOTO_URL;
      if (t.AGENT_NAME) props.name = t.AGENT_NAME;
      if (t.AGENT_TITLE) props.designation = t.AGENT_TITLE;
      if (cta) props.ctaUrl = cta;
    } else if (b.type === "social-icons") {
      const existing = (props.platforms as SocialPlatformEntry[] | undefined) ?? [];
      const present = new Set(existing.map((e) => e.type));
      const next: SocialPlatformEntry[] = existing.map((e) => {
        if (e.type === "custom") return e;
        const url = t[platformMeta(e.type).tokenKey];
        return url ? { ...e, url } : e;
      });
      for (const meta of PLATFORMS) {
        const url = t[meta.tokenKey];
        if (url && !present.has(meta.type)) next.push({ type: meta.type, url });
      }
      props.platforms = next;
    } else if (b.type === "button") {
      // Brand owns ordinary link destinations — but an engine-set reply CTA
      // (mailto:, agent-launch L2) survives the overlay.
      if (cta && !String(props.url ?? "").startsWith("mailto:")) props.url = cta;
    } else if (b.type === "hero") {
      // Scope dressing (HERO_LABEL = the project's place/ZIP, added by the project
      // page) fills a hero label ONLY when it is blank or still the house default.
      // An authored label is CONTENT — on every lifecycle flyer it is the listing
      // ADDRESS — and the overlay must never clobber it (07/19/2026: every project
      // build printed "Cape Coral" where the address belonged).
      const cur = String((props.label as string | undefined) ?? "").trim();
      if (t.HERO_LABEL && (!cur || cur === HOUSE_DEFAULT_HERO_LABEL)) props.label = t.HERO_LABEL;
    }
    return { ...b, props } as EmailBlock;
  });
  return { globalStyle, blocks };
}
