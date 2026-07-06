/**
 * lib/email/sequence/types.ts — lifecycle-sequence step + setup shapes.
 * Spec: docs/superpowers/specs/2026-07-05-lifecycle-sequences-design.md.
 * The steps jsonb on email_sequences / email_sequence_setups parses through
 * these schemas at every boundary — never trust stored JSON blind.
 */
import { z } from "zod";
import { seedById } from "@/lib/email/doc/default-docs";
import type { BlockType } from "@/lib/email/doc/types";

export const STEP_KEYS = [
  "coming-soon",
  "new-listing",
  "market-comps",
  "under-contract",
  "sold",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type StepState = "pending" | "built" | "scheduled" | "sent" | "skipped";

export const SetupStepSchema = z.object({
  key: z.enum(STEP_KEYS),
  title: z.string().min(1),
  recipe_prompt: z.string().min(1),
  seed_doc_id: z.string().min(1),
});
export type SetupStep = z.infer<typeof SetupStepSchema>;

export const SequenceStepSchema = SetupStepSchema.extend({
  state: z.enum(["pending", "built", "scheduled", "sent", "skipped"]),
  deliverable_id: z.string().nullish(),
  schedule_id: z.number().int().nullish(),
  scheduled_for: z.string().nullish(),
  sent_at: z.string().nullish(),
});
export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export const SequenceStepsSchema = z.array(SequenceStepSchema);
export const SetupStepsSchema = z.array(SetupStepSchema);

/** The platform arc — the five listing-to-close recipes VERBATIM from
 *  lib/showcase/registry.ts, each paired with an existing seed layout. Users
 *  without a saved default arm from this constant (it has no DB row). */
export const PLATFORM_ARC: SetupStep[] = [
  {
    key: "coming-soon",
    title: "Coming Soon",
    recipe_prompt:
      "Build a coming-soon teaser email for my listing at [[your listing address]] — hold the street address back, use real county inventory counts to show how scarce homes like it are, and one CTA to join a private preview list.",
    seed_doc_id: "listing-feature",
  },
  {
    key: "new-listing",
    title: "New Listing",
    recipe_prompt:
      "Build a new-listing announcement email for my listing at [[your listing address]] — key specs, price per square foot, a chart of the ZIP's home-value trend, and one honest line about where that market sits.",
    seed_doc_id: "new-listing",
  },
  {
    key: "market-comps",
    title: "Market Comps",
    recipe_prompt:
      "Build a market-comps email for my listing at [[your listing address]] — six live comparable listings nearby with each price and price per square foot, a price bar chart, and a straight case for my asking price.",
    seed_doc_id: "neighborhood-report",
  },
  {
    key: "under-contract",
    title: "Under Contract",
    recipe_prompt:
      "Build an under-contract announcement email for my listing at [[your listing address]] — lead with how fast it went pending compared to the ZIP's typical days on market, and invite backup offers.",
    seed_doc_id: "market-spotlight",
  },
  {
    key: "sold",
    title: "Sold",
    recipe_prompt:
      "Build a just-sold email for my listing at [[your listing address]] — set the close among the week's real sales nearby, and end with a private home-valuation offer for my readers.",
    seed_doc_id: "just-sold",
  },
];

const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Header",
  hero: "Hero",
  stats: "Live stats",
  signal: "Live market signal",
  text: "Text",
  image: "Image",
  listing: "Listing card",
  "multi-column": "Columns",
  list: "List",
  "metric-card": "Live metric",
  "agent-card": "Agent card",
  "agent-hero": "Agent hero",
  "social-icons": "Social links",
  button: "Button",
  divider: "Divider",
  footer: "Footer",
};

/** Block types whose content refreshes from the lake when the piece is built —
 *  the preview marks these "fills fresh at build" (operator, 07/05/2026). */
export const LIVE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "stats",
  "signal",
  "metric-card",
  "listing",
]);

/** Human section labels for the $0 layout preview ("all layouts with numbers and
 *  sections that will change" — operator, 07/05/2026). Unknown block types fall
 *  back to their raw type string rather than vanishing. */
export function stepSectionLabels(seedDocId: string): string[] {
  const seed = seedById(seedDocId);
  if (!seed) return [];
  return seed.build().blocks.map((b) => BLOCK_LABELS[b.type] ?? b.type);
}

/** The same list with the live-slot flag, for preview rendering. */
export function stepSections(seedDocId: string): { label: string; live: boolean }[] {
  const seed = seedById(seedDocId);
  if (!seed) return [];
  return seed.build().blocks.map((b) => ({
    label: BLOCK_LABELS[b.type] ?? b.type,
    live: LIVE_BLOCK_TYPES.has(b.type),
  }));
}
