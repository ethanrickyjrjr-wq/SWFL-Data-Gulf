# Lee County Map — What Didn't Work

Complete record of every failed attempt at fixing the holes, black areas, and boundary problems
in the Lee/Collier choropleth map. In order.

---

## Failure 1 — Contractor SVG: 33931 drawn as mainland blob (Jun 19)

**What we tried:** Used the Fiverr contractor SVG directly (949 paths, real coastline layer).

**What happened:** ZIP 33931 (Fort Myers Beach, a barrier island) was assigned to the
south-Lee mainland in the contractor file. Rendered as a blob connected to the mainland.
Verified by rendering the 33931 sub-paths via resvg — they cover the wrong land mass.

**Why it failed:** Source error in the contractor deliverable. Contractor split
Sanibel/Captiva/Pine Island correctly but not Fort Myers Beach.

**What we did:** Sent Fiverr a description of the correct barrier island shape.

---

## Failure 2 — Shipped 33931 to a client-facing report before verifying (Jun 20)

**What we tried:** Wired the contractor SVG into `/r/zip-report` (public choropleth).

**What happened:** 33931 rendered as a mainland blob on a prospect-facing page.
Operator caught it on prod. Had to pull the map off the report immediately.

**Why it failed:** Didn't verify the known-bad ZIP before shipping to a public surface.
The map session's own log already documented the 33931 problem — we just didn't read it
before wiring it in.

---

## Failure 3 — Census-ZCTA build: no actual island separation (Jun 20)

**What we tried:** Built a Census-ZCTA map from GeoJSON (OpenDataDE), projected to SVG.
`scripts/build-zcta-map.mjs`. When I rendered a preview, 33931 appeared as a thin island.
Thought it was fixed.

**What happened:** When actually served, the ZCTA outline was IDENTICAL to the original
census 57-path map. The ZIPs tile edge-to-edge — no water channels. Census ZCTA polygons
share borders, they don't leave ocean gaps between islands and mainland.

**Why it failed:** ZCTA (ZIP Code Tabulation Areas) don't have water. Only the contractor
SVG has a real `the_rest_of_the_coast` coastline layer that separates islands with actual
ocean polygon.

**What we did:** Reverted back to the contractor SVG. Kept the ZCTA build in-repo as
reference but stopped serving it.

---

## Failure 4 — Black blobs: Illustrator decorative paths fell back to fill:black (Jun 21)

**What we tried:** Shipped `public/map/lee-collier.svg` (extracted from the demo) with an
empty `<defs>` block — no `<style>`.

**What happened:** The contractor SVG uses Illustrator class names `cls-2`, `cls-3`, `cls-4`
on 630+193+210 decorative paths inside Lee County's `<g class="cls-5">` group. Without a
`<style>` block defining them, they fell back to SVG default `fill:black`. Solid black blobs
across Lee County.

**Why it failed:** The fix for this already existed in `public/maps/lee-collier.svg`
(the OTHER SVG file, with an 's'). That file had the `<style>` block. We never copied it
to `public/map/lee-collier.svg` (without the 's') when we created the second file.

**What we did:** Restored the `<style>` block (`.cls-2,.cls-3,.cls-4 {fill:none}` + opacity dims).

---

## Failure 5 — Low-value ZIPs invisible: c0 == background color (Jun 21)

**What we tried:** After the style block fix, operator still reported holes. Specifically
the Lehigh block and a few others.

**What happened:** All 3 metric scales (flood, value, permits) had `c0: "#152832"` as the
lowest color stop. The map background is `--gulf-deep: #0f1d24`. These are nearly identical.
Lowest-value ZIPs — the entire Lehigh block (33971-33976, ~$650-710/mo) plus 34142 ($600)
and 33920 ($600) — were painted the same color as the backdrop. Invisible = looked like holes.

**Why it failed:** The data was there and rendering. We just couldn't see it because the
"cold" end of the color scale matched the background. Wasn't missing data — was invisible data.

**What we did:** Lifted each scale's floor to a visible color distinct from the background.

---

## Failure 6 — All fixes were on a branch; build was RED; nothing deployed (Jun 21)

**This is the big one. The operator kept seeing the same holes despite multiple fixes.**

**What happened:** Every map fix from this day was committed to branch
`claude/repo-sync-check-zcrd7u`, NOT `main`. But more importantly, the build was RED.

`components/nav/StandaloneBackBar.tsx:24` called `setState` inside `useEffect`.
That triggers the `react-hooks/set-state-in-effect` ESLint rule → `bunx eslint .` exits 1 →
`next build` fails (runs ESLint) → Vercel build job fails → no deploy.

Production was frozen on an old build = original black holes. Every fix we shipped just
sat undeployed.

**Why it failed:** Pushed into a broken build pipeline without verifying locally. No
`node_modules` installed in the container, so we couldn't run ESLint or next build to
catch the error before pushing.

**What we did:** Fixed `StandaloneBackBar` (moved the setState-in-effect to click time).
Only after that did the CI turn green and all accrued fixes finally deploy.

---

## Failure 7 — Lehigh + NFM fixes went to the WRONG SVG file (Jun 23)

**What we tried:** Applied Lehigh CDP gap-fill + North Fort Myers clip to
`public/maps/lee-collier.svg` (WITH an 's').

