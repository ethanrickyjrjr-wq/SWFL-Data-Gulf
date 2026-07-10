import type { GuideDef } from "./types";
import { SOURCED_NUMBERS } from "./sourced-numbers";

/** Ordered — hub cards, homepage strip, and sitemap all render this order. */
export const GUIDES: GuideDef[] = [SOURCED_NUMBERS];

export function guideBySlug(slug: string): GuideDef | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
