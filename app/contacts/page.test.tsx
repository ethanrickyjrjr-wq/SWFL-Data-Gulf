import { test, expect, mock, beforeEach, afterAll } from "bun:test";
import type { ReactElement } from "react";
import ContactsClient from "./ContactsClient";

// Mutable scenario the mocked cookie client reads — lets each test vary auth.
// Mirrors app/api/me/route.test.ts + app/api/contacts/route.test.ts.
const scenario: { user: { id: string } | null } = { user: null };

// bun's mock.module is PROCESS-GLOBAL and never auto-restored, and a factory
// REPLACES the whole module rather than patching it. Both halves bit CI here:
// the in-repo stub leaked (lib/testing/mock-restore-ratchet.test.ts), and the
// bare `next/navigation` factory below deleted notFound/useRouter/usePathname
// for every file that ran after this one — 5 files died with
// "SyntaxError: Export named 'notFound' not found" on 08/12/2026 while the
// local run was green, because file order differs between Windows and Linux.
// So: snapshot each real module BEFORE mocking, spread it into the stub so the
// untouched exports survive, and hand the real module back in afterAll.
const realHeaders = { ...(await import("next/headers")) };
const realNavigation = { ...(await import("next/navigation")) };
const realSupabaseServer = { ...(await import("@/utils/supabase/server")) };
afterAll(() => {
  mock.module("next/headers", () => realHeaders);
  mock.module("next/navigation", () => realNavigation);
  mock.module("@/utils/supabase/server", () => realSupabaseServer);
});

mock.module("next/headers", () => ({ ...realHeaders, cookies: async () => ({}) }));
mock.module("@/utils/supabase/server", () => ({
  ...realSupabaseServer,
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
  }),
}));

// Real next/navigation redirect() throws a NEXT_REDIRECT-shaped error to abort
// the render — mirror that here so a signed-out call can't fall through to
// `return <ContactsClient />` the way a no-op mock would let it.
const redirectMock = mock((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
mock.module("next/navigation", () => ({ ...realNavigation, redirect: redirectMock }));

const { default: ContactsPage } = await import("./page");

beforeEach(() => {
  scenario.user = null;
  redirectMock.mockClear();
});

test("signed-out visitor to /contacts is redirected to /login, never renders the client page", async () => {
  scenario.user = null;
  await expect(ContactsPage()).rejects.toThrow("REDIRECT:/login?next=/contacts");
  expect(redirectMock).toHaveBeenCalledWith("/login?next=/contacts");
});

test("signed-in user renders ContactsClient, no redirect", async () => {
  scenario.user = { id: "u1" };
  const el = (await ContactsPage()) as ReactElement;
  expect(redirectMock).not.toHaveBeenCalled();
  expect(el.type).toBe(ContactsClient);
});
