// lib/brand/bank-brand-fields.test.ts
import { describe, expect, it } from "bun:test";
import { bankBrandFields } from "./bank-brand-fields";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeSupabase(existing: Record<string, unknown> | null) {
  const calls: { upserted: Record<string, unknown> | null } = { upserted: null };
  const client = {
    from(table: string) {
      expect(table).toBe("user_brand_profiles");
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: existing }) };
            },
          };
        },
        upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
          expect(opts.onConflict).toBe("user_id");
          calls.upserted = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("bankBrandFields", () => {
  it("fills only blank account fields, never overwrites", async () => {
    const { client, calls } = fakeSupabase({ agent_name: "Marisol Vega", brokerage: "" });
    await bankBrandFields(client, "u1", {
      agent_name: "SOMEONE ELSE",
      brokerage: "Vega Realty",
      business_address: "123 Palm Ave, Fort Myers FL",
    });
    expect(calls.upserted).toMatchObject({
      user_id: "u1",
      brokerage: "Vega Realty",
      business_address: "123 Palm Ave, Fort Myers FL",
    });
    expect(calls.upserted).not.toHaveProperty("agent_name");
  });

  it("no existing row: everything banks", async () => {
    const { client, calls } = fakeSupabase(null);
    await bankBrandFields(client, "u1", { agent_name: "Marisol Vega" });
    expect(calls.upserted).toMatchObject({ user_id: "u1", agent_name: "Marisol Vega" });
  });

  it("ignores non-ledger keys, empty values, and non-strings", async () => {
    const { client, calls } = fakeSupabase(null);
    await bankBrandFields(client, "u1", {
      hacker_field: "x",
      agent_name: "   ",
      brokerage: 42,
    });
    expect(calls.upserted).toBeNull(); // nothing bankable → no write at all
  });

  it("never throws on a failing client", async () => {
    const broken = {
      from() {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    await expect(bankBrandFields(broken, "u1", { agent_name: "X" })).resolves.toBeUndefined();
  });
});
