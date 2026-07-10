/**
 * Content model for the public /guides hub (spec:
 * docs/superpowers/specs/2026-07-09-guides-hub-design.md §1). Pure data — the
 * article template in components/guides/ renders these; registry.test.ts
 * enforces the invariants (asset existence, as-of format, no internal nouns).
 */

export interface ArtifactFigure {
  /** Path under public/, leading slash. Reuse committed showcase assets only. */
  src: string;
  alt: string;
  /** Reader-facing caption — what the figure shows, plain English. */
  caption: string;
  /** Named source, copied verbatim from public/showcase/seed-previews/assets/README.md. */
  provenance: string;
  /** MM/DD/YYYY. */
  asOf: string;
}

export interface TryIt {
  label: string;
  href: string;
}

export interface GuideSection {
  /** Anchor id — kebab-case, unique within the guide. */
  id: string;
  heading: string;
  /** Figma-style italic tagline: “Best for …”. */
  bestFor?: string;
  /** Paragraphs. */
  body: string[];
  proTips?: string[];
  figure?: ArtifactFigure;
  tryIt?: TryIt;
}

export interface GuideDef {
  slug: string;
  title: string;
  kind: "guide" | "tips";
  /** Card copy (hub cards, homepage strip, meta description). 1–2 sentences. */
  description: string;
  /** Card art + OG image. Webp capture under public/. */
  cardImage: string;
  /** Pain-point intro paragraph. */
  hook: string;
  /** “Here’s what you can expect” bullets. May be empty for kind "tips". */
  expect: string[];
  sections: GuideSection[];
  /** Article-level closing CTA. */
  tryIt: TryIt;
}
