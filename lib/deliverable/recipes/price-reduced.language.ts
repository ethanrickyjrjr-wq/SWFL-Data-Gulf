// lib/deliverable/recipes/price-reduced.language.ts
//
// THE APPROVED WORDS for Price Improved — starting set for the §2.7 walk. The walk
// session may reword; reworded sentences replace these IN THIS FILE in the same
// session (never in a prompt, never in the playbook only). Playbook §2.7 lists the
// shipped set verbatim as this email's Voice Card extension (§1.20).
//
// Register rules inherited from the recipe's own walked framing (price-reduced.ts —
// the framing block in buildPriceReduced): the cut is stated ONCE, plain words, NO
// figures (they sit in the hero and the strip directly above the paragraph), no
// reason for the move, no market claim, no urgency, no CTA (the button does that
// job). Every sentence's FIXED WORDS are digit-free (auditBankTemplates enforces it);
// the street slot's VALUE carries the house number, which is fine — the address is
// settled fact upstream (shared.ts anchors it), and the no-figures rule is about
// prices and specs, never the street line.
import type { SentenceBank } from "../language";

export const PRICE_REDUCED_BANK: SentenceBank = {
  recipe: "price-reduced",
  research: [
    "_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md",
    "_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md",
    "_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md",
  ],
  sentences: [
    {
      // The ONE legal mention of the move — plain words, zero figures. The slot only
      // receives a value when the vendor flags a reduction (bankValues in the recipe),
      // so this sentence can never announce a move the record doesn't hold.
      text: "The price on {{street}} just came down.",
      slots: [{ name: "street", type: "address", label: "Street address" }],
    },
    {
      // Auto-fills from the parcel-resolved subdivision (communityStats.subdivisionName —
      // the same field the narrator's inside-the-gate lane keys on). Drops whole on a
      // miss: never "The home sits inside ."
      text: "The home sits inside {{community}}.",
      slots: [{ name: "community", type: "community", label: "Community name" }],
    },
  ],
};
