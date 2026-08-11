// lib/email/new-email-captures.ts
//
// THE ONE list of new-email captures — operator decree 08/10/2026 ("old emails
// out, no path to them; everything is only the new emails"). Every surface
// that shows "the emails we build" reads THIS module: /showcase (NewEmails)
// and the in-lab first-run picker (TemplateGallery). Never re-create a second
// key→capture map or a second category list — that split is exactly how the
// old seed gallery survived the /showcase purge for a day.
//
// Client-safe: pure data, no fs, no server imports.

import type { RecipeKey } from "@/lib/deliverable/recipes";

/** A real rendered HTML file under public/new-emails/, or absent when this
 *  recipe has no capture yet (the recipe still builds — hosts render a
 *  labelled holder, never a fabricated preview). Re-baked from the registry
 *  by scripts/email/render-*.mts — a recipe change that doesn't re-bake its
 *  capture in the same commit is an incomplete ship (SESSION_LOG 08/10/2026). */
export const NEW_EMAIL_FILE_FOR_KEY: Partial<Record<RecipeKey, string>> = {
  "coming-soon": "/new-emails/coming-soon-email.html",
  "new-listing": "/new-emails/new-listing-email.html",
  "open-house": "/new-emails/open-house-email.html",
  "market-comps": "/new-emails/market-comps-email.html",
  "price-reduced": "/new-emails/price-reduced-email.html",
  "under-contract": "/new-emails/under-contract-email.html",
  "just-sold": "/new-emails/just-sold-email.html",
  "back-on-market": "/new-emails/back-on-market-email.html",
  "agent-brand-intro": "/new-emails/agent-brand-intro-email.html",
  "market-pulse": "/new-emails/market-pulse-email.html",
};

/** Lifecycle first, every key a real `RECIPES` entry, in send order. */
export const NEW_EMAIL_CATEGORIES: { id: string; title: string; keys: RecipeKey[] }[] = [
  {
    id: "listing-lifecycle",
    title: "Listing Lifecycle",
    keys: [
      "coming-soon",
      "new-listing",
      "open-house",
      "market-comps",
      "price-reduced",
      "under-contract",
      "just-sold",
      "back-on-market",
    ],
  },
  {
    id: "agent-community",
    title: "Agent & Community",
    keys: [
      "agent-brand-intro",
      "agent-launch",
      "sphere-weekly",
      "review-reply",
      "community-info",
      "listings-showcase",
      "listings-digest",
    ],
  },
  {
    id: "recurring",
    title: "Recurring",
    keys: ["market-pulse"],
  },
];
