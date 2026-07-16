// lib/desk/portal-link.ts — external portal lookup URLs for wire items.
//
// The listing lake holds NO vendor detail URL by design (incognito source),
// so wire items link out via an ADDRESS lookup on a public portal. Zillow's
// address-slug scheme was verified live 07/16/2026 (crawl4ai), with and
// without the ZIP suffix. Unofficial contract — this file is its single
// owner, so a format change is a one-file fix.
//
// These URLs are navigation conveniences, NEVER provenance: they ride
// FlashItem.lookupHref, which flashNoteText deliberately does not include.

/** "605 Galleon Dr #B" -> "605-Galleon-Dr-B". A literal `#` would truncate
 *  the URL path as a fragment, so everything outside [A-Za-z0-9 ] drops. */
function slugify(part: string): string {
  return part
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function zillowAddressUrl(
  street: string | null | undefined,
  city: string | null | undefined,
  zip?: string | null,
): string | undefined {
  const s = street ? slugify(street) : "";
  const c = city ? slugify(city) : "";
  if (!s || !c) return undefined;
  const z = zip && /^\d{5}$/.test(zip) ? `-${zip}` : "";
  return `https://www.zillow.com/homes/${s}-${c},-FL${z}_rb/`;
}
