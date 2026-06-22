import { describe, it, expect } from "bun:test";
import { applyUserBrandToProject, persistClaimBrandToProfile } from "./apply-brand";

/** A minimal recorder standing in for the supabase update chain. */
function recorderClient() {
  const calls: { table: string; payload: unknown; eqCol: string; eqVal: string }[] = [];
  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          return {
            eq(eqCol: string, eqVal: string) {
              calls.push({ table, payload, eqCol, eqVal });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

describe("applyUserBrandToProject", () => {
  it("writes branding with the canonical color/logo keys when a brand resolves", async () => {
    const { client, calls } = recorderClient();
    await applyUserBrandToProject(client, "user-1", "proj-1", async () => ({
      primary: "#0f1d24",
      accent: "#c9a24b",
      logoUrl: "https://cdn/logo.png",
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("projects");
    expect(calls[0].eqCol).toBe("id");
    expect(calls[0].eqVal).toBe("proj-1");
    expect(calls[0].payload).toEqual({
      branding: {
        primary_color: "#0f1d24",
        accent_color: "#c9a24b",
        logo_url: "https://cdn/logo.png",
      },
    });
  });

  it("writes nothing when the user has no brand profile", async () => {
    const { client, calls } = recorderClient();
    await applyUserBrandToProject(client, "user-1", "proj-1", async () => null);
    expect(calls).toHaveLength(0);
  });

  it("never throws when brand resolution fails (best-effort, not a gate)", async () => {
    const { client } = recorderClient();
    await expect(
      applyUserBrandToProject(client, "user-1", "proj-1", async () => {
        throw new Error("boom");
      }),
    ).resolves.toBeUndefined();
  });

  // --- agent fields ---

  it("propagates agent fields from user_brand_profiles when present", async () => {
    const updates: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
            single: async () => ({ data: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    const resolve = async () => null; // no theme brand
    const agentProfile = {
      agent_name: "Jane Smith",
      photo_url: "https://example.com/jane.jpg",
      license: "SL3456789",
      brokerage: "Gulf Realty",
    };

    // We need to mock the agent profile lookup. The simplest way:
    // patch applyUserBrandToProject to accept an optional agentLookup param for tests.
    // See the implementation step — the function signature gains an optional 4th param.
    await applyUserBrandToProject(
      mockSupabase as never,
      "user-1",
      "proj-1",
      resolve,
      async () => agentProfile,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      branding: {
        agent_name: "Jane Smith",
        photo_url: "https://example.com/jane.jpg",
        license: "SL3456789",
        brokerage: "Gulf Realty",
      },
    });
  });

  it("merges agent fields with theme brand when both exist", async () => {
    const updates: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
            single: async () => ({ data: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    const resolve = async () => ({ primary: "#00d4aa", accent: null, logoUrl: null });
    await applyUserBrandToProject(mockSupabase as never, "user-1", "proj-1", resolve, async () => ({
      agent_name: "Jane",
      photo_url: null,
      license: "SL99",
      brokerage: "Gulf",
    }));

    expect(updates[0]).toMatchObject({
      branding: {
        primary_color: "#00d4aa",
        agent_name: "Jane",
        license: "SL99",
        brokerage: "Gulf",
      },
    });
  });

  it("skips the update entirely when both theme and agent are null", async () => {
    const updates: Record<string, unknown>[] = [];
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
            single: async () => ({ data: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    await applyUserBrandToProject(
      mockSupabase as never,
      "user-1",
      "proj-1",
      async () => null,
      async () => ({ agent_name: null, photo_url: null, license: null, brokerage: null }),
    );

    expect(updates).toHaveLength(0);
  });
});

/** Recorder for the persist path: a configurable existing profile + captured upserts. */
function profileClient(existing: Record<string, unknown> | null) {
  const upserts: { payload: Record<string, unknown>; opts: unknown }[] = [];
  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: existing }) };
            },
          };
        },
        upsert(payload: Record<string, unknown>, opts: unknown) {
          upserts.push({ payload, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, upserts };
}

describe("persistClaimBrandToProfile", () => {
  it("creates a profile mapping carried brand → canonical color keys when none exists", async () => {
    const { client, upserts } = profileClient(null);
    await persistClaimBrandToProfile(client, "user-1", {
      primary: "#7c3aed",
      secondary: "#f59e0b",
      logo_url: "https://cdn/fake.png",
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toMatchObject({
      user_id: "user-1",
      primary_color: "#7c3aed",
      accent_color: "#f59e0b",
      logo_url: "https://cdn/fake.png",
    });
    expect(upserts[0].opts).toEqual({ onConflict: "user_id" });
  });

  it("does NOT clobber a profile the user already branded (first brand wins)", async () => {
    const { client, upserts } = profileClient({
      primary_color: "#000000",
      accent_color: null,
      logo_url: null,
    });
    await persistClaimBrandToProfile(client, "user-1", { primary: "#7c3aed" });
    expect(upserts).toHaveLength(0);
  });

  it("fills an empty (rows-exist-but-blank) profile", async () => {
    const { client, upserts } = profileClient({
      primary_color: null,
      accent_color: null,
      logo_url: null,
    });
    await persistClaimBrandToProfile(client, "user-1", { primary: "#7c3aed" });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toMatchObject({ user_id: "user-1", primary_color: "#7c3aed" });
  });

  it("writes nothing when there is no carried brand", async () => {
    const { client, upserts } = profileClient(null);
    await persistClaimBrandToProfile(client, "user-1", null);
    await persistClaimBrandToProfile(client, "user-1", {});
    expect(upserts).toHaveLength(0);
  });

  it("never throws when the profile read/write fails (best-effort, not a gate)", async () => {
    const throwing = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    throw new Error("boom");
                  },
                };
              },
            };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    await expect(
      persistClaimBrandToProfile(throwing, "user-1", { primary: "#7c3aed" }),
    ).resolves.toBeUndefined();
  });
});
