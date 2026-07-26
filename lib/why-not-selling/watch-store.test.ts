import { test, expect } from "bun:test";
import {
  AGENT_OPTIN_CONSENT_TEXT,
  validateWatchInput,
  createWatch,
  confirmWatch,
  unsubscribeWatch,
  type WatchDb,
} from "./watch-store";

const goodForm = {
  email: "seller@example.com",
  address_key: "15756MODENAST:34114",
  zip: "34114",
  q: "15756 Modena St, Naples, FL 34114",
  agent_optin: "on",
};

test("validateWatchInput: good form → input; opt-in true only when checkbox is 'on'", () => {
  const input = validateWatchInput(goodForm);
  expect(input).not.toBeNull();
  expect(input!.email).toBe("seller@example.com");
  expect(input!.agentOptin).toBe(true);
  expect(validateWatchInput({ ...goodForm, agent_optin: undefined })!.agentOptin).toBe(false);
});

test("validateWatchInput: bad email / bad zip / empty key → null", () => {
  expect(validateWatchInput({ ...goodForm, email: "not an email" })).toBeNull();
  expect(validateWatchInput({ ...goodForm, zip: "3411" })).toBeNull();
  expect(validateWatchInput({ ...goodForm, address_key: "" })).toBeNull();
});

function stubDb(behavior: "saved" | "duplicate" | "throw"): { db: WatchDb; rows: unknown[] } {
  const rows: unknown[] = [];
  const db: WatchDb = {
    insertWatch: async (row) => {
      if (behavior === "throw") throw new Error("db down");
      if (behavior === "duplicate") return "exists";
      rows.push(row);
      return "saved";
    },
    stampByToken: async () => behavior === "saved",
  };
  return { db, rows };
}

test("createWatch saved path stores the EXACT consent text on opt-in", async () => {
  const { db, rows } = stubDb("saved");
  const out = await createWatch(validateWatchInput(goodForm)!, { db });
  expect(out).toBe("saved");
  const row = rows[0] as Record<string, unknown>;
  expect(row.consent_text).toBe(AGENT_OPTIN_CONSENT_TEXT);
  expect(row.agent_optin_at).toBeTruthy();
});

test("createWatch without opt-in stores neither consent text nor stamp", async () => {
  const { db, rows } = stubDb("saved");
  await createWatch(validateWatchInput({ ...goodForm, agent_optin: undefined })!, { db });
  const row = rows[0] as Record<string, unknown>;
  expect(row.consent_text).toBeNull();
  expect(row.agent_optin_at).toBeNull();
});

test("createWatch duplicate → 'exists'; throw → 'error'", async () => {
  expect(await createWatch(validateWatchInput(goodForm)!, { db: stubDb("duplicate").db })).toBe(
    "exists",
  );
  expect(await createWatch(validateWatchInput(goodForm)!, { db: stubDb("throw").db })).toBe(
    "error",
  );
});

test("confirm/unsubscribe pass through the stub and never throw", async () => {
  expect(await confirmWatch("tok", { db: stubDb("saved").db })).toBe(true);
  expect(await unsubscribeWatch("tok", { db: stubDb("throw").db })).toBe(false);
});
