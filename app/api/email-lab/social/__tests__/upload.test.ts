// app/api/email-lab/social/__tests__/upload.test.ts
//
// Guards the key contract for the social upload route.
// Imports the production `buildLabMediaKey` helper directly — tests real code, not
// a hand-rolled copy. The route's live auth + storage behaviour is verified manually
// on the real endpoint.

import { test, expect } from "bun:test";
import { buildLabMediaKey } from "../upload/route";

test("buildLabMediaKey: key is user-scoped under lab/<userId>/", () => {
  const key = buildLabMediaKey("abc-123", "some-uuid");
  expect(key.startsWith("lab/abc-123/")).toBe(true);
});

test("buildLabMediaKey: key ends with .png", () => {
  const key = buildLabMediaKey("abc-123", "some-uuid");
  expect(key.endsWith(".png")).toBe(true);
});

test("buildLabMediaKey: key embeds the uuid segment", () => {
  const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const key = buildLabMediaKey("user-xyz", uuid);
  expect(key).toBe(`lab/user-xyz/${uuid}.png`);
});
