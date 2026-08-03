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
