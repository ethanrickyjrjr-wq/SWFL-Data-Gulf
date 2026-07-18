// lib/buyer-leverage/dom-read.test.ts
import { expect, test } from "bun:test";
import { fetchDomRead } from "./dom-read";

test("maps a listing_dom row → DomRead", async () => {
  const read = await fetchDomRead("123MAINST:33904", {
    fetchRow: async () => ({ dom_days: 138, dom_is_floor: false, cdom_days: 138, state: "active" }),
  });
  expect(read).toEqual({ domDays: 138, isFloor: false, cdomDays: 138, state: "active" });
});

test("floored row → isFloor true", async () => {
  const read = await fetchDomRead("123MAINST:33904", {
    fetchRow: async () => ({ dom_days: 400, dom_is_floor: true, cdom_days: 400, state: "active" }),
  });
  expect(read?.isFloor).toBe(true);
});

test("no match → null (area-only degrade upstream)", async () => {
  expect(await fetchDomRead("X:33904", { fetchRow: async () => null })).toBeNull();
});

test("throwing read → null (empty-tolerant)", async () => {
  const read = await fetchDomRead("X:33904", {
    fetchRow: async () => {
      throw new Error("no creds");
    },
  });
  expect(read).toBeNull();
});
