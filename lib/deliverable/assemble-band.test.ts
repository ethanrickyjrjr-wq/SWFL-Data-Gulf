import { test, expect, describe, afterEach } from "bun:test";
import { assembleDeliverable } from "./assemble";

// A minimal fake service-role client capturing the deliverables prior-lookup and
// the INSERT. The prior lookup chain mirrors assemble.ts exactly:
//   from("deliverables").select().eq().eq().order().limit()
// (no `.lt("created_at", nowIso)` — a client-clock upper bound compared against
// the DB server's `created_at` is a clock-skew trap; see assemble.ts comment.)
function fakeDb(priorSnapshot: unknown[]) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "saved_charts") {
        return { select: () => ({ in: () => ({ data: [] }) }) };
      }
      if (table === "deliverables") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ items_snapshot: priorSnapshot, created_at: "2026-06-05T00:00:00Z" }],
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
  return { db, inserted };
}

describe("assembleDeliverable threads the prior snapshot into the band guard", () => {
  const nowItems = [
    {
      kind: "metric",
      label: "Median Home Value",
      value: "$1.5M",
      report_id: "x",
      id: "a",
      added_at: "2026-07-05T00:00:00Z",
      origin: "web",
      freshness_token: "",
    },
  ];
  const priorItems = [
    {
      kind: "metric",
      label: "Median Home Value",
      value: "$485K",
      report_id: "y",
      id: "b",
      added_at: "2026-06-05T00:00:00Z",
      origin: "web",
      freshness_token: "",
    },
  ];

  afterEach(() => {
    delete process.env.BAND_GUARD_ENABLED;
  });

  test("flag ON → the built deliverable carries a confirm note", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const { db, inserted } = fakeDb(priorItems);
    await assembleDeliverable({
      db: db as never,
      projectId: "p1",
      ownerId: "u1",
      items: nowItems,
      branding: null,
      template: "email",
      instruction: "",
      confirmOutlier: async () => null, // deterministic: could-not-confirm → please-confirm note
    });
    const notes = (inserted[0]?.narrative as { inference_notes: string[] }).inference_notes;
    expect(notes.some((n) => n.toLowerCase().includes("please confirm"))).toBe(true);
  });

  test("flag OFF → no confirm note (byte-identical to before)", async () => {
    delete process.env.BAND_GUARD_ENABLED;
    const { db, inserted } = fakeDb(priorItems);
    await assembleDeliverable({
      db: db as never,
      projectId: "p1",
      ownerId: "u1",
      items: nowItems,
      branding: null,
      template: "email",
      instruction: "",
    });
    const notes = (inserted[0]?.narrative as { inference_notes: string[] }).inference_notes;
    expect(notes.some((n) => n.toLowerCase().includes("please confirm"))).toBe(false);
  });
});
