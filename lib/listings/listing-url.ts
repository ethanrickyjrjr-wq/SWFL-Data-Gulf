// lib/listings/listing-url.ts
//
// THE ONE ROOT FOR "WHERE DOES THIS LISTING LIVE ON THE PUBLIC INTERNET" — the URL a
// New Listing email's single button points at.
//
// Operator decree 08/05/2026, verbatim: *"link the button to the realtor.com listing."*
//
// ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
// Before it, `resolve-subject.ts toFacts` hardcoded `sourceUrl: "https://www.swfldatagulf.com"`
// and `buildListingFlyer` used that same value for BOTH the CTA and the hero photo link. So
// every address-resolved listing email shipped a button labelled "View the Full Listing" that
// went to our HOMEPAGE. That is the exact thing playbook §1.8 forbids in as many words:
// a listing button may never fall back to a homepage, because Gmail's own sender guidelines
// require the recipient know what to expect when they click. It is a deliverability rule,
// not a taste call.
//
// ── THE LADDER — free first, paid last, and NO BUTTON before a wrong one ─────
//   1. The agent's own pasted listing link (lane 2 — their words, their link).
//   2. `data_lake.apify_property_records.property_url` — the vendor's OWN url string,
//      stored verbatim on a row we already bought. Counted live 08/05/2026: **26 of 26
//      rows carry it.** Reading it costs nothing; the row is on disk.
//   3. ONE by-address vendor call, only on an explicit miss, only when a caller opts in.
//      Wired in `paid-record-lane.ts`, not here.
//   4. **NOTHING.** No url → no button. An open slot always beats a bad link.
//
// ── WHAT WE DELIBERATELY DO NOT DO ───────────────────────────────────────────
// **We never fetch a listing portal to build or check a link.** Operator, 08/05/2026:
// *"we aren't fucking scrapping."* The url is a value we already hold, not something to
// go confirm.
//
// And we do NOT derive the url from the free spine, even though it looks derivable: the
// paid row's `property_id` `6551280400` is exactly its permalink's `M65512-80400`, and the
// free spine carries `property_id` on 34,904 of 35,202 rows. Checked against 20 held
// permalinks, **13 of 20 rebuild byte-exact — and all 7 misses are unit/condo addresses**
// whose permalink carries an `-Apt-703` / `-Unit-422` / `-H9` token no column of ours holds.
// A url that is right 65% of the time is a broken link in one email out of three, and the
// only way to know which is to fetch the page. Not adopted, and recorded here so the next
// session does not rediscover it as an idea.

/** Is this a real, absolute http(s) URL? Anything else is not a destination. */
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
}

/**
 * Our own site. Legal as a CITATION (`facts.sourceUrl` — where a reader checks our data)
 * and NEVER legal as a listing button's destination. The two are different jobs and
 * conflating them is what put the homepage behind "View the Full Listing".
 */
const OUR_SITE = /^https?:\/\/(www\.)?swfldatagulf\.com\/?$/i;

/**
 * The public URL for THIS listing, or null.
 *
 * `null` is a first-class answer and the caller MUST honour it by dropping the button
 * entirely — never by substituting a homepage, a search page, or our own site.
 */
export function listingButtonUrl(facts: {
  listingUrl?: string;
  sourceUrl?: string;
}): string | null {
  // 1. The url the paid row (or the agent's pasted link) put on the facts.
  if (isHttpUrl(facts.listingUrl)) return facts.listingUrl.trim();

  // 2. `sourceUrl` is the CITATION field and usually holds our own site — which is
  //    exactly the value that must never become a button. It is only usable here when
  //    the scrape lane put a REAL listing page in it (the pasted-URL path does).
  const src = facts.sourceUrl?.trim();
  if (isHttpUrl(src) && !OUR_SITE.test(src)) return src;

  // 3. No real link → NO BUTTON.
  return null;
}
