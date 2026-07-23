import { test, expect, mock } from "bun:test";
import type { NeighborhoodStat } from "../../communities";

// Mutable fixture the mocked data module returns — lets the test vary the row.
const scenario: { neighborhood: NeighborhoodStat | null } = { neighborhood: null };

// `../../communities` and the sibling `[community]/page.test.tsx`'s `../communities`
// resolve to the SAME file — bun's mock.module replaces it process-wide, so this
// factory must also stub `fetchCommunityBySlug` or the other suite's import breaks
// when both test files run in one `bun test` invocation.
mock.module("../../communities", () => ({
  fetchNeighborhoodBySlug: async () => scenario.neighborhood,
  fetchCommunityBySlug: async () => null,
}));

const { default: NeighborhoodPage } = await import("./page");
const { SourceLink } = await import("../../../_components/metrics-table");

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

test("neighborhood page renders a visible SourceLink for the row's source_url (not just buried in an absent JSON-LD block)", async () => {
  scenario.neighborhood = {
    slug: "gulf-harbor-estates",
    subdivision_name: "Gulf Harbor Estates",
    county: "Lee",
    home_count: 240,
    count_by_type: { "single-family": 240 },
    median_just_value: 350000,
    source_url: "https://www.leepa.org/parcel/1234",
    as_of: "2026-07-01",
  };

  const el = await NeighborhoodPage({
    params: Promise.resolve({ neighborhood: "gulf-harbor-estates" }),
  });

  const sourceLinks = findByType(el, SourceLink);
  expect(sourceLinks.length).toBeGreaterThan(0);
  expect(sourceLinks.some((n) => n.props.url === "https://www.leepa.org/parcel/1234")).toBe(true);
});
