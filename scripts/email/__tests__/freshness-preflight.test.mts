// scripts/email/__tests__/freshness-preflight.test.mts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshnessToken } from "../../../refinery/lib/freshness.mts";
import {
  masterFreshnessDate,
  assertMasterFreshToday,
  StaleMasterError,
} from "../freshness-preflight.mts";

/** Writes a master.md fixture into a temp dir. `token: null` = no token line. */
function writeMaster(token: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-preflight-"));
  const p = path.join(dir, "master.md");
  const body = token
    ? `<!-- FRESHNESS: v100 | Token: ${token} -->\n---\nbrain_id: master\nversion: 100\nrefined_at: 2026-07-11T06:32:37Z\nfreshness_token: ${token}\n---\n\nbody\n`
    : `---\nbrain_id: master\nversion: 100\n---\n\nbody\n`;
  fs.writeFileSync(p, body, "utf8");
  return p;
}

describe("digest freshness preflight", () => {
  test("reads the calendar day out of master's freshness_token", () => {
    const p = writeMaster(freshnessToken(100, "2026-07-11T06:32:37Z"));
    assert.equal(masterFreshnessDate(p), "2026-07-11");
  });

  test("token stamped TODAY -> send proceeds", () => {
    const p = writeMaster(freshnessToken(100, "2026-07-11T06:32:37Z"));
    assert.doesNotThrow(() => assertMasterFreshToday("2026-07-11", p));
  });

  test("token stamped YESTERDAY -> REFUSE (the dropped/late-head case)", () => {
    const p = writeMaster(freshnessToken(99, "2026-07-10T06:32:37Z"));
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });

  test("master.md missing -> REFUSE (fails CLOSED: never send on unknown freshness)", () => {
    const missing = path.join(os.tmpdir(), "no-such-master-12345.md");
    assert.throws(() => assertMasterFreshToday("2026-07-11", missing), StaleMasterError);
  });

  test("master.md present but no freshness_token line -> REFUSE (fails CLOSED)", () => {
    const p = writeMaster(null);
    assert.equal(masterFreshnessDate(p), null);
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });

  test("token with an unparseable date tail -> REFUSE (fails CLOSED)", () => {
    const p = writeMaster("SWFL-7421-v100-NOTADATE");
    assert.equal(masterFreshnessDate(p), null);
    assert.throws(() => assertMasterFreshToday("2026-07-11", p), StaleMasterError);
  });
});
