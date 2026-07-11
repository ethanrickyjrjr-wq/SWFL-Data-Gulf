// scripts/lib/airtable-creds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAirtableCreds } from "./airtable-creds.mjs";

test("prefers TOML over env", () => {
  const r = resolveAirtableCreds({
    tomlText:
      'AIRTABLE_TOKEN = "tomltoken"\nAIRTABLE_CHECKS_BASE_ID = "appToml"\nAIRTABLE_CHECKS_TABLE_ID = "tblToml"',
    env: {
      AIRTABLE_TOKEN: "envtoken",
      AIRTABLE_CHECKS_BASE_ID: "appEnv",
      AIRTABLE_CHECKS_TABLE_ID: "tblEnv",
    },
  });
  assert.deepEqual(r, { token: "tomltoken", baseId: "appToml", tableId: "tblToml" });
});

test("falls back to env when TOML absent (CI)", () => {
  const r = resolveAirtableCreds({
    tomlText: "",
    env: {
      AIRTABLE_TOKEN: "envtoken",
      AIRTABLE_CHECKS_BASE_ID: "appEnv",
      AIRTABLE_CHECKS_TABLE_ID: "tblEnv",
    },
  });
  assert.deepEqual(r, { token: "envtoken", baseId: "appEnv", tableId: "tblEnv" });
});

test("returns null when token present but base/table id missing", () => {
  assert.equal(resolveAirtableCreds({ tomlText: "", env: { AIRTABLE_TOKEN: "envtoken" } }), null);
});

test("returns null when nothing present", () => {
  assert.equal(resolveAirtableCreds({ tomlText: "", env: {} }), null);
});
