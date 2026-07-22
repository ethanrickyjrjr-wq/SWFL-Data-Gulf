/**
 * ZIP shared-boundary adjacency — pure derivation, no I/O.
 *
 * WHY THIS EXISTS. `lib/geo/nearest-zips.ts` links ZIPs by centroid distance,
 * which happily links two ZIPs across a bay. `scripts/geo/build-market-areas.mts`
 * works around that with a hand-coded barrier lock. Real shared-boundary
 * adjacency removes the need to encode by hand what the geometry already knows.
 *
 * ADJACENCY MEANS A SHARED EDGE, NOT A SHARED CORNER. Two ZIPs meeting at a
 * single vertex are diagonal neighbours, not boundary-sharing ones (rook, not
 * queen, contiguity). A merge across a corner touch would join areas sharing no
 * frontage, so the segment is the unit of adjacency here.
 *
 * EXACT COORDINATE MATCHING IS DELIBERATE, AND IT IS VERIFIED, NOT ASSUMED.
 * Census TIGER geometry is topologically integrated: adjacent ZCTAs are built
 * from the same boundary arcs, so their shared vertices are bit-identical.
 * Probed live 07/22/2026 against the TIGERweb GeoJSON endpoint (the generalized
 * web service, not the TIGER/Line shapefiles) to confirm that property survives
 * that delivery path: ZCTAs 33901 and 33916 returned 108 exactly-equal vertices
 * forming 107 consecutive shared segments, minimum vertex distance exactly 0.
 * A distant control pair (33901 / 34102 Naples) returned 0. So there is no
 * epsilon and no tolerance anywhere below — adding one would be a silent
 * behaviour change, and the fixture it produces would stop being reproducible.
 */

export type Position = number[];
export type Ring = Position[];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Ring[];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Ring[][];
}

export interface ZipFeature {
  zip: string;
  geometry: PolygonGeometry | MultiPolygonGeometry;
}

/** Lee + Collier. The two core, data-rich counties — the whole footprint. */
const FOOTPRINT_COUNTIES = new Set(["12071", "12021"]);

export interface CountyEntry {
  zip: string;
  counties: string[];
  primary_county: string;
}

/**
 * The operator-ruled 58, sorted. Membership is ANY-county — a ZIP is in
 * footprint if *any* of its counties is Lee or Collier, not merely its primary.
 * That is load-bearing: 33955 (Burnt Store) has primary county Charlotte and is
 * in footprint via its Lee membership, so the primary-county rule in
 * `refinery/lib/parcel-zip-scope.mts` would wrongly drop it.
 *
 * Extracted from the inline copy in `build-market-areas.mts` so the generator
 * and everything that checks it read one authority, rather than two hand-coded
 * lists that can agree on a wrong 58.
 */
export function footprintZips(entries: CountyEntry[]): string[] {
  const zips = new Set<string>();
  for (const e of entries) {
    if (e.counties.some((c) => FOOTPRINT_COUNTIES.has(c))) zips.add(e.zip);
  }
  return [...zips].sort();
}

/** Every ring of a geometry, with MultiPolygon parts flattened in. */
function ringsOf(geometry: ZipFeature["geometry"]): Ring[] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

const pointKey = (p: Position): string => `${p[0]},${p[1]}`;

/**
 * Undirected segment keys for a set of rings. Neighbouring polygons wind in
 * opposite directions along their shared boundary, so the endpoints are
 * normalised into a stable order — otherwise every real neighbour looks unmatched.
 */
function segmentKeys(rings: Ring[]): Set<string> {
  const out = new Set<string>();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = pointKey(ring[i]);
      const b = pointKey(ring[i + 1]);
      out.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  return out;
}

/**
 * `{zip: sorted neighbour zips}` for every input feature. Every ZIP gets a key
 * even with no neighbours — a missing key is indistinguishable from "not
 * computed" downstream. Output key order is sorted, so the emitted fixture is
 * byte-stable and its diffs are intentional.
 */
export function buildAdjacency(features: ZipFeature[]): Record<string, string[]> {
  const segments = new Map<string, Set<string>>();
  for (const f of features) {
    if (segments.has(f.zip)) {
      // Silently keeping one of two would under-report that ZIP's boundary.
      throw new Error(`duplicate ZIP in adjacency input: ${f.zip}`);
    }
    segments.set(f.zip, segmentKeys(ringsOf(f.geometry)));
  }

  const zips = [...segments.keys()].sort();
  const adjacency: Record<string, string[]> = {};
  for (const zip of zips) adjacency[zip] = [];

  for (let i = 0; i < zips.length; i++) {
    for (let j = i + 1; j < zips.length; j++) {
      const a = zips[i];
      const b = zips[j];
      const segA = segments.get(a)!;
      const segB = segments.get(b)!;
      // Scan the smaller set against the larger — same answer, less work.
      const [small, large] = segA.size <= segB.size ? [segA, segB] : [segB, segA];
      let sharesEdge = false;
      for (const seg of small) {
        if (large.has(seg)) {
          sharesEdge = true;
          break;
        }
      }
      if (sharesEdge) {
        adjacency[a].push(b);
        adjacency[b].push(a);
      }
    }
  }

  for (const zip of zips) adjacency[zip].sort();
  return adjacency;
}
