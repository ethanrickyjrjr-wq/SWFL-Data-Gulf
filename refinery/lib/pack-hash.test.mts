// refinery/lib/pack-hash.test.mts
//
// THE TWO-WEEK BUG, PINNED.
//
// 07/10: isCoreScope applied to all 12 ZIP packs — a real fix, merged to main.
// Every daily rebuild afterwards skipped housing-swfl as "fresh" (its TTL had not
// expired), so the brain artifact stayed frozen at its 06/29 build — still holding
// 124 ZIPs including Bradenton, Sarasota and Port Charlotte. The fix was live in
// git and dead in production, and nothing anywhere said so.
//
// A data-age TTL cannot see a code change. These tests hold the line: fix the pack,
// the brain goes stale.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packSourceHash, packCodeChanged } from "./pack-hash.mts";

describe("packSourceHash", () => {
  it("hashes a real pack's source", () => {
    const h = packSourceHash("housing-swfl");
    assert.ok(h, "housing-swfl must hash");
    assert.equal(h!.length, 12);
  });

  it("is stable across calls (same source → same hash)", () => {
    assert.equal(packSourceHash("housing-swfl"), packSourceHash("housing-swfl"));
  });

  it("different packs hash differently", () => {
    assert.notEqual(packSourceHash("housing-swfl"), packSourceHash("env-swfl"));
  });

  it("an unreadable pack is null — never an I/O blip forcing a paid rebuild", () => {
    assert.equal(packSourceHash("no-such-pack-anywhere"), null);
  });
});

describe("packCodeChanged — the staleness rule", () => {
  it("STALE: the stamped hash no longer matches the pack on disk (the 07/10 scope fix)", () => {
    // A brain built on 06/29 carries the pre-fix hash; the pack has since changed.
    assert.equal(packCodeChanged("housing-swfl", "deadbeef1234"), true);
  });

  it("FRESH: the stamp matches the pack exactly — no needless rebuild", () => {
    const current = packSourceHash("housing-swfl")!;
    assert.equal(packCodeChanged("housing-swfl", current), false);
  });

  it("a pre-stamp brain (no pack_hash) is NOT forced stale — no surprise mass rebuild", () => {
    assert.equal(packCodeChanged("housing-swfl", undefined), false);
    assert.equal(packCodeChanged("housing-swfl", null), false);
  });

  it("an unreadable pack never reads as changed", () => {
    assert.equal(packCodeChanged("no-such-pack-anywhere", "abc123abc123"), false);
  });
});
