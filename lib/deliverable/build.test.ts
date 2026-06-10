import { test, expect, describe } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freezeSnapshot, collectSnapshotNumbers } from "./build";
import type { ProjectItem } from "../project/items";
import type { SnapshotItem } from "./templates";

// A stub Supabase client that resolves saved_charts ids → chart_block rows.
function stubDb(
  rows: { id: string; chart_block: unknown; freshness_token: string | null }[],
): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            async in(_col: string, ids: string[]) {
              return { data: rows.filter((r) => ids.includes(r.id)) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const BASE = { added_at: "2026-06-10T00:00:00Z", origin: "web" as const };

describe("freezeSnapshot", () => {
  test("resolves a chart ref into an embedded chart_block", async () => {
    const items: ProjectItem[] = [
      { ...BASE, id: "c1", kind: "chart", chart_id: "chart-abc", title: "Vacancy" },
    ];
    const block = { title: "Vacancy", columns: ["Z", "V"], rows: [["A", 4.2]] };
    const snap = await freezeSnapshot(
      stubDb([{ id: "chart-abc", chart_block: block, freshness_token: "T1" }]),
      items,
    );
    expect(snap).toHaveLength(1);
    const ch = snap[0] as Extract<SnapshotItem, { kind: "chart" }>;
    expect(ch.kind).toBe("chart");
    expect(ch.chart_block.title).toBe("Vacancy");
    expect(ch.freshness_token).toBe("T1");
  });

  test("drops a chart whose saved_charts row is missing (cannot render)", async () => {
    const items: ProjectItem[] = [
      { ...BASE, id: "c1", kind: "chart", chart_id: "missing", title: "Gone" },
    ];
    const snap = await freezeSnapshot(stubDb([]), items);
    expect(snap).toHaveLength(0);
  });

  test("passes non-chart items through as deep copies", async () => {
    const items: ProjectItem[] = [
      {
        ...BASE,
        id: "m1",
        kind: "metric",
        report_id: "r",
        label: "Rent",
        value: "$28.40",
        freshness_token: "T",
      },
      { ...BASE, id: "n1", kind: "note", text: "office only" },
    ];
    const snap = await freezeSnapshot(stubDb([]), items);
    expect(snap).toHaveLength(2);
    // deep copy — mutating the snapshot must not touch the source
    (snap[0] as { value: string }).value = "$99";
    expect((items[0] as { value: string }).value).toBe("$28.40");
  });
});

describe("collectSnapshotNumbers", () => {
  test("gathers value strings from metric, table, chart, qa, note", () => {
    const items: SnapshotItem[] = [
      {
        ...BASE,
        id: "m",
        kind: "metric",
        report_id: "r",
        label: "Rent",
        value: "$28.40",
        freshness_token: "T",
      },
      {
        ...BASE,
        id: "t",
        kind: "table_slice",
        report_id: "r",
        title: "Abs",
        columns: ["Q", "N"],
        rows: [["Q1", 12000]],
        freshness_token: "T",
      },
      {
        ...BASE,
        id: "c",
        kind: "chart",
        chart_id: "x",
        title: "V",
        chart_block: { title: "V", columns: ["Z", "V"], rows: [["A", 4.8]] },
      },
      {
        ...BASE,
        id: "q",
        kind: "qa",
        report_id: "r",
        question: "good?",
        answer: "AAL is $30,074.",
      },
      { ...BASE, id: "n", kind: "note", text: "spend cap 10/project" },
    ];
    const nums = collectSnapshotNumbers(items);
    expect(nums).toContain("$28.40");
    expect(nums).toContain("12000");
    expect(nums).toContain("4.8");
    expect(nums.some((s) => s.includes("$30,074"))).toBe(true);
  });
});
