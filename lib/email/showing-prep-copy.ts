// lib/email/showing-prep-copy.ts
//
// Shared framing copy for the Showing Prep Packet — used at both trigger points
// (the pill's tooltip, the assistant's post-build reply) so the "what is this"
// explanation stays in sync in one place. The packet is an agent-facing prep
// document, not a buyer-facing marketing email — the copy exists because that
// distinction isn't obvious from "build a packet" alone.
//
// Every action named below is a REAL, already-shipped capability — verified before
// writing this copy, not assumed: build further in the Lab (it lands there as a
// block-canvas deliverable), save as PDF (lib/pdf/email-doc-pdf.tsx), print (the
// browser print of that PDF/canvas), email yourself (the existing send flow). The
// one capability NOT wired today is a true scheduled/automatic refresh — the
// scheduled-occurrence lane (lib/email/emaildoc-occurrence.ts) rebuilds a
// block-canvas doc via the generic buildContentDoc AI-fill, not this packet's
// dedicated four-lane sourcing (gatherShowingPrepData/buildShowingPrepDoc), so a
// recurring send would NOT genuinely re-pull fresh comps/map/snapshot. Don't
// promise "automatic" until that's actually wired (tracked separately). What IS
// real today: rebuilding on demand, one click, right before the next showing.

/** Short — a tooltip on the pill button. */
export const SHOWING_PREP_INTRO_SHORT =
  "Not an email — a working packet for the showing (subject + comps + local market). Build it further in the Lab, save as PDF, print it, or email it to yourself.";

/** Full — the assistant's reply after a chat-triggered build. */
export const SHOWING_PREP_INTRO_NOTE =
  "This is your Showing Prep Packet, not a marketing email — a working document for the showing: the subject listing, nearby comps, and the local market, all in one place.\n\n" +
  "From here you can keep building it in the Lab, save it as a PDF, print it, or email it to yourself. Rebuild it fresh with one click right before your next showing to pull the latest comps and market numbers.";
