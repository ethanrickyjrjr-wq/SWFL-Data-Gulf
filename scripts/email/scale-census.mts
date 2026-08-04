// scripts/email/scale-census.mts
//
// MEASURE, don't assert. Renders the comps email's real chrome through the real
// render root and counts every font-size and font-weight that actually ships,
// then checks each against the ONE type root (lib/email/blocks/scale.ts).
//
// Why this exists: on 08/03/2026 the operator said the comp email's fonts were
// "ALL FUCKED" and the session opened a check instead of measuring. `scale.test.ts`
// covers the SEED templates only — never a doc built by the lifecycle chrome that
// every listing recipe (including market-comps) lands on.
//
// NO vendor calls, no LLM, no spend: buildLifecycleEmail is pure, so this measures
// the TYPE SYSTEM on the real block set. It cannot catch a data-dependent overflow
// (a long address wrapping, a clipped stat) — that needs a rendered screenshot.
// Stated here so a green run is never mistaken for "the email looks right".
//
//   bun scripts/email/scale-census.mts

import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import { TYPE, WEIGHT } from "@/lib/email/blocks/scale";

const doc = buildLifecycleEmail(
  { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] },
  {
    ribbon: "What Sold Near You",
    photo: null,
    heroValue: "$385,000",
    heroLabel: "409 SW 44th St, Cape Coral",
    specs: [
      { label: "Beds", value: "3" },
      { label: "Baths", value: "2" },
      { label: "Sq Ft", value: "1,978" },
      { label: "$/Sq Ft", value: "$195" },
      { label: "Days on Market", value: "34" },
    ],
    ctaLabel: "Find Out More About This Home",
  },
);

const html = await renderEmailDocHtml(doc);

const grab = (re: RegExp) => {
  const counts = new Map<number, number>();
  for (const m of html.matchAll(re)) {
    const n = Number(m[1]);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const sizes = grab(/font-size:\s*(\d+)px/g);
const weights = grab(/font-weight:\s*(\d+)/g);

const legalSizes = new Set<number>(Object.values(TYPE));
const legalWeights = new Set<number>(Object.values(WEIGHT).map(Number));

console.log(`blocks: ${doc.blocks.length}  |  html: ${html.length} bytes`);
console.log(`\nLEGAL SIZES   ${[...legalSizes].sort((a, b) => a - b).join(", ")}`);
console.log(`LEGAL WEIGHTS ${[...legalWeights].sort((a, b) => a - b).join(", ")}`);

let bad = 0;
console.log("\nFONT SIZES IN THE RENDERED HTML");
for (const [px, n] of sizes) {
  const ok = legalSizes.has(px);
  if (!ok) bad++;
  console.log(
    `  ${String(px).padStart(3)}px  x${String(n).padStart(3)}  ${ok ? "ok" : "OFF-SCALE"}`,
  );
}
console.log("\nFONT WEIGHTS IN THE RENDERED HTML");
for (const [w, n] of weights) {
  const ok = legalWeights.has(w);
  if (!ok) bad++;
  console.log(`  ${String(w).padStart(3)}    x${String(n).padStart(3)}  ${ok ? "ok" : "ILLEGAL"}`);
}

console.log(
  `\nVERDICT: ${bad === 0 ? "every size and weight is on the scale" : `${bad} off-scale value(s)`}`,
);
console.log(
  "NOT COVERED: wrapping, clipping, spacing, hierarchy, and anything data-dependent.\n" +
    "A clean run here does NOT mean the email looks right.",
);
