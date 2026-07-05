import { describe, expect, test } from "bun:test";
import { isBareAddressQuery, resolveAddressDestination } from "./address-route";

describe("isBareAddressQuery (routing gate — strict on purpose)", () => {
  test("matches a house-number + street-suffix address", () => {
    expect(isBareAddressQuery("3412 SE 10th Pl")).toBe(true);
    expect(isBareAddressQuery("123 Main St")).toBe(true);
    expect(isBareAddressQuery("8970 Daniels Pkwy")).toBe(true);
    expect(isBareAddressQuery("601 Fifth Ave S, Naples")).toBe(true);
  });

  test("matches a full one-line address with city + ZIP", () => {
    expect(isBareAddressQuery("3412 SE 10th Pl, Cape Coral, FL 33914")).toBe(true);
  });

  test("matches a suffixless address when a comma carries the city", () => {
    expect(isBareAddressQuery("123 Main, Cape Coral")).toBe(true);
  });

  test("does NOT match questions that merely contain numbers", () => {
    expect(isBareAddressQuery("10 best neighborhoods in Naples")).toBe(false);
    expect(isBareAddressQuery("3 bedroom homes in 33904")).toBe(false);
    expect(isBareAddressQuery("55 plus communities near Fort Myers")).toBe(false);
  });

  test("does NOT match questions ABOUT an address — those go to the chat engine", () => {
    expect(isBareAddressQuery("what is 123 Main St worth?")).toBe(false);
    expect(isBareAddressQuery("comps for 3412 SE 10th Pl")).toBe(false);
    expect(isBareAddressQuery("is 123 Main St in a flood zone")).toBe(false);
  });

  test("does NOT match a bare ZIP, city, or empty input", () => {
    expect(isBareAddressQuery("33904")).toBe(false);
    expect(isBareAddressQuery("Cape Coral")).toBe(false);
    expect(isBareAddressQuery("")).toBe(false);
    expect(isBareAddressQuery("   ")).toBe(false);
  });

  test("does NOT match long prose that happens to start with a number", () => {
    expect(
      isBareAddressQuery(
        "2026 was a strange year for the market on the whole east side of the river near the old bridge",
      ),
    ).toBe(false);
  });
});

describe("resolveAddressDestination (suggest → retrieve → grid-lab URL)", () => {
  const suggestJson = {
    suggestions: [
      {
        mapboxId: "id1",
        name: "3412 SE 10th Pl",
        placeFormatted: "Cape Coral, Florida 33914, United States",
      },
    ],
  };
  const retrieveJson = {
    name: "3412 SE 10th Pl, Cape Coral, Florida 33914, United States",
    zip: "33914",
  };

  function fakeFetch(routes: Record<string, { ok: boolean; json: unknown }>): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = String(input);
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      if (!hit) throw new Error(`unexpected fetch: ${url}`);
      return {
        ok: hit[1].ok,
        json: async () => hit[1].json,
      } as Response;
    }) as typeof fetch;
  }

  test("happy path: returns the new-listing grid URL with the retrieved name + zip", async () => {
    const dest = await resolveAddressDestination(
      "3412 SE 10th Pl",
      fakeFetch({
        "/api/address-suggest": { ok: true, json: suggestJson },
        "/api/address-retrieve": { ok: true, json: retrieveJson },
      }),
    );
    expect(dest).not.toBeNull();
    expect(dest!.startsWith("/email-lab/grid?")).toBe(true);
    const params = new URLSearchParams(dest!.split("?")[1]);
    expect(params.get("recipe")).toContain("3412 SE 10th Pl");
    expect(params.get("recipe")).not.toContain("[[");
    expect(params.get("zip")).toBe("33914");
  });

  test("retrieve failure falls back to the suggestion's own text, no zip", async () => {
    const dest = await resolveAddressDestination(
      "3412 SE 10th Pl",
      fakeFetch({
        "/api/address-suggest": { ok: true, json: suggestJson },
        "/api/address-retrieve": { ok: false, json: {} },
      }),
    );
    expect(dest).not.toBeNull();
    const params = new URLSearchParams(dest!.split("?")[1]);
    expect(params.get("recipe")).toContain("Cape Coral, Florida 33914");
    expect(params.get("zip")).toBeNull();
  });

  test("no suggestions → null (caller falls through to today's behavior)", async () => {
    const dest = await resolveAddressDestination(
      "3412 SE 10th Pl",
      fakeFetch({ "/api/address-suggest": { ok: true, json: { suggestions: [] } } }),
    );
    expect(dest).toBeNull();
  });

  test("network throw → null, never an exception", async () => {
    const dest = await resolveAddressDestination("3412 SE 10th Pl", (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(dest).toBeNull();
  });
});
