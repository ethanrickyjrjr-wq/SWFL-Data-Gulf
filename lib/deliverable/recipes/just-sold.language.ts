// lib/deliverable/recipes/just-sold.language.ts
//
// THE APPROVED WORDS for Just Sold — the agent-pride voice, by operator decree
// 08/09/2026, verbatim: *"TALK ABOUT IN A GOOD LIGHT AS IF IT SOLD IN LESS DAYS ON
// MARKET AS TO OTHERS AND AT A GOOD PRICE PER FOOT. TALK LIKE A REAL ESTATE AGENT WHO
// DID A GOOD JOB IN A COMMUNITY AND OTHERS SHOULD BE INTERESTED IF THEY ARE LOOKING TO
// SELL."* This supersedes the recipe's earlier "names no figure, ever" body rule —
// WITH the sourcing line intact:
//
//   *** A FIGURE ENTERS THIS PROSE ONLY THROUGH A SLOT, AND A SLOT ONLY FILLS FROM
//       THE RECORDED, SIZE-BANDED DATA (soldStoryValues in just-sold.ts). ***
//
// A prefill hero fills NO figure slot (prose is baked and uneditable — acceptance
// assertion 8), and the two bragging sentences fill ONLY when the comparison they
// state is TRUE of the size-banded comp set: sold quicker than the nearby median, or
// a stronger $/sq ft than the nearby median. When the data does not support the brag,
// the sentence drops WHOLE (drop-whole render, language.ts) — the voice stays proud
// via the fixed sentence, and nothing is ever invented. Favorable framing chooses
// which TRUE things to say; it never manufactures one. This is also playbook §2.5.5
// G2 (days to sell, recorded rung — never days_in_state) landing in the body.
//
// Fixed words are digit-free (auditBankTemplates enforces it); the street slot's VALUE
// carries the house number, which is fine — the address is settled fact upstream.
import type { SentenceBank } from "../language";

export const JUST_SOLD_BANK: SentenceBank = {
  recipe: "just-sold",
  research: [
    "_RESEARCH/email-and-social/2026-08-06-just-sold-craft-and-agent-email-voice.md",
    "_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md",
    "_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md",
  ],
  sentences: [
    {
      // The announcement, in the agent's own voice. Fills whenever we hold a street.
      text: "{{street}} is officially sold.",
      slots: [{ name: "street", type: "address", label: "Street address" }],
    },
    {
      // THE SPEED BRAG — §2.5.5 G2 built. Both slots fill together, and ONLY when the
      // subject's recorded closed-spell beat the banded nearby median (soldStoryValues
      // gates it) — so the fixed word "quicker" is true every time it ships.
      text:
        "It went from hitting the market to closed in {{dom}} days — quicker than the " +
        "{{typical_dom}}-day pace of recent sales nearby.",
      slots: [
        { name: "dom", type: "number", label: "Days on market (recorded)" },
        { name: "typical_dom", type: "number", label: "Typical nearby days on market" },
      ],
    },
    {
      // THE PRICE-PER-FOOT BRAG. Fills ONLY when the recorded close ÷ sq ft beat the
      // banded nearby median $/sq ft — "stronger" is a measured comparison, not a mood.
      text:
        "The sale came in at {{ppsf}} per square foot — a stronger number than the " +
        "typical recent sale for a home this size nearby.",
      slots: [{ name: "ppsf", type: "money", label: "Sold price per square foot" }],
    },
    {
      // The agent-did-good line. No slots, digit-free, ships every time — the voice the
      // decree asked for even when neither comparison could arm.
      text: "Results like this are not luck — the right price and the right marketing did their job.",
      slots: [],
    },
  ],
};
