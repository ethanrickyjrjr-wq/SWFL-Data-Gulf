import { test, expect, mock, beforeEach } from "bun:test";
import type { ReactElement } from "react";
import ContactsClient from "./ContactsClient";

// Mutable scenario the mocked cookie client reads — lets each test vary auth.
// Mirrors app/api/me/route.test.ts + app/api/contacts/route.test.ts.
const scenario: { user: { id: string } | null } = { user: null };

mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/utils/supabase/server", () => ({
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
mock.module("next/navigation", () => ({ redirect: redirectMock }));

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
