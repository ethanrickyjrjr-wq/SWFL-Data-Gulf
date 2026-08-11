// lib/lab-entry/use-leave-guard.test.ts
//
// navGuardEnabled is the ONE predicate handed to nextjs-nav-guard's `enabled`
// option. The provider consults it from TWO places: internal App Router nav
// AND its own page-unload listener (useInterceptPageUnload) — a SECOND
// beforeunload listener that guard.bypass() cannot reach. On 08/10/2026 that
// second listener threw Chrome's native "Leave site?" dialog at our own
// user-confirmed hop into a project, after the address popup, on an untouched
// canvas. These tests pin the contract that makes that impossible.
import { describe, expect, it } from "bun:test";
import { navGuardEnabled } from "./use-leave-guard";

describe("navGuardEnabled", () => {
  it('NEVER lets the package handle type:"beforeunload" — our own dirty-only listener owns that layer', () => {
    // Even dirty with no bypass: the package's unload listener must stand down,
    // or it re-raises the native dialog our bypass() just disarmed.
    expect(navGuardEnabled("beforeunload", false, true)).toBe(false);
    expect(navGuardEnabled("beforeunload", true, true)).toBe(false);
    expect(navGuardEnabled("beforeunload", false, false)).toBe(false);
  });

  it("guards internal nav only while dirty", () => {
    expect(navGuardEnabled("push", false, true)).toBe(true);
    expect(navGuardEnabled("popstate", false, true)).toBe(true);
    expect(navGuardEnabled("push", false, false)).toBe(false);
  });

  it("a user-confirmed hop (bypass) is never guarded, dirty or not", () => {
    expect(navGuardEnabled("push", true, true)).toBe(false);
    expect(navGuardEnabled("replace", true, true)).toBe(false);
  });
});
