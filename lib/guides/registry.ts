import type { GuideDef } from "./types";
import { SOURCED_NUMBERS } from "./sourced-numbers";
import { EMAIL_DESIGN } from "./email-design";
import { BUILDER_TIPS } from "./builder-tips";

/** Ordered — hub cards, homepage strip, and sitemap all render this order. */
export const GUIDES: GuideDef[] = [SOURCED_NUMBERS, EMAIL_DESIGN, BUILDER_TIPS];

export function guideBySlug(slug: string): GuideDef | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