**What happened:** `MapCanvas.tsx` fetches from `public/map/lee-collier.svg` (NO 's').
These are two different files at two different paths. Verified visually with red-fill
screenshots — but we were looking at the wrong file in the browser, not the one served
by the actual component.

**Why it failed:** Two SVG files with nearly identical names:
- `public/map/lee-collier.svg` — served by MapCanvas, Hero, homepage
- `public/maps/lee-collier.svg` — served by the old ZipChoropleth component

Fixed the one ZipChoropleth reads. MapCanvas reads the other one. None of those fixes
deployed because MapCanvas never touched the patched file.

**What we did:** `e8cec770` — re-applied the same fixes to the correct file. Then reverted
22 minutes later (`a0afcee5`, reason not recorded). The SVG fixes were re-applied again
in `d2670cba` (to the correct file this time).

---

## Failure 8 — Polygon ZIPs: querySelectorAll("path") skipped polygon elements (Jun 23)

**What we tried:** `querySelectorAll("path")` to find and color all ZIP shapes in MapCanvas.

**What happened:** ZIPs 33972, 33973, 33976, 33965 use `<polygon>` elements instead of
`<path>`. The selector silently skipped them. Those ZIPs got no fill color, no hover state,
no click handler. Appeared as dark/unfilled gaps in the Lehigh area.

**Why it failed:** Assumed all ZIP shapes were `<path>`. The contractor used mixed element
types — most shapes are `<path>`, some are `<polygon>`.

**What we did:** Extended selector to `"path, polygon"` at all 3 call sites in MapCanvas.

---

## Failure 9 — The "right file + polygon" fix was immediately reverted (Jun 23)

**What we tried:** Commit `e8cec770` — applied NFM clip + Lehigh fill to the CORRECT file
(`public/map/lee-collier.svg`) AND extended the MapCanvas selector to `"path, polygon"`.
First time both problems were fixed in the right place simultaneously.

**What happened:** Reverted 22 minutes later in `a0afcee5`. The commit message for the
revert gives no reason. The SVG fixes were removed. The MapCanvas polygon fix was
re-applied separately in `e4e97abc` (MapCanvas only, no SVG changes).

**Why it failed:** Unknown. Possibly a parallel-session conflict. The SVG fix from the
right-file attempt was effectively lost; the Lehigh/NFM fixes remained only in
`public/maps/` (wrong file) until `d2670cba`.

---

## Failure 10 — North Fort Myers 33917: ZCTA boundary overshot into Charlotte County (Jun 23)

**What we tried:** Using the contractor's ZCTA-based polygon for 33917 (North Fort Myers).

**What happened:** Postal ZCTA for 33917 extends to ~26.806°N. The actual North Fort Myers
CDP (census-defined community) ends at ~26.77°N. The ZIP polygon extended visibly north,
overlapping what should be Charlotte County territory.

**Why it failed:** ZCTA = postal delivery area. CDP = Census-defined place. For unincorporated
communities like North Fort Myers, these diverge significantly. The CDP boundary lives in
TIGERweb layer 5 (CDPs), not layer 4 (incorporated places). Also must query by `BASENAME`
not `NAME` because TIGER appends " CDP" to the full name field.

**What we did:** Added `<clipPath id="clip-nfm-cdp">` using the TIGERweb CDP boundary
projected to SVG coordinates via affine transform, applied as `clip-path` on the 33917 group.

---

## Failure 11 — Lehigh cluster: contractor ZCTA polygons don't tile perfectly (Jun 23)

**What we tried:** Relying on the contractor's ZCTA boundaries for the Lehigh cluster
(33936, 33971, 33972, 33973, 33974, 33975, 33976).

**What happened:** Dark gaps/holes appeared between the Lehigh ZIP polygons. The polygons
don't share exact edges — there are slivers between them where the underlying dark SVG
background shows through.

**Why it failed:** ZCTA polygons for adjacent ZIPs in the Lehigh Acres area don't perfectly
tile. The contractor drew them to postal specs which leave small gaps. Also, Lehigh Acres
is a CDP (unincorporated), so the ZCTA polygons don't align to a single enclosing boundary.

**What we did:** Added `<g id="lehigh-cdp-bg">` — a Lehigh Acres CDP boundary polygon
(filled with the no-data background color `#2a3942`) inserted before all zip-groups.
Papers over the tiling gaps without affecting choropleth coloring (MapCanvas selects
`g.zip-group[id]` only; `lehigh-cdp-bg` has no id in that form).

---

## Summary: the categories of failure

1. **Wrong source data** — contractor drew 33931 as mainland (Failures 1, 2)
2. **ZCTA ≠ coastline** — census polygons tile flush, no water (Failure 3)
3. **Two files with nearly the same path** — `public/map/` vs `public/maps/` (Failures 4, 7)
4. **Color floor == background** — invisible data looked like missing data (Failure 5)
5. **Broken build blocked all deploys** — pushed fixes into red CI; prod was frozen (Failure 6)
6. **Wrong element type selector** — `<polygon>` ZIPs skipped by `querySelectorAll("path")` (Failure 8)
7. **Revert with no explanation** — the first commit that got everything right was immediately reverted (Failure 9)
8. **ZCTA vs CDP boundary mismatch** — postal boundaries don't match census community boundaries (Failures 10, 11)
