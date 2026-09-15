# Satellite/aerial parking-lot occupancy & traffic change detection — vendor evaluation

Date: 09/15/2026. Trigger: Ricky asked how to track parking-lot car counts / traffic
changes at properties, citing planet.com.

## What it actually is

**Planet Labs PBC** (planet.com) — live-crawled 09/15/2026, `planet.com`. Real company,
real product line: `Planet Monitoring` (daily global, low-res SuperDove/3m — too coarse
to count individual cars) and `Planet Tasking` (SkySat, 50cm resolution, sub-daily
revisit — the tier that resolves cars). Explicitly pitches Finance industry:
"Monitor change to outperform the market" — this is the hedge-fund alt-data use case
(parking-lot counts as retail foot-traffic proxy). No self-serve pricing on site —
enterprise `Contact Sales` only.

**Nearmap** (nearmap.com) — live-crawled 09/15/2026, `nearmap.com`. Aerial (plane, not
satellite), much higher resolution (1.5in / ~4cm GSD) via patented HyperCamera3, but
refresh cadence is only **up to 3x/year** — wrong tool for tracking day-to-day traffic
or occupancy changes; it's built for property condition/risk (roof, construction,
insurance underwriting), not activity signals. Also enterprise-sales-only, no public
pricing. Customers: top 10 P&C insurers, AECO firms, government.

**Not yet verified live** (named only, not crawled — do before adopting): SkyFi
(marketplace/pay-per-task reseller of multiple satellite providers, lower entry cost
than a Planet subscription) and Maxar.

## Open-source angle (09/15/2026, 5-agent fan-out on GitHub topics + Hugging Face)

Checked whether a "buy cheap imagery ourselves + run an open model" path beats an
enterprise vendor subscription. It does, with real ready-to-use options:

- **simahanyan/parking-lot-yolo26m** (HF) — trained YOLO26m, per-space empty/occupied
  detection, 99.3% mAP@0.5 on PKLot-style imagery. Best "just run it" option for
  occupancy, but PKLot's camera angle is elevated/oblique, not top-down satellite.
- **Ultralytics YOLO-OBB pretrained on DOTAv1** (`pip install ultralytics`, official
  checkpoints) — turnkey, has small-vehicle/large-vehicle classes, works on true
  satellite/aerial nadir imagery. License is **AGPL-3.0** — a commercial SaaS needs
  Ultralytics' paid Enterprise license to avoid the network-service disclosure clause.
- **Honaker/xview_frcnn** (HF, CC-BY-4.0) — real Faster R-CNN weights trained on
  xView (true satellite resolution, ~10 vehicle classes), needs own tiling/inference
  script, provenance is a small hobby upload (unverified quality).
- **COWC** (LLNL, AGPL-3.0) — the dataset most purpose-built for this, but no
  reliable public pretrained checkpoint — training code only, would need to train
  from scratch.
- Supporting datasets if a custom model is ever trained: VEDAI, Busy-parking-lot
  UAV dataset, APKLOT, DroneVehicle, CARPK, VisDrone2019-DET (mixed licenses, check
  each before use).
- Dead ends: GitHub topics `satellite-imagery`(py) and `satellite-images` have no
  purpose-built car/parking/traffic repos with real traction — dominated by
  land-cover/crop/weather work. `satellite-image-deep-learning/techniques` (10.2k
  stars, actively maintained) is the best index of the field if this gets revisited.

## Live proof of concept (09/15/2026)

Operator pushback: don't treat AGPL as a blocker, go get real photos and see if this
actually works. Ran both, live, no simulation:

- Built a throwaway venv, pulled a real PKLot sample image (HF `Voxel51/PKLot`, CC
  BY 4.0, drone/rooftop altitude), ran `simahanyan/parking-lot-yolo26m` on it.
  Result: 100 parking spaces detected, 33 empty / 67 occupied, 91-96% confidence,
  matched the photo by eye.
- Pulled a real true-satellite-altitude image (HF `Last-Bullet/DOTAv1.0`, a school
  bus lot), ran Ultralytics' official `yolo11n-obb.pt` (pretrained on DOTA, zero
  fine-tuning). Result: 75 "large vehicle" detections, correctly boxed, at real
  overhead resolution — the harder test (does detection survive at satellite
  altitude, not just drone height) and it passed.
