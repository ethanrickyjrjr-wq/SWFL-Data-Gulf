#!/usr/bin/env node
/**
 * Clean the contractor coastline SVG into the served choropleth asset.
 *
 * Source : public/maps/Lee County and Collier County-01.svg  (1.14MB, 949 paths,
 *          57 ZIP <g> groups, islands split as sub-paths, coastline + county layers)
 * Output : public/maps/lee-collier.svg  (served by components/charts/ZipChoropleth.tsx)
 *
 * Why this exists: the previously-served lee-collier.svg was a 57-path Census-TIGER
 * version with NO coastline — every ZIP was one merged polygon, so Fort Myers Beach
 * (33931) rendered welded to the mainland. The contractor SVG draws each island as
 * its own sub-path, so rendering its real geometry makes islands read as islands.
 *
 * IMPORTANT: the contractor paths are stroke-only outlines — classes cls-2/3/4 mean
 * `fill:none`. Two classes (cls-1 opacity .6, cls-5 opacity .4) define NO fill, so
 * their 3 elements default to SVG black. We KEEP the original <style> (so cls-2/3/4
 * stay fill:none — no accidental black blobs) and only APPEND overrides:
 *   - cls-1/cls-5 -> fill:none           (kills the 3 stray black shapes in Lee)
 *   - .zip-group path -> default gray    (runtime component overrides per data)
 *   - coast -> water, county -> outline
 * Plus: strip the `_` id prefix, tag each ZIP <g> with class="zip-group", id the root.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "public/maps/Lee County and Collier County-01.svg";
const OUT = "public/maps/lee-collier.svg";

let svg = readFileSync(SRC, "utf8");

// 1. strip underscore prefix on 5-digit ZIP ids
svg = svg.replace(/id="_(\d{5})"/g, 'id="$1"');

// 2. tag each ZIP group for runtime targeting — MERGE into any existing class
svg = svg.replace(/<g\b([^>]*\bid="\d{5}"[^>]*)>/g, (_m, attrs) => {
  if (/\bclass="/.test(attrs)) {
    return `<g${attrs.replace(/\bclass="([^"]*)"/, 'class="$1 zip-group"')}>`;
  }
  return `<g${attrs} class="zip-group">`;
});

// 3. give the root <svg> a stable id
svg = svg.replace(/<svg /, '<svg id="contractor-map" ');

// 4. APPEND overrides inside the contractor's own <style> (keeps cls-2/3/4 fill:none)
const overrides = `
      /* --- choropleth overrides (appended) --- */
      /* cls-1 (34139) and cls-5 (33922 Matlacha, 34110) are dimmed ZIP groups, not
         decorations — reset their group opacity so they fill like every other ZIP. */
      #contractor-map .zip-group { opacity: 1; }
      #contractor-map .zip-group path { fill: #e5e7eb; stroke: #ffffff; stroke-width: 0.4px; opacity: 1; }
      #contractor-map #the_rest_of_the_coast,
      #contractor-map #the_rest_of_the_coast * { fill: #dbeafe; stroke: none; opacity: 1; }
      #contractor-map #Lee_county *,
      #contractor-map #Collier_County * { fill: none; stroke: rgba(15,23,42,0.18); stroke-width: 0.5px; opacity: 1; }
    `;
svg = svg.replace(/<\/style>/, `${overrides}</style>`);

writeFileSync(OUT, svg);

const zipGroups = (svg.match(/class="[^"]*zip-group"/g) || []).length;
const paths = (svg.match(/<path/g) || []).length;
const leftoverUnderscore = (svg.match(/id="_\d{5}"/g) || []).length;
console.log(`wrote ${OUT}`);
console.log(`  zip groups: ${zipGroups}  (expect 57)`);
console.log(`  paths: ${paths}  (expect 949)`);
console.log(`  leftover _NNNNN ids (expect 0): ${leftoverUnderscore}`);
