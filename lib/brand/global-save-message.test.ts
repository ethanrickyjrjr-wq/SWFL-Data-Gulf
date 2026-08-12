// lib/brand/global-save-message.test.ts
import { describe, expect, it } from "bun:test";
import { brandGlobalSaveMessage, resolveBrandGlobalSave } from "./global-save-message";

describe("brandGlobalSaveMessage", () => {
  it("reports plain success when the account sync also succeeded", () => {
    expect(brandGlobalSaveMessage(true)).toBe("Branding saved");
  });

  it("surfaces a distinguishable warning when the account sync failed silently", () => {
    const msg = brandGlobalSaveMessage(false);
    expect(msg).not.toBe("Branding saved");
    expect(msg).toBe("Branding saved to this project (account sync failed)");
  });
});

// Regression coverage for branding_global_save_ux: saveBrandGlobal() used to
// `void fetch(...)` the account-level sync with no result check, so a failed
// account sync was reported to the user as a plain "Branding saved" success.
describe("resolveBrandGlobalSave", () => {
  it("BUG: account sync fails, project save succeeds — still resolves true, but warns instead of the plain success message", async () => {
    const messages: string[] = [];
    const ok = await resolveBrandGlobalSave({
      saveProject: async () => true,
      syncAccount: async () => false,
      setMessage: (m) => messages.push(m),
    });
    expect(ok).toBe(true); // project save is the authoritative gate — never blocked
    expect(messages).toEqual(["Branding saved to this project (account sync failed)"]);
  });

  it("both succeed: no override message is set (patch()'s own 'Branding saved' stands)", async () => {
    const messages: string[] = [];
    const ok = await resolveBrandGlobalSave({
      saveProject: async () => true,
      syncAccount: async () => true,
      setMessage: (m) => messages.push(m),
    });
    expect(ok).toBe(true);
    expect(messages).toEqual([]);
  });

  it("project save fails: returns false and never overrides with the account-sync warning", async () => {
    const messages: string[] = [];
    const ok = await resolveBrandGlobalSave({
      saveProject: async () => false,
      syncAccount: async () => false,
      setMessage: (m) => messages.push(m),
    });
    expect(ok).toBe(false);
    expect(messages).toEqual([]);
  });
});
