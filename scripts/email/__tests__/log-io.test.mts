// scripts/email/__tests__/log-io.test.mts
import { describe, test, beforeEach, afterEach } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMostRecentLog, writeLog, isTodayAlreadySent, getNextIssueNumber } from "../log-io.mts";
import type { EmailLog } from "../types.ts";

function stub(overrides: Partial<EmailLog> = {}): EmailLog {
  return {
    date: "2026-06-10",
    last_send_date: "2026-06-10",
    issue: 1,
    subject: "Test",
    freshness_manifest: {
      master: { token: "t", as_of: "2026-06-10" },
      housing_swfl: { token: "t", as_of: "2026-06-10", period_begin: "2026-03-01" },
      city_pulse: { token: "t", as_of: "2026-06-10" },
      lee_cre: null,
      source_env: "preview",
    },
    top_story: null,
    zip_metrics: {},
    county_metrics: {
      median_sale_price: 400000,
      dom: 50,
      months_of_supply: 4.0,
      avg_sale_to_list: 0.97,
      sold_above_list_pct: 0.18,
      inventory: null,
      sale_count_period: null,
    },
    signals_surfaced: [],
    cta_url: "https://swfldatagulf.com",
    send_status: "sent",
    send_error: null,
    recipients: 1,
    ...overrides,
  };
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "log-test-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true });
});

describe("readMostRecentLog", () => {
  test("returns null when no logs", () => {
    assert.equal(readMostRecentLog(tmp), null);
  });

  test("returns newest by filename", () => {
    fs.writeFileSync(
      path.join(tmp, "2026-06-09.json"),
      JSON.stringify(stub({ date: "2026-06-09" })),
    );
    fs.writeFileSync(
      path.join(tmp, "2026-06-10.json"),
      JSON.stringify(stub({ date: "2026-06-10" })),
    );
    assert.equal(readMostRecentLog(tmp)?.date, "2026-06-10");
  });

  test("ignores .gitkeep", () => {
    fs.writeFileSync(path.join(tmp, ".gitkeep"), "");
    assert.equal(readMostRecentLog(tmp), null);
  });
});

describe("isTodayAlreadySent", () => {
  test("true when today log has send_status sent", () => {
    fs.writeFileSync(
      path.join(tmp, "2026-06-11.json"),
      JSON.stringify(stub({ date: "2026-06-11", send_status: "sent" })),
    );
    assert.equal(isTodayAlreadySent("2026-06-11", tmp), true);
  });

  test("false when today log has send_status error", () => {
    fs.writeFileSync(
      path.join(tmp, "2026-06-11.json"),
      JSON.stringify(stub({ date: "2026-06-11", send_status: "error" })),
    );
    assert.equal(isTodayAlreadySent("2026-06-11", tmp), false);
  });

  test("false when no log for today", () => {
    assert.equal(isTodayAlreadySent("2026-06-11", tmp), false);
  });
});

describe("writeLog + getNextIssueNumber", () => {
  test("writeLog writes to YYYY-MM-DD.json", () => {
    writeLog(stub({ date: "2026-06-11" }), tmp);
    const written = JSON.parse(fs.readFileSync(path.join(tmp, "2026-06-11.json"), "utf-8"));
    assert.equal(written.date, "2026-06-11");
  });

  test("getNextIssueNumber returns 1 with no logs", () => {
    assert.equal(getNextIssueNumber(tmp), 1);
  });

  test("getNextIssueNumber increments from last log", () => {
    fs.writeFileSync(path.join(tmp, "2026-06-10.json"), JSON.stringify(stub({ issue: 7 })));
    assert.equal(getNextIssueNumber(tmp), 8);
  });
});
