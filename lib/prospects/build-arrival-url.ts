import type { BrandEnrichment } from "./enrich-brand";

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Build the personalized arrival URL the welcome page parses:
 * /welcome?name=&primary=&secondary=&logo=
 * Honors the page's exact validators (HEX_RE, ^https?://) so the page never
 * receives a value it would reject. Pure — no I/O.
 */
export function buildArrivalUrl(input: {
  name?: string;
  brand?: BrandEnrichment | null;
  base?: string;
}): string {
  const { brand, base = "" } = input;
  const name = input.name ?? brand?.company_name ?? undefined;
  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (brand?.primary && HEX_RE.test(brand.primary)) params.set("primary", brand.primary);
  if (brand?.secondary && HEX_RE.test(brand.secondary)) params.set("secondary", brand.secondary);
  if (brand?.logo_url && /^https?:\/\//i.test(brand.logo_url)) params.set("logo", brand.logo_url);
  const qs = params.toString();
  const path = qs ? `/welcome?${qs}` : "/welcome";
  return base ? new URL(path, base).href : path;
}
