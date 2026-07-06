import { describe, expect, test } from "bun:test";
import { findFreezingSchedule } from "@/lib/email/sequence/freeze";

function fakeDb(rows: { id: number; next_run_at: string }[]) {
  const q = {
    select: () => q,
    eq: () => q,
    not: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => q } as never;
}

describe("findFreezingSchedule", () => {
  test("armed once row → frozen", async () => {
    const hit = await findFreezingSchedule(
      fakeDb([{ id: 7, next_run_at: "2026-07-08T13:00:00Z" }]),
      "d-1",
    );
    expect(hit?.id).toBe(7);
  });
  test("no armed row → not frozen", async () => {
    expect(await findFreezingSchedule(fakeDb([]), "d-1")).toBeNull();
  });
});
