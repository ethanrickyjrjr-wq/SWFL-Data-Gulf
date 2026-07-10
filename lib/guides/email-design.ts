import type { GuideDef } from "./types";

/**
 * Guide 2 — the design philosophy in plain English (spec §5, strand 2).
 * Every claim here was verified in code on 07/09/2026: 12-column semantic
 * spans (lib/email/doc/schema.ts §layout), photo ratio enum 3:2/4:3/4:5/1:1
 * with 3:2 default (lib/email/blocks/ImageBlock.tsx), readable-ink guards
 * (lib/email/blocks/ink-guards.test.ts), unsubscribe + postal address in the
 * footer block (lib/email/blocks/FooterBlock.tsx).
 */
export const EMAIL_DESIGN: GuideDef = {
  slug: "email-design",
  title: "Why our emails look the way they do",
  kind: "guide",
  description:
    "AI-built emails famously drift toward the same generic look. Ours structurally can't — here's the design system that prevents it.",
  cardImage: "/showcase/seed-previews/magazine-issue.webp",
  hook: "Published research on AI design tools found their output reverts to generic defaults unless something mechanically prevents it. We took that finding literally: our layout rules are enforced in code, so the polish isn't a matter of taste on a given day — it's structural.",
  expect: [
    "Why every layout sits on a 12-column grid with a short list of allowed proportions",
    "Why the headline figure leads — structure built for the skim",
    "How your brand colors are applied without breaking readability",
    "Photo ratios that match how listings are actually shot",
    "The send mechanics handled for you: scheduling, tracked links, one-click unsubscribe",
  ],
  sections: [
    {
      id: "the-grid",
      heading: "A 12-column grid, a short list of proportions",
      bestFor: "understanding why the layouts feel composed, not assembled",
      body: [
        "Every layout in the builder snaps to a 12-column grid, and blocks can only take whole-column widths. You can't drag something to 37% and make it lopsided — the option doesn't exist, and the layout engine won't let blocks overlap or spill past the edge.",
        "Constraint is where the polish comes from. Proportions that read as intentional are the only proportions on offer, which is why two emails built by two different agents both still look finished.",
      ],
      figure: {
        src: "/showcase/seed-previews/just-sold-grid.webp",
        alt: "A just-sold email laid out on the 12-column grid",
        caption: "A just-sold layout on the grid, filled with cited Southwest Florida figures.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "headline-number",
      heading: "The headline figure comes first",
      bestFor: "getting read in a three-second inbox scan",
      body: [
        "The figure your reader cares about leads the email; the story follows it. Most emails get a skim, not a read — structure for the skim and the read takes care of itself.",
      ],
      figure: {
        src: "/showcase/seed-previews/weekly-pulse.webp",
        alt: "A weekly market email leading with headline figures and charts",
        caption:
          "A weekly market read: headline figures first, then the story — every number cited.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "color-discipline",
      heading: "Brand colors, with a readability floor",
      bestFor: "strong brand colors that stay legible",
      body: [
        "Your brand colors are applied everywhere they can be — headers, buttons, accents — but always above a contrast floor. When a brand color would leave text unreadable on a background, the system shifts to the nearest readable version instead of shipping it.",
        "You never have to know what a contrast ratio is. You just never get the email where pale yellow text sits on white.",
      ],
    },
    {
      id: "photo-ratios",
      heading: "Photos at the ratios listings are shot in",
      bestFor: "MLS photos that never look stretched or oddly cropped",
      body: [
        "Property photos default to the standard listing ratio (3:2, with 4:3 and square a click away) and headshots hold portrait framing (4:5), so nothing gets stretched, squashed, or awkwardly cropped on the way in.",
      ],
      figure: {
        src: "/showcase/seed-previews/listing-feature.webp",
        alt: "A listing feature email with full-width property photography",
        caption: "Listing photography held at standard ratios in a feature layout.",
        provenance: "SWFL Data Gulf builder output",
        asOf: "07/09/2026",
      },
    },
    {
      id: "send-mechanics",
      heading: "The send mechanics you stop thinking about",
      bestFor: "set-and-schedule campaigns",
      body: [
        "Scheduling, link tracking, one-click unsubscribe, and your business address in the footer are all handled on every send — no checklist, no plugin, nothing to remember at 9pm on a Thursday.",
      ],
    },
  ],
  tryIt: { label: "Open a template from the showcase", href: "/showcase" },
};
