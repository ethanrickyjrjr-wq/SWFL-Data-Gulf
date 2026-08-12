// lib/email/brand/fetch-account-brand.test.ts
import { describe, expect, test } from "bun:test";
import { fetchAccountBrand, isConfirmedNoBrand } from "./fetch-account-brand";

function fakeResponse(status: number, body: Record<string, unknown> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("isConfirmedNoBrand", () => {
  test("true only for 401", () => {
    expect(isConfirmedNoBrand(401)).toBe(true);
    expect(isConfirmedNoBrand(200)).toBe(false);
    expect(isConfirmedNoBrand(500)).toBe(false);
    expect(isConfirmedNoBrand(0)).toBe(false);
  });
});

describe("fetchAccountBrand", () => {
  test("a real 401 returns immediately as confirmedNoBrand, no retry", async () => {
    let calls = 0;
    const fake = async () => {
      calls++;
      return fakeResponse(401);
    };
    const result = await fetchAccountBrand(fake as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, confirmedNoBrand: true, data: {} });
    expect(calls).toBe(1);
  });

  test("a 200 on the first try returns the parsed body, ok=true", async () => {
    const fake = async () => fakeResponse(200, { agent_name: "Marisa Delgado" });
    const result = await fetchAccountBrand(fake as unknown as typeof fetch);
    expect(result).toEqual({
      ok: true,
      confirmedNoBrand: false,
      data: { agent_name: "Marisa Delgado" },
    });
  });

  test("a transient 500 is retried once, and a 200 on retry succeeds — THE BUG THIS FIXES: a signed-in profile with a real brand no longer goes unbranded on one hiccup", async () => {
    let calls = 0;
    const fake = async () => {
      calls++;
      return calls === 1 ? fakeResponse(500) : fakeResponse(200, { agent_name: "Marisa Delgado" });
    };
    const result = await fetchAccountBrand(fake as unknown as typeof fetch);
    expect(result).toEqual({
      ok: true,
      confirmedNoBrand: false,
      data: { agent_name: "Marisa Delgado" },
    });
    expect(calls).toBe(2);
  });

  test("a thrown network error is retried once, same as a 500", async () => {
    let calls = 0;
    const fake = async () => {
      calls++;
      if (calls === 1) throw new Error("network error");
      return fakeResponse(200, { agent_name: "Marisa Delgado" });
    };
    const result = await fetchAccountBrand(fake as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  test("two failures in a row give up honestly — not confirmedNoBrand, not ok", async () => {
    const fake = async () => fakeResponse(500);
    const result = await fetchAccountBrand(fake as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, confirmedNoBrand: false, data: {} });
  });
});
