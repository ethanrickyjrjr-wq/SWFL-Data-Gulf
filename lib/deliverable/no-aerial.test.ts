// lib/deliverable/no-aerial.test.ts
//
// THE GUARD FOR A DECREE, NOT A PREFERENCE. Operator, 08/03/2026 (raised for at least the
// second time): "WE CAN'T HAVE FUCKING ARIEL VIEWS....AGAIN!!!! PHOTOS OF THE FUCKING
// LISTING. THAT'S IT AND LINK TO REALTOR.COM LISTING OR SOLD LISTING OF THE PROPERTY."
//
// A property visual is a REAL PHOTO OF THAT LISTING or there is no image. The satellite
// aerial was never rejected before because it was ENGINE-SET — it was in the doc, so the
// URL allowlist waved it through. This file locks the deny rule that closes that hole,
// and locks the module deletion so nobody re-introduces the builder.

import { test, expect, describe } from "bun:test";
import { lintCompiledHtml, lintTextUrls, collectAllowedUrls } from "./url-lint";

const AERIAL =
  "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/-81.98,26.69,16/600x360@2x?access_token=pk.test";
const STREET_MAP =
  "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+000(-81.98,26.69)/auto/600x360@2x?access_token=pk.test";
const REAL_PHOTO =
  "https://ap.rdcpix.com/58e2beec49052b35a2f5035d8ae48b83l-m463479459s-w480_h360_x2.webp";

describe("no aerial may reach a customer", () => {
  test("a satellite aerial is a violation EVEN WHEN it is in the doc's allowed set", () => {
    // This is the exact shape that shipped: the engine built the URL, so it was allowed.
    const allowed = collectAllowedUrls({ blocks: [{ imageUrl: AERIAL }] });
    expect(allowed.has(AERIAL)).toBe(true); // allowlist alone would have passed it
    const res = lintCompiledHtml(
      `<img src="${AERIAL}" alt="Aerial view of 330 Main St" />`,
      allowed,
    );
    expect(res.ok).toBe(false);
    expect(res.violations[0].url).toContain("satellite");
    expect(res.stripped).not.toContain("api.mapbox.com"); // the <img> is removed outright
  });

  test("a bare satellite URL in text is stripped too", () => {
    const res = lintTextUrls(`see ${AERIAL}`, collectAllowedUrls(AERIAL));
    expect(res.ok).toBe(false);
    expect(res.stripped).not.toContain("mapbox");
  });

  test("a REAL listing photo passes untouched", () => {
    const allowed = collectAllowedUrls({ photo: REAL_PHOTO });
    const res = lintCompiledHtml(
      `<img src="${REAL_PHOTO}" alt="Listing photo of 5427 Osprey Ct" />`,
      allowed,
    );
    expect(res.ok).toBe(true);
    expect(res.stripped).toContain(REAL_PHOTO);
  });

  test("a realtor.com listing link passes untouched", () => {
    const url =
      "https://www.realtor.com/realestateandhomes-detail/5427-Osprey-Ct_Sanibel_FL_33957_M55474-96345";
    const res = lintCompiledHtml(`<a href="${url}">See the listing</a>`, collectAllowedUrls(url));
    expect(res.ok).toBe(true);
  });

  test("the showing-prep STREET map is not collateral damage", () => {
    // A pin map is a map, not a substitute for a photo of the house. Still legal.
    const res = lintCompiledHtml(
      `<img src="${STREET_MAP}" alt="Map of the route" />`,
      collectAllowedUrls(STREET_MAP),
    );
    expect(res.ok).toBe(true);
  });

  test("the aerial URL builder module is gone and stays gone", async () => {
    let resolved = true;
    try {
      await import("@/lib/listings/aerial");
    } catch {
      resolved = false;
    }
    expect(resolved).toBe(false);
  });
});
