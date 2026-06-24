import { describe, test, expect } from "bun:test";
import { pickSeedId } from "./pick-seed";

describe("pickSeedId", () => {
  test("'just sold on 5th st' → just-sold", () =>
    expect(pickSeedId("just sold on 5th st")).toBe("just-sold"));
  test("'new listing 123 Gulf Blvd' → listing-feature", () =>
    expect(pickSeedId("new listing 123 Gulf Blvd")).toBe("listing-feature"));
  test("'welcome new subscribers' → welcome", () =>
    expect(pickSeedId("welcome new subscribers")).toBe("welcome"));
  test("'april market update' → market-letter", () =>
    expect(pickSeedId("april market update")).toBe("market-letter"));
  test("unknown → market-spotlight (default)", () =>
    expect(pickSeedId("asdf")).toBe("market-spotlight"));
});
