import { describe, it, expect } from "bun:test";
import { applyUserBrandToProject, persistClaimBrandToProfile } from "./apply-brand";
import { PROJECT_CARRY_KEYS } from "@/lib/brand/profile-ledger";

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
  // ── FM 3: the account→project copy silently narrows ────────────────────────
  //
  // THE DEFECT THIS BUILD EXISTS TO CLOSE. The carry set used to be a select
  // string (11 keys) and an object literal (14 keys) maintained BY HAND, against
  // a live table of 38 field columns — so 24 columns structurally could not
  // cross from an account to a project, and nothing anywhere noticed.
  //
  // Driven from the registry, so adding a carry-flagged field automatically
  // extends this assertion instead of quietly leaving the new field behind.
  it("writes every carry-flagged registry key — driven from the registry, not a literal", async () => {
    const { client, calls } = recorderClient();
    const fullProfile = Object.fromEntries(PROJECT_CARRY_KEYS.map((k) => [k, `v-${k}`]));

    await applyUserBrandToProject(
      client,
      "user-1",
      "proj-1",
      async () => null, // no theme override — the profile itself must supply them
      async () => fullProfile,
    );

    expect(calls).toHaveLength(1);
    const branding = (calls[0].payload as { branding: Record<string, string> }).branding;
    expect(Object.keys(branding).sort()).toEqual([...PROJECT_CARRY_KEYS].sort());
    // and it is a real copy, not just the right key set
    expect(branding.business_address).toBe("v-business_address");
    expect(branding.unsubscribe_url).toBe("v-unsubscribe_url");
  });

  it("never carries sending-identity or provenance columns into a project", async () => {
    const { client, calls } = recorderClient();
    // A profile row carrying the non-field columns alongside the real ones —
    // exactly the shape a `select *` would hand back.
    const withNonFields = {
      ...Object.fromEntries(PROJECT_CARRY_KEYS.map((k) => [k, `v-${k}`])),
      source: "email_signup",
      sender_domain_verified: true,
      sender_address: "mail@example.com",
      sender_name: "Sender",
    };

    await applyUserBrandToProject(
      client,
      "user-1",
      "proj-1",
      async () => null,
      async () => withNonFields as Record<string, string>,
    );

    const branding = (calls[0].payload as { branding: Record<string, string> }).branding;
    for (const forbidden of ["source", "sender_domain_verified", "sender_address", "sender_name"]) {
      expect(branding).not.toHaveProperty(forbidden);
    }
  });

  it("blank and missing profile values are skipped, not written as empty strings", async () => {
    const { client, calls } = recorderClient();
    await applyUserBrandToProject(
      client,
      "user-1",
      "proj-1",
      async () => null,
      async () => ({ agent_name: "Marisol Vega", brokerage: "   ", license: null }) as never,
    );
    const branding = (calls[0].payload as { branding: Record<string, string> }).branding;
    expect(branding).toEqual({ agent_name: "Marisol Vega" });
  });

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

  it("propagates bio/website/contact/address — the 7 fields that used to be silently dropped", async () => {
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

    const resolve = async () => null;
    const agentProfile = {
      agent_name: "Jane Smith",
      nickname: "Janie",
      agent_title: "Broker Associate",
      photo_url: "https://example.com/jane.jpg",
      license: "SL3456789",
      brokerage: "Gulf Realty",
      agent_bio: "Fifteen years selling the Gulf coast.",
      contact_email: "jane@gulfrealty.com",
      contact_phone: "(239) 555-0100",
      website_url: "https://janesmithrealty.com",
      business_address: "123 Main St, Fort Myers, FL 33901",
    };

    await applyUserBrandToProject(
      mockSupabase as never,
      "user-1",
      "proj-1",
      resolve,
      async () => agentProfile,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ branding: agentProfile });
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
