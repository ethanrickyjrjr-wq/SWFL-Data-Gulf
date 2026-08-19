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
import {
  isDestinationRefinement,
  buttonRoleOf,
  resolveButtonDestination,
  savedDestinationsFromTokens,
} from "@/lib/email/button-destinations";
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
      // WAS: `if (cta && !mailto) props.url = cta` — ONE blanket rewrite of every
      // button to the single brand website. Two defects, both operator-reported
      // 08/03/2026: an agent could not give the community button one destination and
      // a booking button another; and a URL the user typed in the inspector was
      // silently clobbered on the next overlay, so "all urls can be changed by the
      // user for each button" was false at the ROUND-TRIP even though the field
      // existed. Destinations are keyed by ROLE now (button-destinations.ts).
      const url = String(props.url ?? "");

      // GUARD 1 — an engine-set reply CTA (mailto:, agent-launch L2, review-reply)
      // survives untouched. EXPLICIT, not an emergent property of rung ordering:
      // these buttons are engine-owned, so without this line a saved brand
      // destination would out-rank and clobber the reply address.
      // GUARD 2 — a URL a human typed is theirs, full stop. Absent `urlSource` means
      // ENGINE, so every pre-existing saved doc keeps taking the overlay exactly as
      // it does today; reading absent as "user" would freeze the whole back
      // catalogue and switch the overlay off for it. Both pinned by test.
      if (!url.startsWith("mailto:") && props.urlSource !== "user") {
        const resolved = resolveButtonDestination({
          role: buttonRoleOf(props.role),
          // An engine-set URL is NOT "authored" — it is precisely the thing brand
          // is allowed to replace. Only a human edit reaches rung 1.
          authoredUrl: null,
          saved: savedDestinationsFromTokens(t),
          websiteUrl: cta,
          // No subject page is in scope here; the house rung belongs to the
          // send-time ladder (link-audit.ts), the one path all four send lanes share.
          housePage: null,
        });
        // `open-slot` — nothing saved, and a role whose promise a homepage cannot
        // honestly answer (community/listing, per Gmail's "recipients should know
        // what to expect when they click a link") — leaves whatever the engine set.
        // Never blank a live button.
        //
        // GUARD 3 — an engine URL that REFINES the resolved destination (same
        // host+path, only added query params — a time-offer slot deep link,
        // lib/booking/time-buttons.ts) is kept: rewriting it to the bare saved
        // link would silently strip the offered time (pinned in wiring test).
        if (resolved.url && !isDestinationRefinement(url, resolved.url)) {
          props.url = resolved.url;
        }
      }
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
  // SPREAD THE DOC. This used to return a bare `{ globalStyle, blocks }`, which silently
  // DELETED every other field on the document — and the one that matters is
  // `subjectVariants`. Caught 08/05/2026: a New Listing doc carrying the subject
  // "Just listed: 12554 Kellysands Way" came out of the overlay with no subject at all.
  //
  // The brand overlay is stop 4 of five and runs AFTER the recipe has authored, so anything
  // the recipe set that is not a block or a style was being thrown away here by construction.
  // An overlay paints; it does not replace the canvas.
  return { ...doc, globalStyle, blocks };
}