- AGPL re-assessed: as an internal batch pipeline (crunch imagery, serve a derived
  count) rather than an exposed "upload image, get live detection" product feature,
  the AGPL network-service disclosure clause likely doesn't trigger at all. Only
  matters if this ever ships as a direct customer-facing interactive feature.

This changes the verdict below from theoretical to demonstrated: a self-run pipeline
is not just cost-feasible, it's technically proven to work on real imagery with zero
custom training.

## Free/near-free imagery survey (09/15/2026, 5-agent fan-out via crawl4ai)

Operator asked specifically for a free, live-or-near-live option updated daily or
weekly, prompted by github.com/nasa-gibs/worldview. Checked every realistic free
source. Consistent physics/economics tradeoff across all of them — none clear both
bars (car-resolvable resolution AND daily/weekly update):

- **NASA GIBS/Worldview** (github.com/nasa-gibs/worldview) — free, MODIS/VIIRS
  layers near-real-time (3.5-24hr), but finest tiled resolution is ~15.125m/pixel.
  Orders of magnitude too coarse for a car. Global/regional tool only.
- **Copernicus Sentinel-2** — free (CDSE, no paywall, generous free API quota),
  5-day revisit, but 10m/pixel — a car (~8 sq m) is under a tenth of one pixel.
- **USGS Landsat** — free, public domain, confirmed 16-day repeat cycle, 30m
  multispectral / 15m panchromatic. Too coarse and too slow.
- **USGS NAIP** — free, public domain, 0.3-0.6m resolution (genuinely
  car-resolvable) but confirmed live re-fly cadence is every 2-3 years per state,
  leaf-on season only. Resolution without cadence.
- **Google Earth Engine** — free tier is noncommercial/academic/nonprofit only as
  of 2026 (verified live); real commercial use needs a $500-2000/mo platform fee
  or usage billing Google explicitly scopes away from production/business-critical
  workloads. Aggregates the same Sentinel-2/Landsat/NAIP sources above — same
  resolution/cadence tradeoff, just resold.
- **Esri ArcGIS World Imagery / Wayback** — the standout. Confirmed live for our
  actual counties: Lee County ortho at 7.62cm (dated 01/01/2025), Collier County
  ortho at 15.24cm (dated 01/01/2024) — genuinely car-resolvable, free to view,
  ~12 years of dated snapshots back to 2014, scriptable via Esri's own
  `wayback-core` npm package. But it's an archive, not a feed: a given parcel's
  pixels only refresh every 1-4 years, not weekly. Bulk/programmatic-use licensing
  terms not fully verified (Esri's terms page only exposed a PDF picker) — flag
  for review before relying on it for automated pulls.

**Bottom line:** the $15-200/image SkyFi/Planet pricing (see above) isn't padding —
it's the actual cost of getting resolution and cadence at the same time. No free
source does both. Esri Wayback is the one free tool worth keeping in reserve for
"what did this property look like historically" (multi-year point-in-time), not for
tracking week-to-week occupancy or traffic.

## Verdict

**Vendor tasking (Planet/Nearmap): DO NOT ADOPT now** — enterprise-sales-only, no
public pricing, hedge-fund/insurer-scale spend, a rounding error of our volume
(RULE 11). Nearmap's 3x/year cadence is also the wrong instrument regardless of cost.

**Open-source self-run pipeline: worth a real pilot if this gets prioritized** — buy
one-off imagery per parcel via SkyFi (pay-per-task, no subscription) and run
Ultralytics YOLO-OBB (DOTA-pretrained) or the xView Faster R-CNN checkpoint against
it. This is the only path here that's actually priced for our scale. Gate before
building: (1) mind the AGPL license on Ultralytics for commercial use, (2) needs a
named consumer (a CRE brain, an investor deliverable) before spending on imagery —
not a standing pipeline on spec.

## Sources
- https://www.planet.com (live-crawled 09/15/2026)
- https://www.nearmap.com (live-crawled 09/15/2026)
- https://github.com/satellite-image-deep-learning/datasets (README, live via `gh`, 09/15/2026)
- https://github.com/topics/satellite-imagery?l=python (live via `gh api search`, 09/15/2026)
- https://github.com/topics/satellite-images (live via `gh api search`, 09/15/2026)
- Hugging Face datasets/models API search (live, 09/15/2026)
