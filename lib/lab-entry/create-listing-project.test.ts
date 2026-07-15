// lib/lab-entry/create-listing-project.test.ts
import { describe, expect, test } from "bun:test";
import { listingProjectRequestBody } from "./create-listing-project";

describe("listingProjectRequestBody", () => {
  test("titles the project by the address and marks it a listing", () => {
    expect(listingProjectRequestBody("123 Palm Ave, Fort Myers FL 33901")).toEqual({
      title: "123 Palm Ave, Fort Myers FL 33901",
      kind: "listing",
      subject_address: "123 Palm Ave, Fort Myers FL 33901",
    });
  });

  test("does not trim or otherwise alter the address — the caller's job, not this one's", () => {
    expect(listingProjectRequestBody("  123 Palm Ave  ").title).toBe("  123 Palm Ave  ");
  });
});
