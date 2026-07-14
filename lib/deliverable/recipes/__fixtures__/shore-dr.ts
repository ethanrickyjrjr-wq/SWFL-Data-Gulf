// The resolved subject for 326 Shore Dr, Fort Myers 33905 — the live vendor body
// captured 07/13/2026 (property_id 6951062705) and already committed, verbatim, as
// the fixture every listing-recipe test drives. Lifted here UNCHANGED so a dev
// surface can render the real emails without a vendor call.
//
// NOT a demo. NOT invented. Every field below is the vendor's own value.
// The ONE thing that is not real: `photos`. The live build's hero image URL was
// never persisted (the Lab only writes a doc on an explicit Save), so the test's
// placeholder stands and the photo renders as an empty box. That absence is the
// honest state — do not substitute another house's picture to fill it.
import type { ListingFacts } from "@/lib/email/listing-scrape";

export const SHORE_DR_FACTS: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL, 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  isNewConstruction: true,
  isPriceReduced: true,
  priceReduction: "$104,975",
  photos: ["https://example.test/photo.webp"], // NOT REAL — see note above.
  lat: 26.688788,
  lon: -81.805899,
  sourceUrl: "https://www.swfldatagulf.com",
};
