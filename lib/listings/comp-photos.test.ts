import { test, expect, describe } from "bun:test";
import { resolveCompPhotos, compPhotoKey, type LakePhotoRow } from "./comp-photos";

const rows =
  (...r: LakePhotoRow[]) =>
  async () =>
    r;

describe("compPhotoKey", () => {
  test("canonicalizes suffix + punctuation, keeps the city apart", () => {
    expect(compPhotoKey("5427 Osprey Court", "Sanibel")).toBe(
      compPhotoKey("5427 Osprey Ct.", "sanibel"),
    );
    expect(compPhotoKey("330 5th St", "Naples")).not.toBe(compPhotoKey("330 5th St", "Fort Myers"));
  });
});

describe("resolveCompPhotos", () => {
  test("returns the REAL lake photo for a matched comp", async () => {
    const out = await resolveCompPhotos([{ addressLine: "5427 Osprey Ct", city: "Sanibel" }], {
      fetchRows: rows({
        street_address: "5427 Osprey Ct",
        city: "Sanibel",
        photo_url: "https://ap.rdcpix.com/real.webp",
      }),
    });
    expect(out.get("5427 Osprey Ct")).toBe("https://ap.rdcpix.com/real.webp");
  });

  test("a comp with no lake row gets NO photo — never a substitute image", async () => {
    const out = await resolveCompPhotos([{ addressLine: "1 Nowhere Ln", city: "Naples" }], {
      fetchRows: rows(),
    });
    expect(out.size).toBe(0);
  });

  test("never borrows another city's photo for the same street line", async () => {
    const out = await resolveCompPhotos([{ addressLine: "330 5th St", city: "Naples" }], {
      fetchRows: rows({
        street_address: "330 5th St",
        city: "Fort Myers",
        photo_url: "https://ap.rdcpix.com/wrong-house.webp",
      }),
    });
    expect(out.size).toBe(0);
  });

  test("a row with a null photo is not a match", async () => {
    const out = await resolveCompPhotos([{ addressLine: "9 Gulf Dr", city: "Naples" }], {
      fetchRows: rows({ street_address: "9 Gulf Dr", city: "Naples", photo_url: null }),
    });
    expect(out.size).toBe(0);
  });

  test("empty input does no lake read at all", async () => {
    let called = false;
    const out = await resolveCompPhotos([], {
      fetchRows: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
    expect(out.size).toBe(0);
  });
});

// ── LANE 2 · the paid Apify fallback for comps that predate our nightly sweep ──
// Design §1/§6: ONE resolver, TWO lanes. Guards: never call the paid lane when the
// free lane already covered the set, and never let it fail a build.
describe("resolveCompPhotos · lane 2 (Apify fallback)", () => {
  const comps = [
    { addressLine: "409 SW 44th St", city: "Cape Coral" },
    { addressLine: "2619 SW 5th Ave", city: "Cape Coral" },
  ];

  test("fills ONLY the comps the lake missed — the lake's photo always wins", async () => {
    let asked: string[] = [];
    const out = await resolveCompPhotos(comps, {
      fetchRows: rows({
        street_address: "409 SW 44th St",
        city: "Cape Coral",
        photo_url: "https://ap.rdcpix.com/from-lake.webp",
      }),
      enrich: async (missing) => {
        asked = missing.map((m) => m.addressLine);
        return [
          {
            street: "2619 SW 5th Ave",
            city: "Cape Coral",
            primary_photo: "https://ap.rdcpix.com/from-apify.jpg",
          },
        ];
      },
    });
    expect(asked).toEqual(["2619 SW 5th Ave"]);
    expect(out.get("409 SW 44th St")).toBe("https://ap.rdcpix.com/from-lake.webp");
    expect(out.get("2619 SW 5th Ave")).toBe("https://ap.rdcpix.com/from-apify.jpg");
  });

  test("FULL lake coverage never spends a cent — the paid lane is not called", async () => {
    let called = false;
    await resolveCompPhotos(comps, {
      fetchRows: rows(
        {
          street_address: "409 SW 44th St",
          city: "Cape Coral",
          photo_url: "https://ap.rdcpix.com/a.webp",
        },
        {
          street_address: "2619 SW 5th Ave",
          city: "Cape Coral",
          photo_url: "https://ap.rdcpix.com/b.webp",
        },
      ),
      enrich: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
  });

  test("no enrich dep configured = today's behavior exactly, no paid call", async () => {
    const out = await resolveCompPhotos(comps, { fetchRows: rows() });
    expect(out.size).toBe(0);
  });

  test("a THROWING paid lane degrades to the lake's result, never a failed build", async () => {
    const out = await resolveCompPhotos(comps, {
      fetchRows: rows({
        street_address: "409 SW 44th St",
        city: "Cape Coral",
        photo_url: "https://ap.rdcpix.com/from-lake.webp",
      }),
      enrich: async () => {
        throw new Error("actor exit 1");
      },
    });
    expect(out.size).toBe(1);
    expect(out.get("409 SW 44th St")).toBe("https://ap.rdcpix.com/from-lake.webp");
  });

  test("lane 2 obeys the SAME city rule — it cannot borrow another city's photo", async () => {
    const out = await resolveCompPhotos([{ addressLine: "330 5th St", city: "Naples" }], {
      fetchRows: rows(),
      enrich: async () => [
        {
          street: "330 5th St",
          city: "Fort Myers",
          primary_photo: "https://ap.rdcpix.com/wrong-house.jpg",
        },
      ],
    });
    expect(out.size).toBe(0);
  });
});
