/**
 * Unit tests for activateSwitchPass — pass activation seam.
 * TDD: tests verify gate logic (25-contact floor), insertion with correct
 * fields and TTL, duplicate-key handling (23505), and generic error handling.
 */
import { describe, test, expect } from "bun:test";
import { activateSwitchPass, SWITCH_PASS_DAYS, MIN_SWITCH_IMPORT } from "./activate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

describe("activateSwitchPass", () => {
  test("contactsImported < MIN_SWITCH_IMPORT → below_minimum, no insert", async () => {
    const insertedRows: unknown[] = [];
    const mockDb = {
      from: (_table: string) => ({
        insert: async (row: unknown) => {
          insertedRows.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient<Database>;

    const result = await activateSwitchPass(mockDb, "user123", {
      lane: "oauth_extraction",
      platform: "google",
      contactsImported: MIN_SWITCH_IMPORT - 1,
    });

    expect(result).toEqual({ activated: false, reason: "below_minimum" });
    expect(insertedRows).toHaveLength(0);
  });

  test("contactsImported = MIN_SWITCH_IMPORT → activated true, insert with correct fields and TTL", async () => {
    const insertedRows: unknown[] = [];
    const mockDb = {
      from: (_table: string) => ({
        insert: async (row: unknown) => {
          insertedRows.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient<Database>;

    const now = new Date();
    const result = await activateSwitchPass(mockDb, "user123", {
      lane: "oauth_extraction",
      platform: "google",
      contactsImported: MIN_SWITCH_IMPORT,
      detail: { source: "test" },
    });

    expect(result).toEqual({ activated: true });
    expect(insertedRows).toHaveLength(1);

    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(inserted.user_id).toBe("user123");
    expect(inserted.tier).toBe("starter");
    expect(inserted.source_lane).toBe("oauth_extraction");
    expect(inserted.platform).toBe("google");
    expect(inserted.contacts_imported).toBe(MIN_SWITCH_IMPORT);
    expect(inserted.proof).toEqual({ source: "test" });

    // Verify expires_at is ~60 days from now (between 59 and 61 days)
    const expiresAt = new Date(inserted.expires_at as string);
    const expectedExpiresAt = new Date(now.getTime() + SWITCH_PASS_DAYS * 24 * 60 * 60 * 1000);
    const diffMs = expiresAt.getTime() - expectedExpiresAt.getTime();
    const diffDays = Math.abs(diffMs / (24 * 60 * 60 * 1000));
    expect(diffDays).toBeLessThan(1); // within 1 day
  });

  test("contactsImported > MIN_SWITCH_IMPORT → activated true, insert proceeds", async () => {
    const insertedRows: unknown[] = [];
    const mockDb = {
      from: (_table: string) => ({
        insert: async (row: unknown) => {
          insertedRows.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient<Database>;

    const result = await activateSwitchPass(mockDb, "user456", {
      lane: "forwarded_email",
      platform: "apple",
      contactsImported: MIN_SWITCH_IMPORT + 1,
    });

    expect(result).toEqual({ activated: true });
    expect(insertedRows).toHaveLength(1);

    const inserted = insertedRows[0] as Record<string, unknown>;
    expect(inserted.user_id).toBe("user456");
    expect(inserted.tier).toBe("starter");
    expect(inserted.proof).toEqual({}); // no detail provided → empty object
  });

  test("insert error code 23505 (unique key) → already_active", async () => {
    const mockDb = {
      from: (_table: string) => ({
        insert: async () => ({
          error: { code: "23505", message: "Unique key violation" },
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const result = await activateSwitchPass(mockDb, "user789", {
      lane: "oauth_extraction",
      platform: "microsoft",
      contactsImported: 30,
    });

    expect(result).toEqual({ activated: false, reason: "already_active" });
  });

  test("insert error other than 23505 → error", async () => {
    const mockDb = {
      from: (_table: string) => ({
        insert: async () => ({
          error: { code: "22P02", message: "Invalid input syntax" },
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const result = await activateSwitchPass(mockDb, "user999", {
      lane: "oauth_extraction",
      platform: "google",
      contactsImported: 40,
    });

    expect(result).toEqual({ activated: false, reason: "error" });
  });
});
