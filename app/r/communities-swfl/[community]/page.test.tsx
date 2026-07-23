import { test, expect, mock } from "bun:test";
import type { CommunityProfile } from "../communities";

// Mutable fixture the mocked data module returns — lets the test vary the row.
const scenario: { community: CommunityProfile | null } = { community: null };

// `../communities` and the sibling `n/[neighborhood]/page.test.tsx`'s `../../communities`
// resolve to the SAME file — bun's mock.module replaces it process-wide, so this
// factory must also stub `fetchNeighborhoodBySlug` or the other suite's import breaks
// when both test files run in one `bun test` invocation.
mock.module("../communities", () => ({
  fetchCommunityBySlug: async () => scenario.community,
  fetchNeighborhoodBySlug: async () => null,
}));

const { default: CommunityPage } = await import("./page");
const { SourceLink } = await import("../../_components/metrics-table");

/** Walk a React-element tree (unrendered — nested function components stay as
 *  { type, props } objects) collecting every node whose `type` matches. Recurses
 *  through every prop value (not just `children`) since a nested element can ride
 *  in any prop (e.g. `<Meta value={<SourceLink .../>} />`). */
function findByType(
  node: unknown,
  type: unknown,
  out: { props: Record<string, unknown> }[] = [],
  seen = new Set<unknown>(),
) {
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const n of node) findByType(n, type, out, seen);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === type && el.props) out.push({ props: el.props });
  if (el.props && typeof el.props === "object") {
    for (const v of Object.values(el.props)) {
      if (v && typeof v === "object") findByType(v, type, out, seen);
    }
  }
  return out;
}

test("community page renders a visible SourceLink for the row's source_url (not just buried in the invisible JSON-LD script block)", async () => {
  scenario.community = {
    slug: "the-quarry",
    label: "The Quarry",
    county: "Lee",
    home_count: 800,
    gated: true,
    golf_structure: "equity",
    golf_holes: 18,
    hoa_fee_min: 200,
    hoa_fee_max: 400,
    cdd_flag: true,
    pool: true,
    tennis: true,
    pickleball: false,
    fitness: true,
    clubhouse: true,
    on_site_dining: true,
    boating: true,
    drive_min_rsw: 20,
    drive_min_beach: 25,
    drive_min_downtown: 15,
    drive_min_hospital: 10,
    nearby_dining_count: 5,
    source_url: "https://www.leepa.org/parcel/9999",
    as_of: "2026-07-01",
  };

  const el = await CommunityPage({ params: Promise.resolve({ community: "the-quarry" }) });

  const sourceLinks = findByType(el, SourceLink);
  expect(sourceLinks.length).toBeGreaterThan(0);
  expect(sourceLinks.some((n) => n.props.url === "https://www.leepa.org/parcel/9999")).toBe(true);
});
